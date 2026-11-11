import assert from 'node:assert/strict';
import { appendFile, chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { componentDemoSlugs } from '../src/examples/component-demos.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, ...value] = arg.replace(/^--/, '').split('='); return [key, value.join('=') || 'true']; }));
const origin = args.origin || 'http://localhost:4321';
const phase = args.phase || 'baseline';
assert.ok(['baseline', 'matrix'].includes(phase), 'Use verify-component-demos.mjs for interaction checks');
const out = resolve(args.output || `./preview-design-${phase}`);
await mkdir(out, { recursive: true });
const dumpSource = args['dom-dump'] ? await readFile(args['dom-dump'], 'utf8') : null;
if (dumpSource) await mkdir(resolve(out, 'dom'), { recursive: true, mode: 0o700 });
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
const browser = await chromium.launch({ handleSIGINT: false });
const checks = [], failures = [], captures = [], domSkipped = [];
const redact = path => new Promise(resolveResult => {
  const child = spawn(args.redactor || resolve(dirname(args['dom-dump']), '../bin/gstack-redact'), ['--from-file', path, '--max-bytes', '10485760'], { stdio: 'ignore' });
  child.on('error', () => resolveResult(-1));
  child.on('close', code => resolveResult(code));
});
const variants = phase === 'baseline' ? [{ locale: 'ko', theme: 'light', width: 1440 }] :
  ['ko', 'en'].flatMap(locale => ['light', 'dark'].flatMap(theme => [320, 1440].map(width => ({ locale, theme, width }))));
const families = args.family ? componentDemoSlugs.filter(family => family === args.family) : componentDemoSlugs;
assert.ok(families.length > 0, `Unknown family: ${args.family}`);
const tasks = variants.flatMap(variant => families.map(family => ({ ...variant, family })));
try {
  await Promise.all(Array.from({ length: Number(args.workers || 3) }, async () => {
    for (let task; !stopping && (task = tasks.shift());) {
      const { locale, theme, width, family } = task;
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(`${origin}${locale === 'ko' ? '/ko' : ''}/docs/ui/components/${family}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => { const d = document.querySelector('[data-component-demo]'); return d?.hasAttribute('data-demo-error') || (d?.dataset.demoReady === 'true' && d.dataset.demoVersion === d.dataset.demoAppliedVersion); }, null, { timeout: 60000 });
        const state = await page.evaluate(() => ({ error: document.querySelector('[data-component-demo]').getAttribute('data-demo-error'), children: document.querySelector('[data-demo-target]').childElementCount, stageWidth: document.querySelector('[data-demo-target]').getBoundingClientRect().width, contentWidth: document.querySelector('[data-demo-target] > div > *')?.getBoundingClientRect().width, theme: document.documentElement.dataset.theme, width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert.equal(state.error, null);
        assert.ok(state.children > 0, 'preview target is empty');
        assert.ok(state.stageWidth > 0, 'preview stage has zero width');
        assert.ok(state.contentWidth > 0, 'preview content has zero width');
        assert.equal(state.theme, theme, 'site theme');
        assert.ok(state.scrollWidth <= state.width, `page overflow ${state.scrollWidth} > ${state.width}`);
        assert.deepEqual(errors, []);
        if (phase === 'baseline' || (locale === 'ko' && theme === 'light' && width === 1440)) {
          const path = resolve(out, `${family}.png`);
          await page.locator('[data-component-demo]:not([data-demo-lazy]) .workbench-preview').screenshot({ path, animations: 'disabled', timeout: 20000 });
          captures.push({ family, path });
          if (dumpSource) {
            const dump = await page.evaluate(`(${dumpSource})()`);
            if (!dump || Buffer.byteLength(dump) > 10 * 1024 * 1024) domSkipped.push({ family, reason: 'empty or exceeds 10 MB' });
            else {
              const dumpPath = resolve(out, 'dom', `${family}.dom.html`);
              await writeFile(dumpPath, dump, { mode: 0o600 });
              await chmod(dumpPath, 0o600);
              const code = await redact(dumpPath);
              if (code !== 0 && code !== 2) { await unlink(dumpPath); domSkipped.push({ family, code }); }
            }
          }
        }
        checks.push(task);
      } catch (error) { const failure = { ...task, error: error.message }; failures.push(failure); await appendFile(resolve(out, 'failures.ndjson'), JSON.stringify(failure) + '\n'); console.error(JSON.stringify(failure)); }
      finally { await context.close(); }
    }
  }));
  captures.sort((a, b) => componentDemoSlugs.indexOf(a.family) - componentDemoSlugs.indexOf(b.family));
  const tileWidth = 400, tileHeight = 285, columns = 3, rowsPerSheet = 4;
  for (let start = 0; start < captures.length; start += columns * rowsPerSheet) {
    const group = captures.slice(start, start + columns * rowsPerSheet);
    const composite = [];
    for (const [index, capture] of group.entries()) {
      const image = await sharp(capture.path).resize(tileWidth, tileHeight - 24, { fit: 'contain', background: '#eeeeee' }).png().toBuffer();
      const label = Buffer.from(`<svg width="${tileWidth}" height="24"><rect width="100%" height="100%" fill="white"/><text x="8" y="17" font-size="14" font-family="sans-serif">${capture.family}</text></svg>`);
      composite.push({ input: label, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight });
      composite.push({ input: image, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight + 24 });
    }
    await sharp({ create: { width: tileWidth * columns, height: tileHeight * Math.ceil(group.length / columns), channels: 4, background: '#ffffff' } }).composite(composite).png().toFile(resolve(out, `contact-${String(start / (columns * rowsPerSheet) + 1).padStart(2, '0')}.png`));
  }
  const result = { origin, phase, interrupted: stopping, domSkipped, checked: checks.length, expected: variants.length * families.length, captures: captures.length, checks, failures };
  await writeFile(resolve(out, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ checked: checks.length, expected: result.expected, captures: captures.length, failures }, null, 2));
  if (failures.length || stopping) process.exitCode = 1;
} finally { await browser.close(); }
