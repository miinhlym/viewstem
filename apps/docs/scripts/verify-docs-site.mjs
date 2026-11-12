import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';

const app = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(app, 'dist');
const content = path.join(app, 'src/content/docs');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const pages = new Map();
const errors = [];
for (const file of walk(dist).filter(file => file.endsWith('.html'))) {
  const ids = new Set();
  const links = [];
  const visit = (node, sidebar = false) => {
    const attrs = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
    if (attrs.id) {
      if (ids.has(attrs.id)) errors.push(`${path.relative(dist, file)}: duplicate #${attrs.id}`);
      ids.add(attrs.id);
    }
    sidebar ||= attrs.id === 'starlight__sidebar';
    if (node.tagName === 'a' && attrs.href) links.push({ ...attrs, sidebar });
    for (const child of node.childNodes ?? []) visit(child, sidebar);
  };
  visit(parse(fs.readFileSync(file, 'utf8')));
  pages.set(file, { ids, links });
}
let checkedLinks = 0;
let familyPages = 0;
let componentMenus = 0;
for (const [file, { links }] of pages) {
  const relative = path.relative(dist, file);
  const pageUrl = new URL(relative.replace(/index\.html$/, ''), 'https://docs.test/');
  if (/^(ko\/)?docs\//.test(relative) && links.some(a => a.sidebar)) {
    const locale = relative.startsWith('ko/') ? '/ko' : '';
    const prefix = `${locale}/docs/ui/components/`;
    const components = links.filter(a => a.sidebar && a.href.startsWith(prefix) && a.href !== prefix);
    if (components.length !== 66 || new Set(components.map(a => a.href)).size !== 66) errors.push(`${relative}: incomplete UI component sidebar`);
    componentMenus++;
  }
  for (const { href } of links) {
    const url = new URL(href, pageUrl);
    if (url.origin !== pageUrl.origin) continue;
    checkedLinks++;
    let target = path.join(dist, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/') || !path.extname(target)) target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) errors.push(`${relative}: missing ${href}`);
    else if (url.hash && pages.has(target) && !pages.get(target).ids.has(decodeURIComponent(url.hash.slice(1)))) errors.push(`${relative}: missing anchor ${href}`);
  }
  if (/^(ko\/)?docs\/ui\/components\/[^/]+\/index\.html$/.test(relative)) {
    familyPages++;
    const current = links.filter(a => a.sidebar && a['aria-current'] === 'page');
    if (current.length !== 1 || current[0].href !== pageUrl.pathname) errors.push(`${relative}: missing or wrong current sidebar entry`);
    for (const rel of ['prev', 'next']) {
      const adjacent = links.filter(a => a.rel === rel);
      if (adjacent.length !== 1 || relative.startsWith('ko/') !== adjacent[0]?.href.startsWith('/ko/')) errors.push(`${relative}: wrong ${rel} locale or count`);
    }
  }
}
const localizedFiles = prefix => walk(path.join(content, prefix)).filter(file => /\.mdx?$/.test(file)).map(file => path.relative(path.join(content, prefix), file)).sort();
const en = localizedFiles('docs');
assert.deepEqual(en, localizedFiles('ko/docs'), 'English and Korean documentation pages differ');
const result = { htmlPages: pages.size, localizedPagePairs: en.length, familyPages, componentMenus, checkedLinks, errors };
console.log(JSON.stringify(result, null, 2));
assert.equal(errors.length, 0, 'Documentation integrity checks failed');
