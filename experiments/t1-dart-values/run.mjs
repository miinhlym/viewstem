import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { preparePatch } from '../t1-cel-patch/prepare.mjs';
import { observeJS } from './js-oracle.mjs';
import { report } from '../verification/report.mjs';
const base = import.meta.url, hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtures = JSON.parse(await readFile(new URL('fixtures.json', base), 'utf8')).cases;
const name = process.argv[2] ?? 'node24.json';
await mkdir(new URL('results/', base), { recursive: true });
const dartOutput = new URL(`results/dart-${name}`, base);
const execution = spawnSync('dart', ['run', 'bin/probe.dart', new URL('fixtures.json', base).pathname, dartOutput.pathname], { cwd: new URL('.', base), encoding: 'utf8', timeout: 60000 });
if (execution.status !== 0) throw Error(`DART_FAILED:${execution.stdout}${execution.stderr}`);
const dart = JSON.parse(await readFile(dartOutput, 'utf8'));
const prepared = await preparePatch(), { Environment } = await import(prepared.entry.href);
const rows = [], mismatches = [];
for (let index = 0; index < fixtures.length; index++) {
  const fixture = fixtures[index], js = await observeJS(fixture, Environment), actualDart = dart.rows[index];
  if (actualDart.id !== fixture.id) throw Error('DART_FIXTURE_ORDER_MISMATCH');
  const comparisons = [['js', js], ['dart', actualDart.actual]];
  for (const [engine, actual] of comparisons) {
    const passed = isDeepStrictEqual(actual, fixture.expected);
    const row = { id: `${engine}/${fixture.id}`, passed, expected: fixture.expected, actual, ...(actualDart.unexpected && engine === 'dart' ? { unexpected: actualDart.unexpected } : {}) };
    rows.push(row); if (!passed) mismatches.push(row);
  }
  rows.push({ id: `cross/${fixture.id}`, passed: isDeepStrictEqual(js, actualDart.actual) });
}
const config = JSON.parse(await readFile(new URL('.dart_tool/package_config.json', base), 'utf8'));
const zone = config.packages.find(item => item.name === 'timezone'), packageRoot = new URL(zone.rootUri.endsWith('/') ? zone.rootUri : `${zone.rootUri}/`, new URL('.dart_tool/package_config.json', base));
const timezoneFiles = {};
for (const path of ['pubspec.yaml', 'lib/data/latest.dart', 'lib/src/location.dart', 'lib/src/date_time.dart']) timezoneFiles[path] = hash(await readFile(new URL(path, packageRoot)));
const databaseHeader = (await readFile(new URL('lib/data/latest.dart', packageRoot), 'utf8')).split('\n').slice(0, 3).join('\n');
const candidateBytes = await readFile(new URL('../t1-values/results/dart.json', base));
const candidate = JSON.parse(candidateBytes), candidateRows = candidate.rows ?? candidate.results ?? [];
const candidateMismatches = candidateRows.filter(row => !isDeepStrictEqual(row.expected, row.actual));
await report({ base, name, scope: 'Independent direct-schema value/normalization/readiness/date fixture model, JS State/schema/native adapter versus Dart VM native values; not Dart CEL or core implementation', results: rows,
  sources: ['run.mjs', 'js-oracle.mjs', 'build-fixtures.mjs', 'fixtures.json', 'bin/probe.dart', 'pubspec.yaml', 'pubspec.lock', 'README.md', 'coverage.json', '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package.json', '../t1-values/package-lock.json', '../t3-state/state-probe.mjs', '../t3-state/immutable.mjs', '../t3-state/ports-probe.mjs', '../t1-native-cel/adapter.mjs', '../t1-cel-patch/prepare.mjs', '../t1-cel-patch/cel-js-8.0.0.patch', '../t1-cel-patch/upstream-sha256.json', '../t1-cel-patch/patched-sha256.json', '../t1-cel-patch/package.json', '../t1-cel-patch/package-lock.json', '../verification/report.mjs', '../verification/errors.mjs'],
  extra: { fixtureCount: fixtures.length, populations: { js: fixtures.length, dart: fixtures.length, crossComparison: fixtures.length }, dart: { runtime: dart.runtime, os: dart.os, nativeDateTimeParseRollsInvalidDay: dart.nativeDateTimeParseRollsInvalidDay, actualFile: `results/dart-${name}`, actualSha256: hash(await readFile(dartOutput)) }, timezone: { package: 'timezone', version: '0.11.2', databaseHeader, sourceSha256: timezoneFiles, nodeTz: process.versions.tz }, patchSha256: prepared.patchSha256, preservedCELCandidate: { source: '../t1-values/results/dart.json', sha256: hash(candidateBytes), mismatches: candidateMismatches.length, unchangedByThisExperiment: true }, limitations: ['No Dart CEL evaluator is imported; existing cel 0.6.1 candidate differences remain', 'Fixture tags/ref IDs are private test construction, not production transport', 'Direct typed schema subset only, not full JSON Schema registration or conversion', 'Dart VM only; no Flutter/web runtime evidence', 'Readiness is a small explicit host-value model, not reactive scheduling', 'Timezone cases are representative; Node and Dart data versions differ'] } });
console.log(JSON.stringify({ fixtureCount: fixtures.length, mismatches: mismatches.map(row => ({ id: row.id, expected: row.expected, actual: row.actual, ...(row.unexpected ? { unexpected: row.unexpected } : {}) })) }));
