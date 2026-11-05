import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const origin = process.env.DOCS_ORIGIN ?? 'http://localhost:4321';
const browser = await chromium.launch({ channel: 'chrome' });
const checks = [], errors = [];
try {
  for (const locale of ['ko', 'en']) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: theme });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const prefix = locale === 'ko' ? '/ko' : '';
    for (const route of ['/', '/examples/', '/examples/first-view/', '/playground/']) {
      await page.goto(origin + prefix + route);
      await page.waitForFunction(() => !document.querySelector('astro-island[client="load"][ssr]'));
      assert.equal(await page.locator('head title').count(), 1);
      assert.ok((await page.title()).includes('Viewstem'));
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      assert.equal(await page.locator('link[href="/fonts/site-fonts.css"]').count(), 1);
      assert.ok(await page.locator('meta[name="description"]').getAttribute('content'));
      const trigger = page.locator('.masthead-mobile button');
      await trigger.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.equal(await dialog.locator('nav a').count(), 3);
      assert.equal(await dialog.locator('[data-slot="scroll-area-viewport"]').count(), 1);
      const selected = dialog.locator('a[aria-current="page"]');
      assert.equal(await selected.count(), route === '/' ? 0 : 1);
      if (route !== '/') assert.equal(await selected.getAttribute('href'), prefix + '/' + route.split('/')[1] + '/');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
      checks.push({ locale, theme, route, metadata: true, mainMenu: true, focusReturn: true });
    }
    await page.goto(origin + prefix + '/examples/first-view/');
    const crumb = page.getByRole('navigation', { name: locale === 'ko' ? '예제 위치' : 'Breadcrumb', exact: true });
    assert.equal(await crumb.locator('[aria-current="page"]').count(), 1);
    assert.equal(await crumb.locator('a').getAttribute('href'), prefix + '/examples/');
    assert.equal(await crumb.locator('[aria-current="page"]').isVisible(), false);
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await crumb.locator('[aria-current="page"]').isVisible(), true);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('.masthead-mobile button').click();
    await page.getByRole('dialog').locator(`a[href="${prefix}/playground/"]`).click();
    await page.waitForURL(origin + prefix + '/playground/');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('textbox').first().waitFor();
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, breadcrumbAndNavigationContexts: 4, errors }, null, 2));
} finally { await browser.close(); }
