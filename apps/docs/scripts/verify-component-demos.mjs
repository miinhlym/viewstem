import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { componentDemoSlugs, getComponentDemo } from '../src/examples/component-demos.mjs';

const renderer = process.env.DEMO_RENDERER ?? 'svelte-ui';
assert.ok(['ui', 'svelte-ui'].includes(renderer));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(dist, '.' + pathname, ...(pathname.endsWith('/') ? ['index.html'] : []));
  if (!file.startsWith(dist.endsWith(sep) ? dist : dist + sep)) { response.writeHead(403).end(); return; }
  try { const body = await readFile(file); response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const checks = [];
const failures = [];
const interactions = [];
try {
  const queue = process.env.DEMO_INTERACTIONS_ONLY ? [] : ['en', 'ko'].flatMap(locale => componentDemoSlugs.map(family => ({ locale, family })));
  await Promise.all(Array.from({ length: 4 }, async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    let errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (let task; (task = queue.shift());) {
      const { locale, family } = task;
      const pathname = `${locale === 'ko' ? '/ko' : ''}/docs/${renderer}/components/${family}/`;
      errors = [];
      try {
        await page.goto(origin + pathname);
        await page.waitForFunction(() => document.querySelector('[data-demo-ready]') || document.querySelector('[data-demo-error]'), null, { timeout: 20000 });
        const observed = await page.evaluate(renderer => ({
          ready: document.querySelector('[data-component-demo]')?.getAttribute('data-demo-ready'),
          error: document.querySelector('[data-component-demo]')?.getAttribute('data-demo-error'),
          source: JSON.parse(document.querySelector('[data-demo-view]').textContent),
          code: document.querySelector('.source-code code').textContent,
          rendered: document.querySelector('[data-demo-target]').childElementCount,
          menu: [...document.querySelectorAll('#starlight__sidebar a')].filter(a => a.pathname.includes(`/docs/${renderer}/components/`) && /\/components\/[^/]+\/$/.test(a.pathname)).length,
          current: document.querySelector('#starlight__sidebar [aria-current="page"]')?.getAttribute('href'),
          width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
          domPreview: !!document.querySelector('[data-demo-target] [data-viewstem-ui]'),
        }), renderer);
        assert.equal(observed.error, null);
        assert.equal(observed.ready, 'true');
        assert.deepEqual(observed.source, getComponentDemo(family, locale).view);
        assert.deepEqual(JSON.parse(observed.code), observed.source);
        assert.equal(observed.menu, 66);
        assert.equal(observed.current, pathname);
        assert.ok(observed.rendered > 0);
        assert.equal(observed.domPreview, renderer === 'ui');
        assert.ok(observed.scrollWidth <= observed.width);
        await page.setViewportSize({ width: 320, height: 800 });
        const mobile = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(mobile.scroll <= mobile.width, JSON.stringify(mobile));
        assert.deepEqual(errors, []);
        checks.push({ locale, family, exactJson: true, sidebar: 66, desktopWidth: observed.width, mobileWidth: mobile.width });
      } catch (error) { failures.push({ ...task, error: error.message }); }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await context.close();
  }));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const interactionErrors = [];
  page.on('pageerror', error => interactionErrors.push(error.message));
  for (const locale of ['en', 'ko']) {
    const ko = locale === 'ko';
    const t = (en, koText) => ko ? koText : en;
    const open = async family => {
      await page.goto(`${origin}${ko ? '/ko' : ''}/docs/${renderer}/components/${family}/`);
      await page.locator('[data-demo-ready="true"], [data-demo-error]').waitFor();
      assert.equal(await page.locator('[data-component-demo]').getAttribute('data-demo-error'), null, `${locale}/${family} preview`);
      return page.locator('[data-demo-target]');
    };
    let target = await open('button');
    await target.getByRole('button', { name: t('Save', '저장'), exact: true }).click();
    await target.getByText(t('Saved: true', '저장 여부: true'), { exact: true }).waitFor();
    await page.locator('[data-demo-reset]').click();
    await target.getByText(t('Saved: false', '저장 여부: false'), { exact: true }).waitFor();
    await page.locator('[data-demo-copy]').click();
    assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), getComponentDemo('button', locale).view);
    interactions.push(`${locale}: button Action, reset, exact JSON clipboard`);

    if (renderer === 'ui') {
      const label = t('Save changes', '변경 사항 저장');
      const option = page.locator('[data-control="text"]');
      await option.fill(label);
      await target.getByRole('button', { name: label, exact: true }).waitFor();
      const current = JSON.parse(await page.locator('[data-demo-view]').textContent());
      assert.equal(current.render.slots.default[0].inputs.text, label);
      await page.getByRole('button', { name: t('Restore default example', '기본 예제로 되돌리기') }).click();
      await target.getByRole('button', { name: t('Save', '저장'), exact: true }).waitFor();
      assert.deepEqual(JSON.parse(await page.locator('[data-demo-view]').textContent()), getComponentDemo('button', locale).view);
      interactions.push(`${locale}: live options update preview/JSON and restore original`);
    }

    target = await open('input');
    await target.getByRole('textbox').fill(t('Changed name', '바꾼 이름'));
    assert.equal(await target.getByRole('textbox').inputValue(), t('Changed name', '바꾼 이름'));
    await page.locator('[data-demo-reset]').click();
    await page.waitForFunction(value => document.querySelector('[data-demo-target] input')?.value === value, t('Avery', '서윤'));
    interactions.push(`${locale}: input State and reset`);

    target = await open('checkbox');
    await target.getByRole('checkbox').check();
    assert.equal(await target.getByRole('checkbox').isChecked(), true);
    target = await open('switch');
    await target.getByRole('switch').click();
    const toggle = target.getByRole('switch');
    if (renderer === 'ui') assert.equal(await toggle.isChecked(), false);
    else assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    interactions.push(`${locale}: checkbox and switch`);

    target = await open('tabs');
    await target.getByRole('tab', { name: t('Activity', '활동'), exact: true }).click();
    await target.getByRole('tabpanel').filter({ hasText: t('Activity from the last 7 days', '최근 7일 활동 내역') }).waitFor();
    target = await open('select');
    const selectTrigger = renderer === 'ui' ? target.locator('[data-vs-component="Select.Trigger"]') : target.getByRole('combobox');
    await selectTrigger.click();
    await page.getByRole('option', { name: t('Busan', '부산'), exact: true }).click();
    assert.match(await selectTrigger.innerText(), new RegExp(t('Busan', '부산')));
    interactions.push(`${locale}: tabs and select`);

    target = await open('accordion');
    const billing = t('Billing', '결제');
    await (renderer === 'ui'
      ? target.locator('[data-vs-component="Accordion.Trigger"]').filter({ hasText: billing })
      : target.getByRole('button', { name: billing, exact: true })).click();
    await target.getByText(t('Check your next billing date.', '다음 결제 예정일을 확인합니다.'), { exact: true }).waitFor();
    target = await open('dialog');
    await target.getByRole('button', { name: t('Share report', '보고서 공유'), exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    interactions.push(`${locale}: accordion and dialog Escape`);

    target = await open('calendar');
    const day = target.locator(renderer === 'ui' ? '[data-date="2026-11-05"]' : '[data-calendar-day][data-value="2026-11-05"]').first();
    await day.click();
    assert.equal(await day.getAttribute('data-selected'), '');
    interactions.push(`${locale}: calendar date selection`);

    if (renderer === 'ui') {
      target = await open('collapsible');
      await target.getByRole('button', { name: t('Error details', '오류 세부 정보'), exact: true }).click();
      await target.getByText(t('The report link has expired.', '보고서 연결이 만료됐습니다.'), { exact: true }).waitFor();
      await target.getByRole('button', { name: t('Error details', '오류 세부 정보'), exact: true }).click();
      await target.getByText(t('The report link has expired.', '보고서 연결이 만료됐습니다.'), { exact: true }).waitFor({ state: 'hidden' });

      target = await open('dropdown-menu');
      await target.getByRole('button', { name: t('Document actions', '문서 작업'), exact: true }).click();
      await target.getByRole('menuitem', { name: t('Duplicate', '사본 만들기'), exact: true }).click();
      await target.getByText(t('Duplicate', '사본 만들기'), { exact: true }).last().waitFor();
      await target.getByRole('menu').waitFor({ state: 'hidden' });

      target = await open('popover');
      await target.getByRole('button', { name: t('Notification settings', '알림 설정'), exact: true }).click();
      await target.getByRole('button', { name: t('Done', '완료'), exact: true }).click();
      await target.getByRole('button', { name: t('Done', '완료'), exact: true }).waitFor({ state: 'hidden' });

      target = await open('hover-card');
      await target.getByRole('link', { name: '@operations' }).hover();
      await target.getByText(t('Operations team', '운영 팀'), { exact: true }).waitFor();
      await page.mouse.move(0, 0);
      await target.getByText(t('Operations team', '운영 팀'), { exact: true }).waitFor({ state: 'hidden' });

      target = await open('tooltip');
      await target.getByRole('button', { name: t('Save shortcut', '저장 단축키'), exact: true }).focus();
      await target.getByRole('tooltip').waitFor();
      await page.keyboard.press('Escape');
      await target.getByRole('tooltip').waitFor({ state: 'hidden' });
      interactions.push(`${locale}: child slot triggers, menu Action, popover close, hover and tooltip focus/Escape`);

      target = await open('sidebar');
      await target.getByRole('button', { name: t('Settings', '설정'), exact: true }).click();
      await target.getByText(t('Workspace preferences', '작업 공간 환경 설정'), { exact: true }).waitFor();
      await target.getByText(t('Monthly reports', '월간 보고서'), { exact: true }).waitFor({ state: 'hidden' });

      target = await open('attachment');
      const downloaded = page.waitForEvent('download');
      await target.getByRole('link', { name: t('Download', '내려받기'), exact: true }).click();
      assert.equal((await downloaded).suggestedFilename(), 'monthly-report.csv');

      target = await open('sonner');
      const notifications = page.locator('[data-demo-notifications] [data-viewstem-ui]');
      await target.getByRole('button', { name: t('Show toast', '알림 보내기'), exact: true }).click();
      const toast = notifications.getByText(t('Draft saved', '초안을 저장했습니다'), { exact: true });
      await toast.waitFor();
      await notifications.getByRole('button', { name: t('Close toast', '알림 닫기'), exact: true }).click();
      await toast.waitFor({ state: 'hidden' });
      await page.locator('[data-demo-reset]').click();
      await target.getByRole('button', { name: t('Show toast', '알림 보내기'), exact: true }).click();
      await toast.waitFor();
      assert.equal(await page.locator('[data-demo-notifications]').count(), 1);
      interactions.push(`${locale}: sidebar State, unchanged CSV download, DOM Sonner host Action and cleanup/rerun`);

      target = await open('data-table');
      await target.getByRole('button', { name: t('Next', '다음'), exact: true }).click();
      await target.getByText(t('Mar', '3월'), { exact: true }).waitFor();
      await target.getByRole('searchbox').fill(t('Apr', '4월'));
      await target.getByText(t('Apr', '4월'), { exact: true }).waitFor();
      await target.getByText(t('Mar', '3월'), { exact: true }).waitFor({ state: 'hidden' });

      target = await open('date-picker');
      await target.getByRole('button').first().click();
      await target.locator('[data-date="2026-11-05"]').first().click();
      await target.locator('[data-date="2026-11-05"]').first().waitFor({ state: 'hidden' });
      assert.match(await target.getByRole('button').first().innerText(), /5/);

      target = await open('range-calendar');
      await target.locator('[data-date="2026-11-10"]').first().click();
      await target.locator('[data-date="2026-11-13"]').first().click();
      assert.equal(await target.locator('[data-date="2026-11-10"]').first().getAttribute('data-range-start'), '');
      assert.equal(await target.locator('[data-date="2026-11-13"]').first().getAttribute('data-range-end'), '');
      interactions.push(`${locale}: Data Table page/filter Actions, Date Picker and Range Calendar State`);
    }

    await open('typography');
    assert.equal(await page.locator('#starlight__sidebar [aria-current="page"]').evaluate(element => {
      const parent = document.getElementById('starlight__sidebar').getBoundingClientRect();
      const current = element.getBoundingClientRect();
      return current.top >= parent.top && current.bottom <= parent.bottom;
    }), true);
    await page.setViewportSize({ width: 375, height: 800 });
    const menu = page.getByRole('button', { name: t('Docs menu', '문서 메뉴'), exact: true });
    await menu.click();
    await page.getByRole('dialog', { name: t('Docs menu', '문서 메뉴') }).locator('[aria-current="page"]').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal(await menu.evaluate(element => element === document.activeElement), true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    interactions.push(`${locale}: long sidebar current item and mobile menu keyboard`);
  }
  assert.deepEqual(interactionErrors, []);
  await context.close();
  assert.equal(failures.length, 0, 'Component demo verification failed');
} finally {
  console.log(JSON.stringify({ renderer, checked: checks.length, checks, interactions, failures }, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
