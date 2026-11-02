import { spawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../test/results/', import.meta.url), { recursive: true });
const files = (await readdir(new URL('../test/', import.meta.url))).filter(name => name.endsWith('.browser.mjs')).sort();
const child = spawn(process.execPath, [
  '--test', '--test-concurrency=1',
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=./scripts/audit-reporter.mjs', '--test-reporter-destination=test/results/current.json',
  ...files.map(name => 'test/' + name),
], { cwd, stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
