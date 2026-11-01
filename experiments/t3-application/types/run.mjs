import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';

const base = new URL('.', import.meta.url), compiler = new URL('node_modules/typescript/bin/tsc', base);
const tsPackage = JSON.parse(await readFile(new URL('node_modules/typescript/package.json', base), 'utf8'));
const lock = JSON.parse(await readFile(new URL('package-lock.json', base), 'utf8'));
const compilerCLI = spawnSync(process.execPath, [compiler.pathname, '--version'], { cwd: base, encoding: 'utf8' });
const negative = await readFile(new URL('negative.ts', base), 'utf8');
const lines = negative.split('\n'), cases = [];
for (let index = 0; index < lines.length; ++index) {
  const match = /^\/\/ @ts-expect-error ([A-Z0-9_]+) - /.exec(lines[index]);
  if (match) cases.push({ id: match[1], line: index + 2, source: lines[index + 1] });
}
if (!cases.length || new Set(cases.map(row => row.id)).size !== cases.length) throw Error('Missing or duplicate negative case IDs');
const temporarySource = `.negative-unmasked-${process.pid}.ts`, temporaryConfig = `.tsconfig-unmasked-${process.pid}.json`;
const diagnostics = output => [...output.matchAll(/^(.+)\((\d+),(\d+)\): error TS(\d+): (.*)$/gm)].map(match => ({ file: basename(match[1]), line: Number(match[2]), column: Number(match[3]), code: Number(match[4]), message: match[5] }));
function compile(project) {
  const args = [compiler.pathname, '--noEmit', '--strict', '--pretty', 'false', '--project', project];
  const result = spawnSync(process.execPath, args, { cwd: base, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { command: [process.execPath, ...args], exitCode: result.status, signal: result.signal, diagnostics: diagnostics(output),
    ...(result.error ? { launchError: result.error.message } : {}), ...(output && !diagnostics(output).length ? { unparsedOutput: output } : {}) };
}
let outcome;
try {
  await writeFile(new URL(temporarySource, base), negative.replaceAll('@ts-expect-error', 'error-marker-removed'));
  await writeFile(new URL(temporaryConfig, base), JSON.stringify({ extends: './tsconfig.json', files: ['contracts.ts', temporarySource] }));
  const positive = compile('tsconfig.positive.json'), guardedNegative = compile('tsconfig.json'), unmaskedNegative = compile(temporaryConfig), runtimeLimits = compile('tsconfig.limits.json');
  const expectedLines = new Set(cases.map(row => row.line));
  const unexpected = unmaskedNegative.diagnostics.filter(row => row.file !== temporarySource || !expectedLines.has(row.line));
  const negativeCases = cases.map(row => ({ ...row, diagnostics: unmaskedNegative.diagnostics.filter(diagnostic => diagnostic.file === temporarySource && diagnostic.line === row.line),
    detected: unmaskedNegative.diagnostics.some(diagnostic => diagnostic.file === temporarySource && diagnostic.line === row.line) }));
  const summary = { compilerPinMatches: compilerCLI.status === 0 && compilerCLI.stdout.trim() === 'Version 5.9.3' && tsPackage.version === '5.9.3' && lock.packages['node_modules/typescript'].version === '5.9.3',
    positiveCompilationPassed: positive.exitCode === 0, guardedNegativeCompilationPassed: guardedNegative.exitCode === 0,
    negativeCasesExpected: cases.length, negativeCasesDetected: negativeCases.filter(row => row.detected).length,
    unusedExpectErrorDirectives: guardedNegative.diagnostics.filter(row => row.code === 2578).length,
    unexpectedDiagnostics: unexpected.length, unmaskedNegativeRejected: unmaskedNegative.exitCode === 2,
    runtimeLimitExamplesCompile: runtimeLimits.exitCode === 0 };
  const passed = summary.compilerPinMatches && summary.positiveCompilationPassed && summary.guardedNegativeCompilationPassed
    && summary.negativeCasesDetected === summary.negativeCasesExpected && summary.unusedExpectErrorDirectives === 0
    && summary.unexpectedDiagnostics === 0 && summary.unmaskedNegativeRejected && summary.runtimeLimitExamplesCompile;
  const sources = ['contracts.ts', 'positive.ts', 'negative.ts', 'runtime-limits.ts', 'run.mjs', 'tsconfig.json', 'tsconfig.positive.json', 'tsconfig.limits.json', 'package.json', 'package-lock.json',
    '../../../docs/spec/07-host-integration.md', '../../../docs/spec/04-action.md', '../../../docs/spec/02-query.md', '../../../docs/spec/10-value-contracts.md'];
  const sourceSha256 = {};
  for (const source of sources) {
    sourceSha256[source] = createHash('sha256').update(await readFile(new URL(source, base))).digest('hex');
  }
  const compilerSha256 = {};
  for (const file of ['node_modules/typescript/bin/tsc', 'node_modules/typescript/lib/tsc.js', 'node_modules/typescript/lib/_tsc.js', 'node_modules/typescript/lib/typescript.js']) compilerSha256[file] = createHash('sha256').update(await readFile(new URL(file, base))).digest('hex');
  outcome = { generatedAt: new Date().toISOString(), runtime: process.version, typescript: tsPackage.version,
    compilerCLI: compilerCLI.stdout.trim(), packageLockSha256: sourceSha256['package-lock.json'],
    scope: 'Compile-only private SDK contract fixture; no runtime/library SDK connection or execution.',
    dependency: lock.packages['node_modules/typescript'], sourceSha256, compilerSha256, passed, summary,
    stages: { positive, guardedNegative, unmaskedNegative, runtimeLimits }, negativeCases,
    runtimeLimits: ['Arbitrary schema/typeRef semantics and generic/schema relationship', 'Finite/safe numeric range', 'Dynamic reference registration, authority and lifetime', 'Previously erased () => void callback actual return value'], unexpected };
  await mkdir(new URL('results/', base), { recursive: true });
  await writeFile(new URL(`results/${process.argv[2] ?? `node${process.versions.node.split('.')[0]}.json`}`, base), JSON.stringify(outcome, null, 2) + '\n');
  console.log(JSON.stringify({ runtime: outcome.runtime, typescript: outcome.typescript, passed, summary }));
  if (!passed) { console.error(JSON.stringify({ stages: outcome.stages, missing: negativeCases.filter(row => !row.detected), unexpected })); process.exitCode = 1; }
} finally { await Promise.all([temporarySource, temporaryConfig].map(file => unlink(new URL(file, base)).catch(() => {}))); }
