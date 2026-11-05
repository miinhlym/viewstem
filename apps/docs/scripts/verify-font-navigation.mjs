import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.DOCS_ORIGIN ?? 'http://localhost:4321';
const channel = process.env.BROWSER_CHANNEL ?? 'chrome';
const browser = await chromium.launch({ channel });
const results = [], failures = [];
const families = ['attachment', 'avatar', 'badge', 'breadcrumb', 'bubble', 'button-group', 'button', 'calendar', 'card', 'carousel', 'chart', 'checkbox', 'code-block', 'collapsible', 'combobox'];
const locales = process.env.FONT_TEST_LOCALES?.split(',') ?? ['ko', 'en'];
try {
  for (const locale of locales) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.fontNavigationFrames = [];
      window.fontNavigationDone = false;
      const started = performance.now();
      let paintedFrames = 0;
      const sample = () => {
        const rows = ['alert-dialog', 'aspect-ratio', 'navigation-menu'].map(name => {
          const el = document.querySelector(`#starlight__sidebar a[href$="/${name}/"] > span`);
          if (!el) return null;
          const range = document.createRange();
          range.selectNodeContents(el);
          const rect = range.getBoundingClientRect();
          return [el.textContent, rect.width, rect.height];
        });
        window.fontNavigationFrames.push({ time: performance.now(), rows });
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
        if (fcp !== undefined && rows.every(Boolean)) paintedFrames++;
        // Keep first-paint evidence, but allow slower machines enough rendered frames.
        if (performance.now() - started < 10000 && (performance.now() - started < 2400 || paintedFrames < 30)) requestAnimationFrame(sample);
        else window.fontNavigationDone = true;
      };
      requestAnimationFrame(sample);
    });
    const base = `${locale === 'ko' ? '/ko' : ''}/docs/svelte-ui/components/`;
    for (const family of families) {
      if (family === families[0]) await page.goto(`${origin}${base}${family}/`);
      else await page.locator(`#starlight__sidebar a[href="${base}${family}/"]`).click();
      await page.waitForURL(`${origin}${base}${family}/`);
      await page.waitForFunction(() => window.fontNavigationDone);
      const observation = await page.evaluate(() => {
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
        const frames = window.fontNavigationFrames.filter(frame => frame.time >= fcp && frame.rows.every(Boolean));
        const states = [...new Set(frames.map(frame => JSON.stringify(frame.rows)))].map(value => JSON.parse(value));
        return { fcp, frames: frames.length, states };
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
      const { root } = await cdp.send('DOM.getDocument');
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#starlight__sidebar a[href$="/alert-dialog/"] > span' });
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      await cdp.detach();
      results.push({ locale, family, ...observation, fonts });
      try {
        assert.ok(observation.frames > 10);
        assert.equal(observation.states.length, 1, 'non-current labels changed width after first paint');
        assert.ok(fonts.every(font => font.isCustomFont && font.familyName.includes('Pretendard')), 'sidebar switched to system fonts');
      } catch (error) { failures.push({ locale, family, error: String(error) }); }
    }
    // Vite writes an identical CSS module into the existing SSR style element.
    // Exercise this late update explicitly: a warm-cache run can otherwise miss it.
    const reapply = await page.evaluate(async () => {
      await document.fonts.ready;
      const style = [...document.querySelectorAll('style')].find(element =>
        element.dataset.viteDevId?.endsWith('/site.css') || element.dataset.viteDevId?.endsWith('/site-theme.css'));
      if (!style) return { skipped: 'production CSS has no Vite module replacement' };
      const el = document.querySelector('#starlight__sidebar a[href$="/alert-dialog/"] > span');
      const measure = () => {
        const range = document.createRange(); range.selectNodeContents(el);
        const rect = range.getBoundingClientRect();
        return { width: rect.width, height: rect.height, font: getComputedStyle(el).font };
      };
      const before = measure();
      style.textContent = style.textContent;
      const immediate = measure();
      await new Promise(resolve => setTimeout(resolve, 600));
      return { before, immediate, settled: measure() };
    });
    results.push({ locale, reapply });
    if (!reapply.skipped) {
      try {
        assert.deepEqual(reapply.immediate, reapply.before, 'Vite CSS replacement changed text metrics');
        assert.deepEqual(reapply.settled, reapply.before);
      } catch (error) { failures.push({ locale, reapply: String(error) }); }
    }
    if (errors.length) failures.push({ locale, errors });
    await context.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ origin, channel, results, failures }, null, 2));
if (failures.length) process.exitCode = 1;
