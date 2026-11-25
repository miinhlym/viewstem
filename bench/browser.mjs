import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { compile } from 'svelte/compiler';
import postcss from 'postcss';
import { scopeUiCss } from '@viewstem/dom/styles/postcss';
import { performance } from 'node:perf_hooks';
import { withDeadline } from './deadline.mjs';

// Measures completion through whenRendered; interactions include an event-loop turn.
// Setup, assertions and teardown are outside the timed region.
export async function benchmarkBrowser(measure) {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./browser-fixture.mjs', import.meta.url))],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    write: false,
    outfile: 'bundle.js',
    conditions: ['svelte', 'browser'],
    plugins: [
      {
        name: 'svelte',
        setup(builder) {
          builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
            contents: compile(await readFile(path, 'utf8'), {
              filename: path,
              generate: 'client',
              css: 'injected',
            }).js.code,
            loader: 'js',
          }));
        },
      },
    ],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    let page;
    const errors = [];
    const openPage = async () => {
      page = await browser.newPage();
      page.on('pageerror', (error) => errors.push(error));
      await page.setContent('<!doctype html><html><head></head><body></body></html>');
      for (const file of bundle.outputFiles) {
        if (file.path.endsWith('.css')) await page.addStyleTag({ content: file.text });
        if (file.path.endsWith('.js')) await page.addScriptTag({ content: file.text });
      }
    };
    const run = (options) =>
      measure({
        ...options,
        async sample({ signal } = {}) {
          const abort = () => {
            void page.close().catch(() => {});
          };
          signal?.addEventListener('abort', abort, { once: true });
          try {
            const elapsed = await withDeadline(
              options.sample(),
              options.id + ' browser sample',
              60_000,
              abort,
            );
            if (errors.length)
              throw new AggregateError(errors.splice(0), 'Uncaught browser exception');
            return elapsed;
          } finally {
            signal?.removeEventListener('abort', abort);
          }
        },
        async recover() {
          await page.close().catch(() => {});
          errors.length = 0;
          await openPage();
        },
      });
    await openPage();
    for (const operation of ['mount', 'update', 'reorder', 'event', 'unmount', 'custom'])
      await run({
        id: `dom.${operation}`,
        workload: `${operation} with 100 keyed slot children on the ${operation === 'custom' ? 'custom' : 'default'} DOM connector`,
        sample: () => page.evaluate((op) => window.bench.dom(op), operation),
      });
    for (const size of [50, 1000])
      await run({
        id: `dom.query-projection.${size}`,
        workload: `Render one HTTP Query response alongside ${size} unchanged keyed options`,
        sample: () => page.evaluate((count) => window.bench.queryProjection(count), size),
      });
    for (const tables of [1, 4])
      await run({
        id: `ui.unrelated-table.${tables}`,
        workload: `Render one summary Query response alongside ${tables} unchanged 1000-row DataTables with 100 visible rows each`,
        sample: () => page.evaluate((count) => window.bench.unrelatedTable(count), tables),
      });
    for (const operation of ['mount', 'update', 'replace', 'unmount', 'mixed'])
      await run({
        id: `svelte.${operation}`,
        workload: `${operation} Svelte renderer with 50 slot children${operation === 'mixed' ? ', alternating Svelte and DOM' : ''}`,
        sample: () => page.evaluate((op) => window.bench.svelte(op), operation),
      });
    await run({
      id: 'svelte.host-replace',
      workload: 'replace declarative ViewstemView host source via remount',
      sample: () => page.evaluate(() => window.bench.svelteHost()),
    });
    await run({
      id: 'dom.style-scope',
      workload: 'create 1000 style-scoped DOM elements',
      sample: () => page.evaluate(() => window.bench.styleScope()),
    });
    const css =
      Array.from(
        { length: 250 },
        (_, i) => `.item-${i}:hover > span { color: var(--accent); animation: pulse 1s }`,
      ).join('\n') + '@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }';
    await run({
      id: 'dom.css-scope',
      workload: 'scope 250 CSS selectors with PostCSS',
      sample: async () => {
        const start = performance.now();
        const result = await postcss([scopeUiCss('bench-scope')]).process(css, { from: undefined });
        const ms = performance.now() - start;
        if (!result.css.includes('data-vs')) throw new Error('CSS scope missing');
        return ms;
      },
    });
    for (const size of [50, 250, 953])
      await run({
        id: `ui.native-select-${size}`,
        workload: `mount NativeSelect with ${size} options`,
        sample: () => page.evaluate((n) => window.bench.ui('native-select', n), size),
      });
    for (const [slug, scale, interaction, workload] of [
      ['native-select', 953, 'select', 'change selection among 953 options'],
      ['data-table', 'rows', null, 'mount 1000 rows, page size 100'],
      ['data-table', 'rows', 'sort', 'sort 1000 rows, page size 100'],
      ['data-table', 'rows', 'filter', 'filter 1000 rows, page size 100'],
      ['input', null, 'input', 'edit a controlled form input'],
      ['calendar', null, 'calendar', 'select a calendar day'],
      ['dropdown-menu', null, 'menu', 'open a controlled dropdown menu'],
    ])
      await run({
        id: `ui.${slug}-${interaction ?? 'rows'}`,
        workload,
        sample: () => page.evaluate(([s, n, i]) => window.bench.ui(s, n, i), [slug, scale, interaction]),
      });
    const slugs = await page.evaluate(() => window.bench.slugs);
    for (const slug of slugs)
      await run({
        id: `ui.${slug}`,
        workload: `mount catalog ${slug} example through render completion`,
        sample: () => page.evaluate((s) => window.bench.ui(s), slug),
      });
    if (errors.length) throw new AggregateError(errors, 'Uncaught browser exception after the last sample');
  } finally {
    await browser.close();
  }
}
