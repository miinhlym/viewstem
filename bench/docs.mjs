import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dist = fileURLToPath(new URL('../apps/docs/dist', import.meta.url));
const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};
const initialDemo = '[data-component-demo]:not([data-demo-lazy])[data-demo-ready="true"] [data-viewstem-ui]';
const lessonPreview = '[data-example-target] [data-viewstem-ui]:not([hidden])';

async function collectRoutes(directory) {
  const directories = await readdir(directory, { withFileTypes: true });
  return directories
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function navigate(page, url, selector) {
  await page.addInitScript((selector) => {
    const measure = () => {
      if (!document.querySelector(selector)) return;
      window.viewstemBenchmarkReady = performance.now();
      observer.disconnect();
    };
    const observer = new MutationObserver(measure);
    observer.observe(document, { subtree: true, childList: true, attributes: true });
    measure();
  }, selector);
  const response = await page.goto(url);
  assert.equal(response?.status(), 200, url);
  await page.waitForFunction(() => Number.isFinite(window.viewstemBenchmarkReady));
  const elapsed = await page.evaluate(() => window.viewstemBenchmarkReady);
  assert.equal(await page.locator('[data-demo-error], [data-example-status]:visible').count(), 0);
  return elapsed;
}

async function interaction(page, trigger, event, action, selector, text) {
  await trigger.evaluate(
    (target, { event, selector, text }) => {
      target.addEventListener(
        event,
        () => {
          const started = performance.now();
          const measure = () => {
            const element = document.querySelector(selector);
            if (!element || (text !== undefined && element.textContent.trim() !== text)) return;
            window.viewstemBenchmarkInteraction = performance.now() - started;
            observer.disconnect();
          };
          const observer = new MutationObserver(measure);
          observer.observe(document, {
            childList: true,
            attributes: true,
            characterData: true,
            subtree: true,
          });
        },
        { capture: true, once: true },
      );
    },
    { event, selector, text },
  );
  await action();
  await page.waitForFunction(() => Number.isFinite(window.viewstemBenchmarkInteraction));
  return page.evaluate(() => window.viewstemBenchmarkInteraction);
}

export async function benchmarkDocs(measure) {
  const entries = await collectRoutes(join(dist, 'examples'));
  const families = await collectRoutes(join(dist, 'docs/ui/components'));
  assert.ok(entries.length && families.length, 'Build the full documentation site first');

  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(dist, '.' + pathname, ...(pathname.endsWith('/') ? ['index.html'] : []));
      if (!file.startsWith(dist + sep)) return response.writeHead(403).end();
      const content = await readFile(file);
      response
        .writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' })
        .end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser, desktop, mobile;
  try {
    browser = await chromium.launch();
    desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const run = async (context, callback) => {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.setDefaultTimeout(10000);
      try {
        const result = await callback(page);
        assert.deepEqual(errors, []);
        return result;
      } finally {
        await page.close();
      }
    };
    const route = (id, path, selector, context = desktop) =>
      measure({
        id: 'docs.' + id,
        workload: 'Navigation to the first ' + selector + ' on ' + path,
        sample: () => run(context, (page) => navigate(page, origin + path, selector)),
      });
    for (const [locale, prefix] of [
      ['en', ''],
      ['ko', '/ko'],
    ]) {
      await route('home.' + locale, prefix + '/', 'main h1');
      await route('guide.' + locale, prefix + '/docs/quickstart/', 'main h1');
      await route('index.' + locale, prefix + '/examples/', 'main h1');
      await route('playground.' + locale, prefix + '/playground/', '.cm-content');
    }
    for (const slug of entries) await route('lesson.' + slug, '/examples/' + slug + '/', lessonPreview);
    for (const family of families)
      await route('reference.' + family, '/docs/ui/components/' + family + '/', initialDemo);
    await route('reference.ko-mobile', '/ko/docs/ui/components/data-table/', initialDemo, mobile);
    await route('lesson.ko-mobile', '/ko/examples/shared-state-port/', lessonPreview, mobile);

    for (const [locale, prefix, label] of [
      ['en', '', 'Search docs'],
      ['ko', '/ko', '문서 검색'],
    ]) {
      await measure({
        id: 'docs.search.' + locale,
        workload: 'Input event to the first Pagefind result for State',
        sample: () =>
          run(desktop, async (page) => {
            await page.goto(origin + prefix + '/docs/quickstart/');
            await page.getByRole('button', { name: label, exact: true }).click();
            const input = page.getByRole('combobox', { name: label });
            return interaction(
              page,
              input,
              'input',
              () => input.fill('State'),
              '[role="dialog"] [data-slot="command-item"][href]',
            );
          }),
      });
    }
    await measure({
      id: 'docs.mobile-menu',
      workload: 'Tap handler to the Korean documentation navigation sheet in the DOM',
      sample: () =>
        run(mobile, async (page) => {
          await page.goto(origin + '/ko/docs/quickstart/');
          const button = page.getByRole('button', { name: '문서 메뉴', exact: true });
          return interaction(
            page,
            button,
            'click',
            () => button.click(),
            '[role="dialog"] #starlight__sidebar, [role="dialog"] [data-sidebar-group]',
          );
        }),
    });
    await measure({
      id: 'docs.lesson.refresh',
      workload: 'Click event to the second result of the refresh-query lesson',
      sample: () =>
        run(desktop, async (page) => {
          await navigate(page, origin + '/examples/refresh-query/', lessonPreview);
          await page.getByText('Projects 1', { exact: true }).waitFor();
          const trigger = page.getByRole('button', { name: 'Refresh', exact: true });
          return interaction(
            page,
            trigger,
            'click',
            () => trigger.click(),
            lessonPreview + ' [data-vs-component="Badge"]',
            'Projects 2',
          );
        }),
    });
    await measure({
      id: 'docs.playground.run',
      workload: 'Run button event to the JSON-rendered button in the playground',
      sample: () =>
        run(desktop, async (page) => {
          await navigate(page, origin + '/playground/', '.cm-content');
          await page.locator('.cm-content').fill(
            JSON.stringify({
              render: {
                id: 'benchmark',
                componentRef: 'shadcn.Button',
                inputs: { text: 'Benchmark example' },
              },
            }),
          );
          const runButton = page.getByRole('button', { name: 'Run', exact: true });
          return interaction(
            page,
            runButton,
            'click',
            () => runButton.click(),
            '[data-viewstem-ui] button',
            'Benchmark example',
          );
        }),
    });
    await measure({
      id: 'docs.workbench.json',
      workload: 'Primary component preview JSON-tab click to visible JSON panel',
      sample: () =>
        run(desktop, async (page) => {
          await navigate(page, origin + '/docs/ui/components/data-table/', initialDemo);
          const demo = page.locator('[data-component-demo]:not([data-demo-lazy])');
          const tab = demo.getByRole('tab', { name: 'JSON', exact: true });
          const selector = '[data-component-demo]:not([data-demo-lazy]) [data-panel="json"] .source-code pre';
          return interaction(page, tab, 'click', () => tab.click(), selector);
        }),
    });
    await measure({
      id: 'docs.workbench.reset',
      workload: 'Reset a mounted Data Table preview and wait for its new render',
      sample: () =>
        run(desktop, async (page) => {
          await navigate(page, origin + '/docs/ui/components/data-table/', initialDemo);
          const demo = page.locator('[data-component-demo]:not([data-demo-lazy])');
          const reset = demo.getByRole('button', { name: 'Run example again' });
          return interaction(
            page,
            reset,
            'click',
            () => reset.click(),
            '[data-component-demo]:not([data-demo-lazy])[data-demo-applied-version="2"]',
          );
        }),
    });
    await measure({
      id: 'docs.workbench.lazy-variant',
      workload: 'Scroll to a lazy Data Table variant and wait for its first render',
      sample: () =>
        run(desktop, async (page) => {
          await navigate(page, origin + '/docs/ui/components/data-table/', initialDemo);
          const variant = page.locator('[data-component-demo][data-demo-lazy]').last();
          return variant.evaluate(
            (element) =>
              new Promise((resolve, reject) => {
                if (element.hasAttribute('data-demo-ready'))
                  return reject(new Error('Variant mounted before scrolling'));
                const started = performance.now();
                const timer = setTimeout(() => finish(undefined), 10000);
                const observer = new MutationObserver(() => {
                  if (element.getAttribute('data-demo-ready') === 'true') finish(performance.now() - started);
                  else if (element.hasAttribute('data-demo-error')) finish(undefined);
                });
                function finish(duration) {
                  observer.disconnect();
                  clearTimeout(timer);
                  if (duration === undefined) reject(new Error('Variant did not render'));
                  else resolve(duration);
                }
                observer.observe(element, {
                  attributes: true,
                  attributeFilter: ['data-demo-ready', 'data-demo-error'],
                });
                element
                  .querySelector('[data-demo-target]')
                  .scrollIntoView({ block: 'center', behavior: 'instant' });
              }),
          );
        }),
    });
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
