// Regenerate or verify the private, pinned svelte-sonner runtime from the installed npm tarball.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = '1.2.0';
const sourceHash = 'a25ee8824916b3e27570f94d8b14d941186c27904600e8463ea4e28c337aeeef';
const source = dirname(fileURLToPath(import.meta.resolve('svelte-sonner')));
const pkg = JSON.parse(await readFile(join(source, '../package.json'), 'utf8'));
if (pkg.version !== version) throw new Error(`Expected svelte-sonner@${version}, got ${pkg.version}`);

const vendor = fileURLToPath(new URL('../src/lib/shadcn/vendor/sonner-runtime/', import.meta.url));
const check = process.argv.includes('--check');

async function files(root) {
	const entries = await readdir(root, { recursive: true, withFileTypes: true });
	return entries.filter((entry) => entry.isFile())
		.map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/')).sort();
}

const hash = createHash('sha256');
const snapshot = new Map();
for (const filename of [...await files(source), 'LICENSE']) {
	const data = await readFile(join(source, filename === 'LICENSE' ? '../LICENSE' : filename));
	hash.update(filename).update('\0').update(data).update('\0');
	snapshot.set(filename, data);
}
if (hash.digest('hex') !== sourceHash) throw new Error('Installed Sonner source does not match the pinned artifact');

// svelte-package regenerates Svelte component declarations from the vendored source.
for (const filename of snapshot.keys()) {
	if (!filename.endsWith('.svelte.d.ts') || !snapshot.has(filename.slice(0, -5))) continue;
	snapshot.delete(filename);
	if (!check) await unlink(join(vendor, filename)).catch((error) => {
		if (error.code !== 'ENOENT') throw error;
	});
}

// Normalize the ESM extension and mark intentional initial-value reads for Svelte 5.
const toaster = snapshot.get('Toaster.svelte').toString();
snapshot.set('Toaster.svelte', Buffer.from(toaster
	.replace("'./toast-state.svelte'", "'./toast-state.svelte.js'")
	.replace('$state(getInitialTheme(theme))', '$state(untrack(() => getInitialTheme(theme)))')));
const toast = snapshot.get('Toast.svelte').toString();
snapshot.set('Toast.svelte', Buffer.from(toast
	.replace('let remainingTime = toast.duration || durationFromToaster || TOAST_LIFETIME;',
		'let remainingTime = untrack(() => toast.duration || durationFromToaster || TOAST_LIFETIME);')));

for (const [filename, data] of snapshot) {
	if (filename.startsWith('icons/') && filename.endsWith('.svelte')) {
		// A script tag makes the upstream SVG-only components typecheck with allowJs off.
		snapshot.set(filename, Buffer.from(`<script lang="ts"></script>
${data.toString()}`));
	}
}

for (const [filename, data] of snapshot) {
	const target = join(vendor, filename);
	if (check) {
		if (!(await readFile(target)).equals(data)) throw new Error(`Sonner runtime drift: ${filename}`);
	} else {
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, data);
	}
}
for (const filename of await files(vendor)) {
	if (!snapshot.has(filename)) throw new Error(`Unexpected Sonner runtime file: ${filename}`);
}
console.log(`svelte-sonner@${version}: ${snapshot.size} pinned files ${check ? 'verified' : 'copied'}`);
