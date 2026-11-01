import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { acceptDirect, normalizeDate, localInstant } from './values.mjs';

const results = [];
const test = (id, run) => {
  try { run(); results.push({ id, passed: true }); }
  catch (error) { results.push({ id, passed: false, error: { name: error.name, message: error.message } }); }
};
for (const [kind, input, canonical] of [
  ['date', '2000-02-29', '2000-02-29'], ['time', '09:30', '09:30:00.000'],
  ['datetime', '2026-10-30T09:30:00+09:00', '2026-10-30T00:30:00.000Z'],
]) {
  const schema = extra => ({ 'x-viewstem-type': kind, ...extra });
  test(`${kind}/canonical-const`, () => assert.equal(acceptDirect(input, schema({ const: canonical })), canonical));
  for (const [key, constraint] of [['const', 'unmatched'], ['enum', ['unmatched']], ['pattern', '^impossible$'],
    ['minLength', 100], ['maxLength', 1]]) {
    test(`${kind}/reject-${key}`, () => assert.throws(() => acceptDirect(input, schema({ [key]: constraint }))));
  }
  test(`${kind}/canonical-length`, () => assert.equal(acceptDirect(input, schema({ minLength: canonical.length, maxLength: canonical.length })), canonical));
  test(`${kind}/nullable`, () => assert.equal(acceptDirect(null, { anyOf: [schema(), { type: 'null' }] }), null));
}
for (const [kind, value] of [
  ['date', '1900-02-29'], ['date', '0000-01-01'], ['date', '2026-04-31'],
  ['time', '24:00'], ['time', '23:59:60'], ['time', '00:00:00.1234'],
  ['datetime', '0001-01-01T00:00:00+14:00'], ['datetime', '9999-12-31T23:59:59-12:00'],
  ['datetime', '2026-10-30T00:00:00-00:00'],
]) test(`${kind}/invalid-${value}`, () => assert.throws(() => normalizeDate(value, kind)));
for (const [id, date, time, zone] of [
  ['utc-underflow', '0001-01-01', '00:00', 'Etc/GMT-14'],
  ['utc-overflow', '9999-12-31', '23:59', 'Etc/GMT+12'],
  ['dst-gap', '2026-03-08', '02:30', 'America/New_York'],
  ['dst-overlap', '2026-11-01', '01:30', 'America/New_York'],
]) test(`local/${id}`, () => assert.throws(() => localInstant(date, time, zone)));
test('local/normal', () => assert.equal(localInstant('2026-10-30', '09:30', 'Asia/Seoul'), '2026-10-30T00:30:00.000Z'));
test('datetime/offset-const-is-not-normalized-as-schema', () => assert.throws(() => acceptDirect('2026-10-30T09:30:00+09:00', {
  'x-viewstem-type': 'datetime', const: '2026-10-30T09:30:00+09:00',
})));
const sourceSha256 = {};
for (const name of ['date-boundaries.mjs', 'values.mjs', 'schema-profile.mjs', 'package.json', 'package-lock.json']) {
  sourceSha256[name] = createHash('sha256').update(await readFile(new URL(name, import.meta.url))).digest('hex');
}
const report = { generatedAt: new Date().toISOString(), runtime: process.version, icu: process.versions.icu, tz: process.versions.tz,
  scope: 'Existing direct date-schema and local-time adapters; not CEL/Dart/core/HTTP/URL date integration', sourceSha256, results,
  summary: { executed: results.length, passed: results.filter(row => row.passed).length, failed: results.filter(row => !row.passed).length } };
await writeFile(new URL(`results/${process.argv[2] ?? 'date-boundaries-node24.json'}`, import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, failures: results.filter(row => !row.passed) }));
if (report.summary.failed) process.exitCode = 1;
