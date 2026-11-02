import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { auditRows, mergeReports, readPlan, sourceIdentity, testDirectory } from './test-reports.mjs';

if (process.argv.length !== 3) throw Error('Usage: merge-test-reports.mjs <shard-report-directory>');
const directory = resolve(process.argv[2]);
const files = (await readdir(directory)).filter(name => /^shard-.*\.json$/.test(name)).sort();
const reports = await Promise.all(files.map(async file => JSON.parse(await readFile(join(directory, file), 'utf8'))));
const merged = mergeReports(reports, await readPlan(), await sourceIdentity(), await auditRows());
await mkdir(new URL('results/', testDirectory), { recursive: true });
await writeFile(new URL('results/current.json', testDirectory), JSON.stringify(merged, null, 2) + '\n');
console.log(JSON.stringify({ tests: merged.summary.counts, audit: merged.audit, timing: merged.timing }, null, 2));
