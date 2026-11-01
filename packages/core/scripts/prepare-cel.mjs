import { readFile, mkdir, cp, mkdtemp, rename, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const vendor = new URL('../vendor/', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const productionPatchSha256 = 'ae10b2b12750ee2f6d75d0c2592f57a4b3b8dee8a3159b901965ed1fbfafcf26';
const patchSha256 = '62dd517376de54a08018f6166b250d9013b907e87b11ab75d0f07e264de0da63';
async function verify(directory, manifest) {
  for (const [name, expected] of Object.entries(manifest)) {
    if (hash(await readFile(new URL(name, directory))) !== expected) throw Error(`CEL_HASH_MISMATCH:${name}`);
  }
}
export async function prepareCel() {
  const require = createRequire(import.meta.url);
  const upstream = new URL('../', `file://${require.resolve('@marcbachmann/cel-js')}`);
  const expected = JSON.parse(await readFile(new URL('upstream-sha256.json', vendor), 'utf8'));
  const production = JSON.parse(await readFile(new URL('production-sha256.json', vendor), 'utf8'));
  const productionPatch = await readFile(new URL('production-fixes.patch', vendor));
  if (hash(productionPatch) !== productionPatchSha256) throw Error('CEL_PRODUCTION_PATCH_HASH_MISMATCH');
  const patched = JSON.parse(await readFile(new URL('patched-sha256.json', vendor), 'utf8'));
  await verify(upstream, expected);
  const patch = await readFile(new URL('cel-js-8.0.0.patch', vendor));
  if (hash(patch) !== patchSha256) throw Error('CEL_PATCH_HASH_MISMATCH');
  const target = new URL('cel-js/', vendor);
  const temporaryPath = await mkdtemp(new URL('.cel-prepare-', vendor));
  const temporary = new URL(`file://${temporaryPath}/`);
  try {
    // Copy only the audited upstream manifest, never package-local unknown files.
    for (const name of Object.keys(expected)) {
      await mkdir(new URL('./', new URL(name, temporary)), { recursive: true });
      await cp(new URL(name, upstream), new URL(name, temporary));
    }
    for (const dry of [true, false]) {
      const result = spawnSync('patch', ['--batch', '--forward', ...(dry ? ['--dry-run'] : []), '-p1', '-i', fileURLToPath(new URL('cel-js-8.0.0.patch', vendor))], { cwd: temporaryPath, encoding: 'utf8' });
      if (result.status !== 0 || /fuzz|offset/i.test(result.stdout + result.stderr)) throw Error(`CEL_PATCH_FAILED:${result.stdout}${result.stderr}`);
    }
    await verify(temporary, patched);
    for (const dry of [true, false]) {
      const result = spawnSync('patch', ['--batch', '--forward', ...(dry ? ['--dry-run'] : []), '-p1', '-i', fileURLToPath(new URL('production-fixes.patch', vendor))], { cwd: temporaryPath, encoding: 'utf8' });
      if (result.status !== 0 || /fuzz|offset/i.test(result.stdout + result.stderr)) throw Error(`CEL_PRODUCTION_PATCH_FAILED:${result.stdout}${result.stderr}`);
    }
    await verify(temporary, production);
    try { await rename(temporary, target); }
    catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error; }
    await verify(target, production);
    // Unexpected runtime files are a provenance failure, not silently distributed.
    async function files(directory, prefix = '') {
      const entries = await readdir(directory, { withFileTypes: true });
      return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(new URL(`${entry.name}/`, directory), `${prefix}${entry.name}/`) : `${prefix}${entry.name}`))).flat();
    }
    const names = await files(target);
    if (names.length !== Object.keys(patched).length || names.some(name => !Object.hasOwn(patched, name))) throw Error('CEL_UNEXPECTED_VENDOR_FILE');
    return { entry: new URL('lib/index.js', target), productionPatchSha256, patchSha256, verifiedFiles: names.length };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(JSON.stringify(await prepareCel()));
