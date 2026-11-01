import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Structural evidence audit, not a substitute for inspecting clause coverage.
const root = fileURLToPath(new URL('../../', import.meta.url));
const input = 'experiments/verification/coverage.json';
const inventory = JSON.parse(await readFile(path.join(root, input), 'utf8'));
const expected = Object.entries({ C: 17, S: 6, Q: 22, H: 9, A: 25, U: 13, M: 7, L: 13, V: 62, N: 5, K: 37, X: 8 }).flatMap(([prefix, count]) => Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`));
const problems = [], reports = new Map(), files = new Map(), checks = [];
async function bytes(file) {
  if (!files.has(file)) files.set(file, readFile(path.resolve(root, file)).catch(() => null));
  return files.get(file);
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const id of expected) if (inventory.records.filter(row => row.id === id).length !== 1) problems.push({ kind: 'inventory-id', id });
const entries = [...inventory.records, ...(inventory.supportingEvidence ?? []).map(({ id, ...evidence }) => ({ id, supplementary: true, evidence: [evidence] }))];
for (const row of entries) {
  if (!row.supplementary) {
    if (!expected.includes(row.id)) problems.push({ kind: 'unexpected-id', id: row.id });
    const source = await bytes(row.source), lines = source?.toString().split('\n');
    const actualLine = lines?.findIndex(line => line.startsWith(`| ${row.id} |`));
    if (!lines || actualLine < 0 || actualLine + 1 !== row.sourceLine || lines[actualLine] !== row.contractRow) problems.push({ kind: 'contract-location', id: row.id, expectedLine: actualLine + 1 });
  }
  if (!row.evidence.length) problems.push({ kind: 'empty-evidence', id: row.id });
  for (const [index, evidence] of row.evidence.entries()) {
    for (const source of [...(evidence.sources ?? []), ...(evidence.source ? [evidence.source] : []), ...(evidence.audit ? [evidence.audit] : [])]) {
      if (!await bytes(source)) problems.push({ kind: 'missing-source', id: row.id, index, source });
    }
    const found = new Map((evidence.testIds ?? []).map(id => [id, []]));
    if (!found.size || !evidence.results?.length) problems.push({ kind: 'missing-evidence-ids', id: row.id, index });
    for (const reportPath of evidence.results ?? []) {
      if (!reports.has(reportPath)) {
        const content = await bytes(reportPath);
        let report;
        try { report = content ? JSON.parse(content) : null; } catch { report = null; }
        reports.set(reportPath, report);
        if (!report) problems.push({ kind: 'missing-result', result: reportPath });
        else {
          const hashes = Object.entries(report.sourceSha256 ?? {});
          if (!hashes.length) problems.push({ kind: 'missing-source-hashes', result: reportPath });
          for (const [source, expectedHash] of hashes) {
            const file = path.normalize(path.join(path.dirname(path.dirname(reportPath)), source)), content = await bytes(file);
            if (!content || hash(content) !== expectedHash) problems.push({ kind: 'source-hash', result: reportPath, source: file, missing: !content });
          }
        }
      }
      const report = reports.get(reportPath);
      for (const result of report?.results ?? report?.rows ?? report?.negativeCases ?? []) {
        // TypeScript negative cases are actual diagnostics at the expected lines.
        const passed = result.passed ?? result.matches ?? result.matched ?? (result.detected !== undefined ? result.detected && report.passed : undefined);
        if (found.has(result.id)) found.get(result.id).push({ report: reportPath, passed });
      }
    }
    for (const [testId, matches] of found) {
      if (!matches.length) problems.push({ kind: 'missing-test-id', id: row.id, index, testId });
      const expectedPassed = evidence.passed !== false;
      for (const match of matches) if (match.passed !== expectedPassed) problems.push({ kind: 'unexpected-test-outcome', id: row.id, index, testId, ...match, expectedPassed });
      checks.push({ id: row.id, evidence: index, testId, expectedPassed, matches });
    }
  }
}
// A newly added failed test cannot hide merely because no acceptance row lists it yet.
const knownFailures = new Set(checks.filter(row => !row.expectedPassed).flatMap(row => row.matches.map(match => `${match.report}\n${row.testId}`)));
for (const [reportPath, report] of reports) {
  if (!report) continue;
  const rows = report.results ?? report.rows ?? report.negativeCases ?? [];
  for (const result of rows) {
    const passed = result.passed ?? result.matches ?? result.matched ?? (result.detected !== undefined ? result.detected && report.passed : undefined);
    if (passed !== true && !knownFailures.has(`${reportPath}\n${result.id}`)) problems.push({ kind: 'unaccounted-result-failure', result: reportPath, testId: result.id, passed });
  }
  if (Number.isInteger(report.summary?.executed) && report.summary.executed !== rows.length) problems.push({ kind: 'result-count', result: reportPath });
}
const summary = { records: inventory.records.length, expectedRecords: expected.length, reports: reports.size, checks: checks.length, knownFailureResults: knownFailures.size, problems: problems.length,
  byKind: Object.fromEntries([...new Set(problems.map(row => row.kind))].map(kind => [kind, problems.filter(row => row.kind === kind).length])) };
const output = { generatedAt: new Date().toISOString(), scope: 'Inventory/source-row/reference/test-result/source-hash audit; does not prove full behavioral coverage or production implementation', sourceSha256: { 'coverage.json': hash(await bytes(input)), 'audit-evidence.mjs': hash(await bytes('experiments/verification/audit-evidence.mjs')) }, summary, problems, checks };
await writeFile(new URL('evidence-integrity.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(summary));
if (problems.length) process.exitCode = 1;
