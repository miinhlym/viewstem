import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink } from 'node:fs/promises';
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

const installDir = await mkdtemp(join(await realpath(tmpdir()), 'viewstem-docs-published-'));
const installed = join(installDir, 'node_modules');
const modules = join(app, 'node_modules');
const overlay = join(modules, '@viewstem');
let linked = false;
try {
  execFileSync('npm', ['install', '--prefix', installDir, '--ignore-scripts', '--no-audit', '--no-fund',
    '--registry', 'https://registry.npmjs.org', ...viewstem.map(([name, version]) => `${name}@${version}`)], { stdio: 'inherit' });
  const expected = new Map(viewstem);
  for (const [name, version] of viewstem) {
    const manifestFile = join(installed, name, 'package.json');
    assert.equal(await realpath(manifestFile), manifestFile, `${name} must come from the isolated npm install`);
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    assert.equal(manifest.name, name);
    assert.equal(manifest.version, version, name);
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [dep, required] of Object.entries(manifest[field] ?? {})) {
        if (dep.startsWith('@viewstem/')) assert.equal(expected.get(dep), required, `${name} requires ${dep}@${required}`);
      }
    }
  }
  await mkdir(modules, { recursive: true });
  await symlink(join(installed, '@viewstem'), overlay, 'dir');
  linked = true;
  execFileSync('npm', ['exec', '--workspace', '@viewstem/docs', '--', 'astro', 'build'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, VIEWSTEM_PUBLISHED_MODULES: join(installed, '@viewstem') },
  });
} finally {
  if (linked) await unlink(overlay);
  await rm(installDir, { recursive: true, force: true });
}
