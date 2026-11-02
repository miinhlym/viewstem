import { basename } from 'node:path';
import { auditRows, auditSummary, validateReport } from './test-reports.mjs';

// Node's native runner remains the source of pass/fail. This second reporter
// records exact test names and refuses to call a partial family run complete.
export default async function* report(source) {
  const metadata = JSON.parse(process.env.VIEWSTEM_UI_REPORT);
  const outcomes = [];
  let summary;
  for await (const event of source) {
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      const { name, file, line, column, skip, todo, details } = event.data;
      outcomes.push({ name, file: file ? basename(file) : null, line, column, status: skip ? 'skipped' : todo ? 'todo' : event.type === 'test:pass' ? 'passed' : 'failed', durationMs: details?.duration_ms,
        ...(details?.error ? { error: String(details.error.stack ?? details.error) } : {}),
      });
    }
    if (event.type === 'test:summary') summary = event.data;
  }
  const audit = auditSummary(outcomes, await auditRows());
  const report = { format: 2, ...metadata, recordedAtUtc: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch, summary, audit, outcomes };
  yield JSON.stringify(report, null, 2) + '\n';
  validateReport(report, metadata.scope, metadata);
  if (metadata.scope.index === null && audit.missing.length) throw Error(`Unverified shadcn family behavior cases: ${audit.missing.join('; ')}`);
}
