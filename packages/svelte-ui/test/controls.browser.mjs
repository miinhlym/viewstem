import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createAuditHarness, replace, waitState } from './fixtures/audit-harness.mjs';
import { sampleBySlug } from './fixtures/samples.mjs';

let harness;
before(async () => { harness = await createAuditHarness({ fullCatalog: true }); });
after(async () => { await harness?.close(); });

const setup = (t, slug, options) => harness.setup(t, sampleBySlug.get(slug).view, options);
const family = (page, slug) => replace(page, sampleBySlug.get(slug).view);
const slot = (preview, name) => preview.locator(`[data-slot="${name}"]`);

test('Accordion, Collapsible and Tabs change both Core State and visible content', async t => {
  const page = await setup(t, 'accordion');
  const preview = page.locator('#app');
  await preview.getByRole('button', { name: '결제', exact: true }).click();
  await waitState(page, 'section', 'billing');
  await preview.getByText('다음 결제 예정일을 확인합니다.', { exact: true }).waitFor();
  await family(page, 'collapsible');
  await preview.getByRole('button', { name: '오류 세부 정보' }).click();
  await waitState(page, 'open', true);
  await preview.getByText('보고서 연결이 만료됐습니다.', { exact: true }).waitFor();
  await family(page, 'tabs');
  await preview.getByRole('tab', { name: '요약' }).press('ArrowRight');
  await waitState(page, 'tab', 'activity');
  await preview.getByText('최근 7일 활동 내역', { exact: true }).waitFor();
});

test('Checkbox, Switch, Radio and Slider forward user input to Core State', async t => {
  const page = await setup(t, 'checkbox');
  const preview = page.locator('#app');
  await preview.getByRole('checkbox').press('Space');
  await waitState(page, 'enabled', true);
  await family(page, 'switch');
  await preview.getByRole('switch').press('Space');
  await waitState(page, 'enabled', false);
  await family(page, 'radio-group');
  await preview.locator('#radio-busan').click();
  await waitState(page, 'site', 'busan');
  await family(page, 'slider');
  await preview.getByRole('slider').press('ArrowRight');
  await waitState(page, 'level', 40);
});

test('Toggle, Toggle Group, Input OTP and Native Select keep controlled values', async t => {
  const page = await setup(t, 'toggle');
  const preview = page.locator('#app');
  await preview.getByRole('button', { name: '고정' }).click();
  await waitState(page, 'pinned', true);
  await family(page, 'toggle-group');
  await preview.getByText('격자', { exact: true }).click();
  await waitState(page, 'mode', 'grid');
  await family(page, 'input-otp');
  await preview.locator('input').fill('123456');
  await waitState(page, 'code', '123456');
  assert.deepEqual((await slot(preview, 'input-otp-slot').allTextContents()).map(value => value.trim()), ['1', '2', '3', '4', '5', '6']);
  await family(page, 'native-select');
  await preview.locator('select').selectOption('busan');
  await waitState(page, 'site', 'busan');
});

test('Carousel navigation moves the native Embla track', async t => {
  const page = await setup(t, 'carousel');
  const preview = page.locator('#app');
  const slides = preview.locator('[data-embla-container]');
  const beforeTransform = await slides.evaluate(node => node.style.transform);
  await slot(preview, 'carousel-next').click();
  await page.waitForFunction(beforeTransform => document.querySelector('#app [data-embla-container]').style.transform !== beforeTransform, beforeTransform);
});

test('Resizable drag and Sidebar toggling change the layout', async t => {
  const page = await setup(t, 'resizable');
  const preview = page.locator('#app');
  const pane = preview.locator('[data-pane]').first();
  const beforeWidth = await pane.evaluate(node => node.getBoundingClientRect().width);
  await slot(preview, 'resizable-handle').scrollIntoViewIfNeeded();
  const box = await slot(preview, 'resizable-handle').boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y, { steps: 5 });
  await page.mouse.up();
  assert.ok(await pane.evaluate(node => node.getBoundingClientRect().width) > beforeWidth + 5);
  await family(page, 'sidebar');
  await slot(preview, 'sidebar-trigger').click();
  await waitState(page, 'open', false);
});

test('Navigation Menu and Questionnaire expose their next action through native controls', async t => {
  const page = await setup(t, 'navigation-menu', { viewport: { width: 460, height: 700 } });
  const preview = page.locator('#app');
  await preview.getByRole('button', { name: '문서' }).click();
  await preview.getByRole('link', { name: '시작하기' }).waitFor();
  assert.equal(await slot(preview, 'navigation-menu-viewport').count(), 1);
  await preview.getByRole('link', { name: 'API', exact: true }).click();
  assert.equal(new URL(page.url()).hash, '#api');
  await family(page, 'questionnaire');
  await preview.locator('input[name=format][value=summary]').check();
  await slot(preview, 'questionnaire-next').click();
  await preview.getByText('추가 범위를 선택하세요', { exact: true }).waitFor();
  await preview.locator('input[name=detail][value=comparison]').check();
  const url = page.url();
  await slot(preview, 'questionnaire-submit').click();
  await waitState(page, 'submitted', true);
  assert.equal(page.url(), url);
});

test('Code Block copies content, Message Scroller returns to the end and Trace expands', async t => {
  const page = await setup(t, 'code-block');
  const preview = page.locator('#app');
  await slot(preview, 'code-block-copy-button').click();
  await page.waitForFunction(async () => await navigator.clipboard.readText() === 'const total = 58;');
  await family(page, 'message-scroller');
  const viewport = slot(preview, 'message-scroller-viewport');
  await viewport.evaluate(node => { node.scrollTop = 0; });
  await slot(preview, 'message-scroller-button').click();
  await page.waitForFunction(() => {
    const view = document.querySelector('#app [data-slot=message-scroller-viewport]');
    return view.scrollTop > 20 && view.scrollHeight - view.clientHeight - view.scrollTop < 12;
  });
  await family(page, 'trace');
  await preview.getByRole('button', { name: '실행 단계 보기' }).click();
  await preview.getByText('파일 4개 읽기', { exact: true }).waitFor();
});
