import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export function harness() {
  const results = [];
  const test = async (id, run) => {
    try { await run(); results.push({ id, passed: true }); }
    catch (error) { results.push({ id, passed: false, error: { name: error.name, message: error.message, stack: error.stack } }); }
  };
  return { results, test };
}

export async function report({ base, name, scope, results, sources, extra = {} }) {
  const sourceSha256 = {};
  for (const source of sources) sourceSha256[source] = createHash('sha256').update(await readFile(new URL(source, base))).digest('hex');
  const summary = { executed: results.length, passed: results.filter(row => row.passed).length, failed: results.filter(row => !row.passed).length };
  const value = { generatedAt: new Date().toISOString(), runtime: process.version, icu: process.versions.icu, tz: process.versions.tz,
    scope, sourceSha256, ...extra, summary, results };
  await mkdir(new URL('results/', base), { recursive: true });
  await writeFile(new URL(`results/${name}`, base), JSON.stringify(value, null, 2) + '\n');
  console.log(JSON.stringify({ name, summary, failures: results.filter(row => !row.passed) }));
  if (summary.failed) process.exitCode = 1;
  return value;
}
