import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readPlan, scopeFor, sourceIdentity } from './test-reports.mjs';

const cwd = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../test/results/', import.meta.url), { recursive: true });
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && !args[0].startsWith('--shard='))) throw Error('Usage: run-tests.mjs [--shard=N/M]');
const scope = scopeFor(await readPlan(), args[0]?.slice('--shard='.length));
const output = `test/results/${scope.index === null ? 'current' : `shard-${scope.index}-of-${scope.total}`}.json`;
await rm(new URL('../' + output, import.meta.url), { force: true });
const identity = await sourceIdentity();
const child = spawn(process.execPath, [
  '--test', '--test-concurrency=1',
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=./scripts/audit-reporter.mjs', `--test-reporter-destination=${output}`,
  ...scope.files.map(name => 'test/' + name),
], { cwd, stdio: 'inherit', env: { ...process.env, VIEWSTEM_UI_REPORT: JSON.stringify({ scope, ...identity }) } });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
