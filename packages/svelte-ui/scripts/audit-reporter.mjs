import { readFile } from 'node:fs/promises';

// Node's native runner remains the source of pass/fail. This second reporter
// records exact test names and refuses to call a partial family run complete.
export default async function* report(source) {
  const outcomes = [];
  let summary;
  for await (const event of source) {
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      const { name, file, line, column, skip, todo, details } = event.data;
      outcomes.push({ name, file, line, column, status: skip ? 'skipped' : todo ? 'todo' : event.type === 'test:pass' ? 'passed' : 'failed', durationMs: details?.duration_ms,
        ...(details?.error ? { error: String(details.error.stack ?? details.error) } : {}),
      });
    }
    if (event.type === 'test:summary') summary = event.data;
  }
  const rows = (await Promise.all(['controls', 'overlays', 'display'].map(async group => JSON.parse(await readFile(new URL(`../test/fixtures/audit-${group}.json`, import.meta.url), 'utf8'))))).flat();
  const passed = new Set(outcomes.filter(test => test.status === 'passed').map(test => test.name));
  const missing = rows.flatMap(row => row.testNames.filter(name => !passed.has(name)));
  const report = { recordedAtUtc: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch, summary, audit: { families: rows.length, passedFamilies: rows.filter(row => row.testNames.every(name => passed.has(name))).length, requiredCases: rows.reduce((n, row) => n + row.testNames.length, 0), missing }, outcomes };
  yield JSON.stringify(report, null, 2) + '\n';
  if (missing.length) throw Error(`Unverified shadcn family behavior cases: ${missing.join('; ')}`);
}
