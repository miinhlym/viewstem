import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.DOCS_ORIGIN ?? 'http://localhost:4323';
const browser = await chromium.launch({ channel: 'chrome' });
const checks = [];
const viewport = '[data-slot="scroll-area-viewport"]';
try {
  for (const ko of [false, true]) for (const width of [375, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: 'dark' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const base = `${origin}${ko ? '/ko' : ''}/docs/svelte-ui/components/`;
    await page.goto(base + 'tooltip/');
    await page.waitForFunction(() => !document.querySelector('astro-island[client="load"][ssr]'));
    if (width === 375) {
      await page.getByRole('button', { name: ko ? '문서 메뉴' : 'Docs menu', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await page.waitForTimeout(250);
      const geometry = await dialog.locator(viewport).evaluate(el => {
        const item = el.querySelector('[aria-current="page"]').getBoundingClientRect();
        const area = el.getBoundingClientRect();
        return { top: el.scrollTop, visible: item.top >= area.top && item.bottom <= area.bottom };
      });
      assert.ok(geometry.top > 500 && geometry.visible, JSON.stringify(geometry));
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: ko ? '목차' : 'On this page', exact: true }).click();
      assert.equal(await page.getByRole('menu').locator(viewport).count(), 1);
      await page.keyboard.press('End');
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: ko ? '문서 검색' : 'Search docs', exact: true }).click();
    await page.getByPlaceholder(ko ? '검색어 입력…' : 'Type to search…', { exact: true }).fill('State');
    const dialog = page.getByRole('dialog');
    await dialog.locator('[data-slot="command-item"][href]').first().waitFor();
    const area = dialog.locator(viewport);
    assert.equal(await area.count(), 1);
    await page.waitForFunction(selector => {
      const area = document.querySelector(`[role="dialog"] ${selector}`);
      return area && area.scrollHeight > area.clientHeight;
    }, viewport);
    await area.focus();
    await page.keyboard.press('End');
    // Native keyboard scrolling is animated; the key event precedes scrollTop.
    await page.waitForFunction(selector => document.querySelector(`[role="dialog"] ${selector}`)?.scrollTop > 0, viewport);
    await page.keyboard.press('Escape');

    await page.goto(base + 'button/');
    await page.locator('[data-demo-ready="true"]').waitFor();
    if (width === 375) await page.getByRole('tab', { name: ko ? '옵션' : 'Options', exact: true }).click();
    await page.getByRole('textbox', { name: ko ? '텍스트' : 'Text', exact: true }).fill('Scroll target');
    if (width === 375) await page.getByRole('tab', { name: ko ? '미리보기' : 'Preview', exact: true }).click();
    await page.locator('[data-demo-target] button').filter({ hasText: 'Scroll target' }).waitFor();
    if (width === 375) await page.getByRole('tab', { name: ko ? '옵션' : 'Options', exact: true }).click();
    await page.getByRole('button', { name: ko ? '옵션 설명: 텍스트' : 'Option details: Text', exact: true }).click();
    await page.getByRole('button', { name: ko ? 'JSON에서 보기: 텍스트' : 'Show in JSON: Text', exact: true }).click();
    const source = page.locator(`.source-scroll ${viewport}`);
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-slot') === 'scroll-area-viewport');
    assert.ok(await source.evaluate(el => el.scrollTop > 0 && el.textContent.includes('Scroll target')));
    if (width === 375) await page.getByRole('tab', { name: ko ? '옵션' : 'Options', exact: true }).click();
    await page.getByRole('button', { name: ko ? '기본 예제로 되돌리기' : 'Restore default example', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.source-scroll')?.textContent.includes('Scroll target'));
    assert.deepEqual(errors, []);
    checks.push({ locale: ko ? 'ko' : 'en', width, search: true, sourceJump: true, reset: true, mobileMenus: width === 375 });
    await context.close();
  }
  console.log(JSON.stringify({ checks, failures: [] }, null, 2));
} finally { await browser.close(); }
