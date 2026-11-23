import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const { dependencies } = JSON.parse(await readFile(join(app, 'package.json'), 'utf8'));
const viewstem = Object.entries(dependencies).filter(([name]) => name.startsWith('@viewstem/'));
assert.ok(viewstem.length, 'The docs app must declare its Viewstem dependencies');
for (const [name, version] of viewstem) {
  assert.match(version, /^\d+\.\d+\.\d+$/, `Pin the public version of ${name}`);
}

const installDir = await mkdtemp(join(tmpdir(), 'viewstem-docs-published-'));
const installed = join(installDir, 'node_modules');
const modules = join(app, 'node_modules');
const overlay = join(modules, '@viewstem');
let linked = false;
try {
  execFileSync('npm', ['install', '--prefix', installDir, '--ignore-scripts', '--no-audit', '--no-fund',
    '--registry', 'https://registry.npmjs.org', ...viewstem.map(([name, version]) => `${name}@${version}`)], { stdio: 'inherit' });
  const expected = new Map(viewstem);
  for (const [name, version] of viewstem) {
    const manifest = JSON.parse(await readFile(join(installed, name, 'package.json'), 'utf8'));
    assert.equal(manifest.version, version, name);
    for (const [dep, required] of Object.entries(manifest.dependencies ?? {})) {
      if (expected.has(dep)) assert.equal(expected.get(dep), required, `${name} requires ${dep}@${required}`);
    }
  }
  await mkdir(modules, { recursive: true });
  await symlink(join(installed, '@viewstem'), overlay, 'dir');
  linked = true;
  execFileSync('npm', ['exec', '--workspace', '@viewstem/docs', '--', 'astro', 'build'], { cwd: root, stdio: 'inherit' });
} finally {
  if (linked) await unlink(overlay);
  await rm(installDir, { recursive: true, force: true });
}
