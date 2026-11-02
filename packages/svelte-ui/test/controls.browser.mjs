import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { chromium } from 'playwright';
import { startExample } from '../example/server.mjs';

let gallery, browser, page, preview;
const errors = [];
before(async () => {
  gallery = await startExample({ port: 0 });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.unhandled = [];
    window.addEventListener('unhandledrejection', event => window.unhandled.push(String(event.reason?.code ?? event.reason)));
  });
  await page.goto(gallery.url, { timeout: 30_000 });
  await page.getByText('초기 표시 완료', { exact: true }).waitFor({ timeout: 15_000 });
  preview = page.locator('#preview');
});
after(async () => {
  try {
    assert.deepEqual(errors, []);
    if (page) assert.deepEqual(await page.evaluate(() => window.unhandled), []);
  } finally {
    await browser?.close();
    await gallery?.close();
  }
});

async function family(slug) {
  await page.locator('#family').selectOption(slug);
  await page.getByText('초기 표시 완료', { exact: true }).waitFor();
  assert.equal(await page.locator('#diagnostics').textContent(), '', slug);
}
async function state(name, value) {
  await page.waitForFunction(({ name, value }) => {
    const data = JSON.parse(document.querySelector('#inspector').textContent);
    return JSON.stringify(data.states[name]?.value) === JSON.stringify(value);
  }, { name, value });
}
const exactText = value => preview.getByText(value, { exact: true });
const slot = name => preview.locator('[data-slot="' + name + '"]');

test('Accordion, Collapsible and Tabs change both Core State and visible content', async () => {
  await family('accordion');
  await preview.getByRole('button', { name: '결제', exact: true }).click();
  await state('section', 'billing');
  await exactText('다음 결제 예정일을 확인합니다.').waitFor();
  await family('collapsible');
  await preview.getByRole('button', { name: '오류 세부 정보' }).click();
  await state('open', true);
  await exactText('보고서 연결이 만료됐습니다.').waitFor();
  await family('tabs');
  await preview.getByRole('tab', { name: '요약' }).press('ArrowRight');
  await state('tab', 'activity');
  await exactText('최근 7일 활동 내역').waitFor();
});

test('Checkbox, Switch, Radio and Slider forward user input to Core State', async () => {
  await family('checkbox');
  await preview.getByRole('checkbox').press('Space');
  await state('enabled', true);
  await family('switch');
  await preview.getByRole('switch').press('Space');
  await state('enabled', false);
  await family('radio-group');
  await preview.locator('#radio-busan').click();
  await state('site', 'busan');
  await family('slider');
  await preview.getByRole('slider').press('ArrowRight');
  await state('level', 40);
});

test('Toggle, Toggle Group, Input OTP and Native Select keep controlled values', async () => {
  await family('toggle');
  await preview.getByRole('button', { name: '고정' }).click();
  await state('pinned', true);
  await family('toggle-group');
  await exactText('격자').click();
  await state('mode', 'grid');
  await family('input-otp');
  await preview.locator('input').fill('123456');
  await state('code', '123456');
  assert.deepEqual((await slot('input-otp-slot').allTextContents()).map(value => value.trim()), ['1', '2', '3', '4', '5', '6']);
  await family('native-select');
  await preview.locator('select').selectOption('busan');
  await state('site', 'busan');
});

test('Carousel navigation moves the native Embla track', async () => {
  await family('carousel');
  const slides = preview.locator('[data-embla-container]');
  const beforeTransform = await slides.evaluate(node => node.style.transform);
  await slot('carousel-next').click();
  await page.waitForFunction(beforeTransform => document.querySelector('#preview [data-embla-container]').style.transform !== beforeTransform, beforeTransform);
});

test('Resizable drag and Sidebar toggling change the layout', async () => {
  await family('resizable');
  const pane = preview.locator('[data-pane]').first();
  const beforeWidth = await pane.evaluate(node => node.getBoundingClientRect().width);
  await slot('resizable-handle').scrollIntoViewIfNeeded();
  const box = await slot('resizable-handle').boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y, { steps: 5 });
  await page.mouse.up();
  assert.ok(await pane.evaluate(node => node.getBoundingClientRect().width) > beforeWidth + 5);
  await family('sidebar');
  await slot('sidebar-trigger').click();
  await state('open', false);
});

test('Navigation Menu and Questionnaire expose their next action through native controls', async () => {
  await family('navigation-menu');
  await preview.getByRole('button', { name: '문서' }).click();
  await preview.getByRole('link', { name: '시작하기' }).waitFor();
  await page.keyboard.press('Escape');
  await family('questionnaire');
  await preview.locator('input[name=format][value=summary]').check();
  await slot('questionnaire-next').click();
  await exactText('추가 범위를 선택하세요').waitFor();
  await preview.locator('input[name=detail][value=comparison]').check();
  const url = page.url();
  await slot('questionnaire-submit').click();
  await state('submitted', true);
  assert.equal(page.url(), url);
});

test('Code Block copies content, Message Scroller returns to the end and Trace expands', async () => {
  await family('code-block');
  await slot('code-block-copy-button').click();
  await page.waitForFunction(async () => await navigator.clipboard.readText() === 'const total = 58;');
  await family('message-scroller');
  const viewport = slot('message-scroller-viewport');
  await viewport.evaluate(node => { node.scrollTop = 0; });
  await slot('message-scroller-button').click();
  await page.waitForFunction(() => {
    const view = document.querySelector('#preview [data-slot=message-scroller-viewport]');
    return view.scrollTop > 20 && view.scrollHeight - view.clientHeight - view.scrollTop < 12;
  });
  await family('trace');
  await preview.getByRole('button', { name: '실행 단계 보기' }).click();
  await exactText('파일 4개 읽기').waitFor();
});
