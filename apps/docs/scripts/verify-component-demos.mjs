import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { componentDemoSlugs, getComponentDemo } from '../src/examples/component-demos.mjs';

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
      const pathname = `${locale === 'ko' ? '/ko' : ''}/docs/svelte-ui/components/${family}/`;
      errors = [];
      try {
        await page.goto(origin + pathname);
        await page.waitForFunction(() => document.querySelector('[data-demo-ready]') || document.querySelector('[data-demo-error]'), null, { timeout: 20000 });
        const observed = await page.evaluate(() => ({
          ready: document.querySelector('[data-component-demo]')?.getAttribute('data-demo-ready'),
          error: document.querySelector('[data-component-demo]')?.getAttribute('data-demo-error'),
          source: JSON.parse(document.querySelector('[data-demo-view]').textContent),
          code: document.querySelector('.source-code code').textContent,
          rendered: document.querySelector('[data-demo-target]').childElementCount,
          menu: [...document.querySelectorAll('#starlight__sidebar a')].filter(a => /\/svelte-ui\/components\//.test(a.pathname)).length,
          current: document.querySelector('#starlight__sidebar [aria-current="page"]')?.getAttribute('href'),
          width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
        }));
        assert.equal(observed.error, null);
        assert.equal(observed.ready, 'true');
        assert.deepEqual(observed.source, getComponentDemo(family, locale).view);
        assert.deepEqual(JSON.parse(observed.code), observed.source);
        assert.equal(observed.menu, 66);
        assert.equal(observed.current, pathname);
        assert.ok(observed.rendered > 0);
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
  const interactionErrors = [];
  page.on('pageerror', error => interactionErrors.push(error.message));
  for (const locale of ['en', 'ko']) {
    const ko = locale === 'ko';
    const t = (en, koText) => ko ? koText : en;
    const open = async family => {
      await page.goto(`${origin}${ko ? '/ko' : ''}/docs/svelte-ui/components/${family}/`);
      await page.locator('[data-demo-ready="true"]').waitFor();
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
    assert.equal(await target.getByRole('switch').getAttribute('aria-checked'), 'false');
    interactions.push(`${locale}: checkbox and switch`);

    target = await open('tabs');
    await target.getByRole('tab', { name: t('Activity', '활동'), exact: true }).click();
    await target.getByRole('tabpanel').filter({ hasText: t('Activity from the last 7 days', '최근 7일 활동 내역') }).waitFor();
    target = await open('select');
    await target.getByRole('combobox').click();
    await page.getByRole('option', { name: t('Busan', '부산'), exact: true }).click();
    assert.match(await target.getByRole('combobox').innerText(), new RegExp(t('Busan', '부산')));
    interactions.push(`${locale}: tabs and select`);

    target = await open('accordion');
    await target.getByRole('button', { name: t('Billing', '결제'), exact: true }).click();
    await target.getByText(t('Check your next billing date.', '다음 결제 예정일을 확인합니다.'), { exact: true }).waitFor();
    target = await open('dialog');
    await target.getByRole('button', { name: t('Share report', '보고서 공유'), exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    interactions.push(`${locale}: accordion and dialog Escape`);

    target = await open('calendar');
    const day = target.locator('[data-calendar-day][data-value="2026-11-05"]').first();
    await day.click();
    assert.equal(await day.getAttribute('data-selected'), '');
    interactions.push(`${locale}: calendar date selection`);

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
  console.log(JSON.stringify({ checked: checks.length, checks, interactions, failures }, null, 2));
  assert.equal(failures.length, 0, 'Component demo verification failed');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
