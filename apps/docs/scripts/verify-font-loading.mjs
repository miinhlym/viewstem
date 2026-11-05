import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.DOCS_ORIGIN ?? 'http://localhost:4321';
const browser = await chromium.launch();
const results = [];
try {
  for (const mode of ['normal', 'delayed', 'unavailable']) {
    const routes = mode === 'normal'
      ? ['/', '/ko/', '/docs/svelte-ui/', '/ko/docs/svelte-ui/', '/docs/svelte-ui/component-sets/', '/ko/docs/svelte-ui/component-sets/', '/examples/', '/ko/examples/', '/playground/', '/ko/playground/']
      : ['/docs/svelte-ui/component-sets/', '/ko/docs/svelte-ui/component-sets/'];
    for (const path of routes) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      if (mode !== 'normal') await page.route('**/fonts/**', async route => {
        if (mode === 'unavailable') return route.abort();
        await new Promise(resolve => setTimeout(resolve, 600));
        return route.continue();
      });
      await page.addInitScript(() => {
        window.fontProbe = { frames: [], shifts: [] };
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.fontProbe.shifts.push({ time: entry.startTime, value: entry.value });
          }
        }).observe({ type: 'layout-shift', buffered: true });
        const start = performance.now();
        const sample = () => {
          const boxes = ['h1', '.sl-markdown-content > p', '.sl-markdown-content code', '.masthead a'].map(selector => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const range = document.createRange();
            range.selectNodeContents(element);
            const { x, y, width, height } = range.getBoundingClientRect();
            return { x, y, width, height };
          });
          window.fontProbe.frames.push({ time: performance.now(), boxes });
          if (performance.now() - start < 1800) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      for (const visit of mode === 'normal' ? ['cold', 'cached'] : ['cold']) {
        await page.goto(origin + path);
        await page.waitForFunction(() => performance.now() > 1900);
        const observation = await page.evaluate(() => {
          const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
          const frames = window.fontProbe.frames.filter(frame => frame.time >= fcp);
          return {
            fcp,
            heading: document.querySelector('h1')?.textContent,
            // Streaming HTML may add the paragraph after the first paint. Only
            // compare each element after it exists, not null -> parsed content.
            geometryStates: Math.max(...[0, 1, 2, 3].map(index => new Set(
              frames.map(frame => frame.boxes[index]).filter(Boolean).map(box => JSON.stringify(box))
            ).size)),
            geometry: [...new Set(frames.map(frame => JSON.stringify(frame.boxes)))].map(value => JSON.parse(value)),
            frames: frames.length,
            shifts: window.fontProbe.shifts,
            preloads: [...document.querySelectorAll('link[rel="preload"][as="font"]')].map(link => link.getAttribute('href')),
          };
        });
        const client = await context.newCDPSession(page);
        await client.send('DOM.enable');
        await client.send('CSS.enable');
        const { root } = await client.send('DOM.getDocument');
        const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'h1' });
        const fonts = nodeId ? (await client.send('CSS.getPlatformFontsForNode', { nodeId })).fonts : [];
        await client.detach();
        const result = { mode, path, visit, ...observation, fonts, errors: [...errors] };
        results.push(result);
        // Hydrated demonstrations can legitimately change the home/playground layout.
        // Static documentation text must stay at its first painted position.
        if (path.includes('/docs/')) {
          assert.equal(result.geometryStates, 1, JSON.stringify(result));
          assert.equal(result.shifts.length, 0, JSON.stringify(result));
        }
        assert.ok(result.frames > 0 && result.heading, JSON.stringify(result));
        assert.ok(result.preloads.length > 0, JSON.stringify(result));
        assert.deepEqual(result.errors, [], JSON.stringify(result));
        if (mode === 'normal' && visit === 'cached') {
          assert.ok(fonts.some(font => font.familyName.includes('Pretendard')), JSON.stringify(result));
        }
      }
      await context.close();
    }
  }
  console.log(JSON.stringify({ origin, cases: results.length, results }, null, 2));
} finally {
  await browser.close();
}
