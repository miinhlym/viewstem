import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.DOCS_ORIGIN ?? 'http://localhost:4323';
const browser = await chromium.launch({ channel: 'chrome' });
const checks = [];
try {
  for (const ko of [false, true]) for (const width of [320, 1440]) for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const path = `${ko ? '/ko' : ''}/docs/quickstart/`;
    await page.goto(origin + path);
    await page.waitForFunction(() => !document.querySelector('astro-island[client="load"][ssr]'));
    const label = ko ? '문서 검색' : 'Search docs';
    const trigger = page.getByRole('button', { name: label, exact: true });
    const expectedShortcut = width === 1440 ? 2 : 0;
    assert.equal(await trigger.locator('[data-slot="kbd"]:visible').count(), expectedShortcut);
    await trigger.focus();
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    const input = dialog.getByRole('combobox', { name: label });
    await input.waitFor();
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    await input.fill('qzxjvplm98765qq');
    await dialog.getByText(ko ? '검색 결과가 없습니다.' : 'No results found.', { exact: true }).waitFor();
    await input.fill('State');
    const links = dialog.locator('[data-slot="command-item"][href]');
    await links.first().waitFor();
    const before = await links.count();
    const more = dialog.getByRole('option', { name: ko ? '검색 결과 더 보기' : 'Show more results', exact: true });
    await more.click();
    await page.waitForFunction(count => document.querySelectorAll('[role="dialog"] [data-slot="command-item"][href]').length > count, before);
    // IME input clears stale choices, and doesn't navigate during composition.
    await input.dispatchEvent('compositionstart');
    await input.fill('State changed');
    assert.equal(await links.count(), 0);
    await input.dispatchEvent('compositionend');
    await input.fill('State');
    await links.first().waitFor();
    await input.press('ArrowDown');
    const selected = dialog.locator('[data-slot="command-item"][data-selected][href]');
    await selected.waitFor();
    const href = await selected.getAttribute('href');
    const geometry = await dialog.evaluate(el => {
      const box = el.getBoundingClientRect();
      return { left: box.left, right: box.right, bottom: box.bottom, height: innerHeight, width: innerWidth };
    });
    assert.ok(geometry.left >= 0 && geometry.right <= geometry.width + 1 && geometry.bottom <= geometry.height + 1, JSON.stringify(geometry));
    await input.press('Enter');
    await page.waitForURL(new URL(href, origin).href);
    await page.goto(origin + path);
    await page.waitForFunction(() => !document.querySelector('astro-island[client="load"][ssr]'));
    await trigger.focus();
    await page.keyboard.press('Meta+k');
    await input.waitFor();
    await input.fill('State');
    await links.first().waitFor();
    await dialog.getByRole('button', { name: ko ? '닫기' : 'Close', exact: true }).focus();
    await page.keyboard.press('Enter');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    assert.equal(new URL(page.url()).pathname, path, 'Close on Enter must not select a search result');
    await trigger.click();
    await input.waitFor();
    await input.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    checks.push({ locale: ko ? 'ko' : 'en', width, colorScheme, search: true, pagination: true, keyboardNavigation: true, composition: true, focusRestore: true });
    await context.close();
  }
  console.log(JSON.stringify({ checks, failures: [] }, null, 2));
} finally { await browser.close(); }
