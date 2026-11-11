import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const checkout = process.argv[2];
if (!checkout) throw new Error('Usage: node scripts/vendor-snapshot.mjs <pinned upstream checkout>');
const upstream = new URL('../upstream/', import.meta.url);
const inventory = JSON.parse(readFileSync(new URL('../../../docs/handoff/shadcn-component-inventory.json', import.meta.url)));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const entries = new Map();

function snapshot(path) {
	if (entries.has(path)) return entries.get(path).content;
	const raw = readFileSync(join(checkout, path));
	const content = raw.toString('utf8');
	entries.set(path, { sha256: hash(raw), content });
	return content;
}

const families = inventory.catalogItems.filter((item) => item.category === 'direct-source');
const style = 'vega';
const registryPath = `docs/static/registry/styles/${style}`;
const queue = ['utils', ...families.map(({ slug }) => slug)];
const seen = new Set();
for (const name of queue) {
	if (seen.has(name)) continue;
	seen.add(name);
	const item = JSON.parse(snapshot(`${registryPath}/${name}.json`));
	queue.push(...item.registryDependencies ?? []);
}

for (const family of families) {
	const barrel = readFileSync(join(checkout, family.upstreamDirectory, 'index.ts'));
	const pinnedHash = family.indexSourceSha256;
	if (hash(barrel) !== pinnedHash) throw new Error(`Upstream barrel differs for ${family.slug}`);
}

snapshot('docs/static/registry/colors/neutral.json');
snapshot('packages/cli/src/tailwind.css');
snapshot('packages/cli/src/icons/libraries.ts');
snapshot('LICENSE.md');
const provenance = {
	repository: inventory.source.repository,
	commit: inventory.source.commit,
	cli: inventory.source.cliPackageVersion,
	style,
	baseColor: 'neutral',
	iconLibrary: 'lucide',
	families: families.map(({ slug }) => slug),
	components: families.reduce((sum, family) => sum + family.componentExports.length, 0),
	files: Object.fromEntries([...entries].map(([path, { sha256 }]) => [path, sha256])),
};
writeFileSync(new URL('source.json', upstream), JSON.stringify(provenance, null, 2) + '\n');
const archive = Object.fromEntries([...entries].map(([path, { content }]) => [path, content]));
writeFileSync(new URL('source.json.gz', upstream), gzipSync(JSON.stringify(archive), { level: 9 }));
writeFileSync(new URL('LICENSE.md', upstream), archive['LICENSE.md']);
