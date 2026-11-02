import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
const root = new URL('../../../', import.meta.url), tests = new URL('../test/', import.meta.url);
const results = process.env.VIEWSTEM_SVELTE_RESULTS_DIR
  ? resolve(fileURLToPath(root), process.env.VIEWSTEM_SVELTE_RESULTS_DIR)
  : fileURLToPath(new URL('results/', tests));
const files = (await readdir(tests)).filter(name => name.endsWith('.test.mjs')).sort().map(name => fileURLToPath(new URL(name, tests)));
if (!files.length) throw Error('No Svelte acceptance tests found.');
await mkdir(results, { recursive: true });
const result = spawnSync(process.execPath, ['--test', '--test-reporter=./packages/core/scripts/test-reporter.mjs', ...files], { cwd: fileURLToPath(root), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (result.error) throw result.error;
if (result.stderr) process.stderr.write(result.stderr);
await writeFile(join(results, `node${process.versions.node.split('.')[0]}.json`), result.stdout);
const report = JSON.parse(result.stdout);
console.log(JSON.stringify({ node: report.nodeVersion, passed: report.passed, failed: report.failed, skipped: report.skipped, todo: report.todo, failures: report.failures }));
process.exitCode = result.status || !report.passed || report.failed || report.skipped || report.todo ? 1 : 0;
