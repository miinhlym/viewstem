import { readFile, mkdir, cp, stat, mkdtemp, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const hash = value => createHash('sha256').update(value).digest('hex');

export async function preparePatch() {
  const upstream = new URL('../t1-values/node_modules/@marcbachmann/cel-js/', import.meta.url);
  const expected = JSON.parse(await readFile(new URL('./upstream-sha256.json', import.meta.url), 'utf8'));
  for (const [name, sha] of Object.entries(expected)) {
    if (hash(await readFile(new URL(name, upstream))) !== sha) throw Error(`UPSTREAM_MISMATCH:${name}`);
  }
  const patch = await readFile(new URL('./cel-js-8.0.0.patch', import.meta.url));
  const target = new URL(`./.work/build-${hash(patch).slice(0, 20)}/`, import.meta.url);
  let exists = false;
  let redundantTemporary;
  try { exists = (await stat(target)).isDirectory(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!exists) {
    await mkdir(new URL('./.work/', import.meta.url), { recursive: true });
    const temporary = await mkdtemp(new URL('./.work/apply-', import.meta.url));
    await cp(upstream, temporary, { recursive: true });
    const patchPath = new URL('./cel-js-8.0.0.patch', import.meta.url).pathname;
    for (const dryRun of [true, false]) {
      const result = spawnSync('patch', ['--batch', '--forward', ...(dryRun ? ['--dry-run'] : []), '-p1', '-i', patchPath], { cwd: temporary, encoding: 'utf8' });
      if (result.status !== 0 || /fuzz|offset/i.test(result.stdout + result.stderr)) throw Error(`PATCH_FAILED:${result.stdout}${result.stderr}`);
    }
    try { await rename(temporary, target); }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
      // Another process published the same hash while this invocation prepared it.
      // Verify that directory below before removing only our own temporary copy.
      redundantTemporary = temporary;
    }
  }
  const patched = JSON.parse(await readFile(new URL('./patched-sha256.json', import.meta.url), 'utf8'));
  for (const [name, sha] of Object.entries(patched)) {
    if (hash(await readFile(new URL(name, target))) !== sha) throw Error(`PATCHED_MISMATCH:${name}`);
  }
  if (redundantTemporary) await rm(redundantTemporary, { recursive: true });
  return { directory: target, entry: new URL('lib/index.js', target), patchSha256: hash(patch), verifiedFiles: Object.keys(patched).length };
}

if (process.argv[1] && new URL(process.argv[1], 'file:').href === import.meta.url) {
  const result = await preparePatch();
  console.log(JSON.stringify({ entry: result.entry.href, patchSha256: result.patchSha256, verifiedFiles: result.verifiedFiles }));
}
