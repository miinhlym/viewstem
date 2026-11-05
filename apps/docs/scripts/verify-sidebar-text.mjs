import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.DOCS_ORIGIN ?? 'http://localhost:4321';
const browser = await chromium.launch();
const checks = [], failures = [];
const snapshot = locator => locator.evaluate(element => {
  const range = document.createRange();
  range.selectNodeContents(element.querySelector('span'));
  const { x, y, width, height } = range.getBoundingClientRect();
  return { x, y, width, height, font: getComputedStyle(element).font };
});
try {
  for (const locale of ['en', 'ko']) for (const theme of ['light', 'dark']) for (const width of [375, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = `${locale === 'ko' ? '/ko' : ''}/docs/svelte-ui/components/`;
    try {
      await page.goto(`${origin}${base}button/`);
      await page.waitForFunction(() => !document.querySelector('[data-sidebar-bootstrap]'));
      await page.evaluate(() => document.fonts.ready);
      if (width < 800) {
        await page.getByRole('button', { name: locale === 'ko' ? '문서 메뉴' : 'Docs menu', exact: true }).click();
        // Let the intentional Sheet entrance finish before observing its contents.
        await page.getByRole('dialog').evaluate(async element => {
          await Promise.all(element.getAnimations().map(animation => animation.finished));
        });
      }
      const root = width < 800 ? page.getByRole('dialog').locator('nav') : page.locator('#starlight__sidebar');
      const link = root.locator(`a[href="${base}badge/"]`);
      const group = root.locator('[data-sidebar-group] > button').first();
      const presses = [];
      for (const [kind, target] of [['link', link], ['group', group]]) {
        await target.scrollIntoViewIfNeeded();
        await target.hover();
        const before = await snapshot(target);
        await page.mouse.down();
        await page.waitForTimeout(180);
        const pressed = await snapshot(target);
        await page.mouse.move(width - 2, 898);
        await page.mouse.up();
        await page.waitForTimeout(180);
        const released = await snapshot(target);
        presses.push({ kind, before, pressed, released });
      }
      // Assert after collecting both controls so a failed baseline records both.
      checks.push({ locale, theme, width, presses });
      for (const press of presses) {
        assert.deepEqual(press.pressed, press.before, `${press.kind}: pointer press moved menu text`);
        assert.deepEqual(press.released, press.before, `${press.kind}: release moved menu text`);
      }
      if (width >= 800) {
        await link.evaluate(element => element.scrollIntoView({ block: 'center' }));
        const beforeTop = await root.evaluate(element => element.scrollTop);
        const beforeText = await snapshot(link);
        await link.click();
        await page.waitForURL(`${origin}${base}badge/`);
        await page.waitForFunction(() => !document.querySelector('[data-sidebar-bootstrap]'));
        const afterText = await snapshot(link);
        assert.equal(await root.evaluate(element => element.scrollTop), beforeTop);
        assert.equal(afterText.x, beforeText.x);
        assert.equal(afterText.y, beforeText.y);
        assert.equal(await link.getAttribute('aria-current'), 'page');
      } else {
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      failures.push({ locale, theme, width, error: String(error), errors });
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ origin, checks, failures }, null, 2));
if (failures.length) process.exitCode = 1;
