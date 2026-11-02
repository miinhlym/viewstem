import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { startExample, svelteConsumerPlugin } from '../example/server.mjs';
import { fixtureComponentIds, rawCompositionComponentIds, samples } from './fixtures/samples.mjs';

const inventory = JSON.parse(await readFile(new URL('../../../docs/handoff/shadcn-component-inventory.json', import.meta.url)));
const styles = fileURLToPath(import.meta.resolve('@viewstem/svelte-ui/shadcn/styles.css'));
let gallery, browser;
before(async () => {
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await gallery?.then(app => app.close(), () => {});
});
const galleryApp = () => gallery ??= startExample({ port: 0 });

const witnesses = {
  'alert-dialog': 'button',
  avatar: '[data-slot=avatar-fallback]',
  calendar: '[role=grid]',
  chart: 'figure svg',
  combobox: 'button[role=combobox]',
  'context-menu': '[data-slot=context-menu-trigger]',
  'data-table': 'table tbody tr',
  'date-picker': 'button',
  dialog: 'button',
  drawer: 'button',
  'dropdown-menu': '[data-slot=dropdown-menu-trigger]',
  'hover-card': '[data-slot=hover-card-trigger]',
  input: 'input#name',
  'input-otp': 'input',
  kbd: 'kbd',
  label: 'label[for=label-example]',
  'native-select': 'select',
  popover: '[data-slot=popover-trigger]',
  'range-calendar': '[role=grid]',
  resizable: '[data-slot=resizable-pane-group]',
  select: '[role=combobox]',
  sheet: 'button',
  sonner: 'button',
  spinner: 'svg',
  textarea: 'textarea',
  tooltip: '[data-slot=tooltip-trigger]',
  typography: 'h1',
};

async function openPage(t) {
  const page = await browser.newPage();
  page.setDefaultTimeout(4000);
  page.setDefaultNavigationTimeout(30_000);
  const errors = [];
  page.on('pageerror', error => errors.push({ family: page.url(), message: error.message }));
  const trackUnhandled = () => {
    window.unhandled = [];
    window.addEventListener('unhandledrejection', event => window.unhandled.push(String(event.reason?.code ?? event.reason)));
  };
  await page.addInitScript(trackUnhandled);
  await page.evaluate(trackUnhandled);
  t.after(async () => {
    try {
      assert.deepEqual(errors, [], 'no browser errors');
      assert.deepEqual(await page.evaluate(() => window.unhandled), [], 'no unhandled rejections');
    } finally {
      await page.close();
    }
  });
  return page;
}

const status = page => page.locator('#status');
const ready = page => page.getByText('초기 표시 완료', { exact: true }).waitFor({ timeout: 15_000 });
async function select(page, slug) {
  await page.locator('#family').selectOption(slug);
  await page.waitForFunction(() => {
    const value = document.querySelector('#status').textContent;
    return value === '초기 표시 완료' || value === '적용 실패' || document.querySelector('#diagnostics').textContent.length > 0;
  }, undefined, { timeout: 4000 });
  assert.equal(await page.locator('#diagnostics').textContent(), '', slug);
  assert.equal(await status(page).textContent(), '초기 표시 완료', slug);
}
async function hasState(page, name, expected) {
  await page.waitForFunction(({ name, expected }) => {
    const value = JSON.parse(document.querySelector('#inspector').textContent).states[name]?.value;
    return JSON.stringify(value) === JSON.stringify(expected);
  }, { name, expected });
}

test('catalog fixtures account for each upstream family and public component binding', async () => {
  assert.deepEqual(samples.map(sample => sample.slug).sort(), inventory.catalogItems.map(item => item.slug).sort());
  const direct = new Set(samples.flatMap(sample => [...fixtureComponentIds(sample.view)]));
  const raw = new Set(rawCompositionComponentIds);
  const pascal = slug => slug.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
  const expected = inventory.catalogItems.flatMap(item => item.componentExports.map(component => {
    const family = pascal(item.slug);
    const binding = component.binding.startsWith(family) && component.binding !== family
      ? component.binding.slice(family.length) : component.binding;
    return 'shadcn.' + family + (item.componentExports.length === 1 ? '' : '.' + binding);
  }));
  assert.equal(expected.length, 386);
  assert.deepEqual(expected.filter(id => !direct.has(id) && !raw.has(id)), []);
  assert.deepEqual([...raw].filter(id => direct.has(id) || !expected.includes(id)), []);
  assert.equal(expected.filter(id => direct.has(id)).length, 351);
  const rawSource = await readFile(new URL('./fixtures/RawComposition.svelte', import.meta.url), 'utf8');
  for (const id of raw) {
    const [, family, part] = id.split('.');
    const binding = family === 'Chart' ? 'Chart' + part : part;
    assert.match(rawSource, new RegExp('<' + family + '\\.' + binding + '(?:\\s|/|>)'), id);
  }
});

test('all 66 JSON examples render their expected UI through installed package exports', { timeout: 180_000 }, async t => {
  const page = await openPage(t);
  await page.goto((await galleryApp()).url);
  await ready(page);
  assert.equal(await page.locator('#family option').count(), 66);
  const failures = [];
  for (const { slug } of samples) {
    try {
      await select(page, slug);
      const witness = witnesses[slug] ?? '[data-slot="' + slug + '"]';
      await page.locator('#preview').locator(witness).first().waitFor({ state: 'attached' });
    } catch (error) {
      failures.push({ slug, status: await status(page).textContent(), diagnostic: await page.locator('#diagnostics').textContent(), error: error.message.split('\n')[0] });
    }
  }
  assert.deepEqual(failures, []);
});

test('gallery Action, Korean input, Query and rejected JSON use the live View', async t => {
  const page = await openPage(t);
  await page.goto((await galleryApp()).url);
  await ready(page);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await hasState(page, 'saved', true);
  await page.getByText('저장 여부: true', { exact: true }).waitFor();
  await page.getByRole('button', { name: '오류 예제' }).click();
  await page.getByText('적용 실패', { exact: true }).waitFor();
  assert.match(await page.locator('#diagnostics').textContent(), /INVALID_DEFINITION/);
  await hasState(page, 'saved', true);
  await page.getByRole('button', { name: '예제 복원' }).click();
  await ready(page);
  await hasState(page, 'saved', false);
  await select(page, 'input');
  const input = page.getByRole('textbox', { name: '이름' });
  await input.fill('하늘');
  await hasState(page, 'name', '하늘');
  const intermediate = await input.evaluate(async element => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.value = 'ㅎ';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'ㅎ', isComposing: true }));
    await new Promise(requestAnimationFrame);
    return JSON.parse(document.querySelector('#inspector').textContent).states.name.value;
  });
  assert.equal(intermediate, '하늘');
  await input.evaluate(element => {
    element.value = '한글';
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한글' }));
  });
  await hasState(page, 'name', '한글');
  await select(page, 'data-table');
  await page.waitForFunction(() => JSON.parse(document.querySelector('#inspector').textContent).queries.metrics?.status === 'success');
  assert.equal(await page.locator('#preview table tbody tr').count(), 2);
  await page.getByRole('searchbox', { name: 'Filter rows' }).fill('4월');
  await hasState(page, 'filter', '4월');
  await page.locator('#preview tbody').getByText('4월', { exact: true }).waitFor();
});

test('Command gallery searches Korean labels while preserving stable values', async t => {
  const page = await openPage(t);
  await page.goto((await galleryApp()).url + '/?family=command');
  await ready(page);
  const input = page.getByPlaceholder('명령 검색', { exact: true });
  const preview = page.locator('#preview');
  for (const [query, label, value] of [['환경', '환경 설정', 'settings'], ['보고서', '보고서 열기', 'open'], ['도움', '도움말', 'help']]) {
    await input.fill(query);
    await preview.getByRole('option', { name: new RegExp(label) }).waitFor();
    assert.equal(await preview.getByRole('option').count(), 1);
    await hasState(page, 'selected', value);
    assert.equal(await input.inputValue(), query);
    assert.equal(await input.evaluate(element => element === document.activeElement), true);
  }
  await input.fill('없는 명령');
  await preview.getByText('검색 결과가 없습니다.', { exact: true }).waitFor();
  await input.fill('');
  assert.equal(await preview.getByRole('option').count(), 3);
});

test('modal child triggers, menu portals and selection use native controls', { timeout: 45_000 }, async t => {
  const page = await openPage(t);
  await page.goto((await galleryApp()).url);
  await ready(page);
  for (const [slug, title, role] of [
    ['dialog', '보고서 공유', 'dialog'],
    ['alert-dialog', '보고서 삭제', 'alertdialog'],
    ['sheet', '내보내기 옵션', 'dialog'],
    ['drawer', '필터 설정', 'dialog'],
  ]) {
    await select(page, slug);
    const trigger = page.locator('#preview').getByRole('button', { name: title, exact: true });
    await trigger.click();
    const overlay = page.getByRole(role, { name: title });
    await overlay.waitFor();
    await hasState(page, 'open', true);
    assert.equal(await page.locator('#preview button button').count(), 0);
    await overlay.getByRole('button', { name: '닫기', exact: true }).click();
    await overlay.waitFor({ state: 'hidden' });
    await hasState(page, 'open', false);
    await page.waitForFunction(() => {
      const style = document.body.style;
      return style.pointerEvents !== 'none' && style.overflow !== 'hidden';
    });
  }
  for (const [slug, label, button] of [
    ['dropdown-menu', '문서 작업', 'left'],
    ['context-menu', '여기를 마우스 오른쪽 버튼으로 클릭', 'right'],
    ['menubar', '파일', 'left'],
  ]) {
    await select(page, slug);
    await page.locator('#preview').getByText(label, { exact: true }).click({ button });
    await page.getByRole('menuitem', { name: /사본 만들기/ }).click();
    await hasState(page, 'selection', '사본 만들기');
  }
  await select(page, 'select');
  await page.locator('#preview').getByRole('combobox').click();
  await page.getByRole('option', { name: '부산' }).click();
  await hasState(page, 'site', 'busan');
  await select(page, 'tooltip');
  const tooltipTrigger = page.locator('#preview').getByRole('button', { name: '저장 단축키' });
  await tooltipTrigger.hover();
  const tooltip = page.locator('[data-slot=tooltip-content]').filter({ hasText: '⌘S로 변경 사항을 저장합니다.' });
  await tooltip.waitFor();
  const tooltipId = await tooltip.getAttribute('id');
  assert.ok(tooltipId);
  assert.equal(await tooltipTrigger.getAttribute('aria-describedby'), tooltipId);
});

test('host namespace exposes calendar and chart parts inside their native scoped contexts', { timeout: 45_000 }, async t => {
  const source = fileURLToPath(new URL('./fixtures/RawComposition.svelte', import.meta.url));
  const bundle = await build({
    stdin: { contents: `import { mount } from 'svelte'; import Fixture from ${JSON.stringify(source)}; mount(Fixture, { target: document.querySelector('main') });`, resolveDir: dirname(source) },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    conditions: ['svelte', 'browser'], plugins: [svelteConsumerPlugin],
  });
  const page = await openPage(t);
  await page.setContent('<main></main>');
  await page.addStyleTag({ path: styles });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for (const family of ['Calendar', 'RangeCalendar']) {
    const context = page.locator('[data-fixture="' + family + '"]');
    assert.equal(await context.getByRole('grid').count(), 1, family);
    assert.equal(await context.getByRole('combobox').count(), 2, family);
    assert.ok(await context.getByRole('gridcell').count() >= 28, family);
  }
  const chart = page.locator('[data-fixture=Chart] svg').first();
  await chart.scrollIntoViewIfNeeded();
  const bounds = await chart.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.55);
  const tooltip = page.locator('[data-raw-tooltip]');
  await tooltip.waitFor();
  assert.match(await tooltip.textContent(), /처리량/);
});

test('gallery panels use the viewport and keep the inspector scrollable on desktop and narrow screens', async t => {
  const page = await openPage(t);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto((await galleryApp()).url);
  await ready(page);
  const desktop = await page.evaluate(() => ({
    height: innerHeight, page: document.documentElement.scrollHeight,
    editor: document.querySelector('#definition').getBoundingClientRect().height,
    inspector: document.querySelector('#inspector').getBoundingClientRect().height,
    panel: document.querySelector('details').getBoundingClientRect().height,
  }));
  assert.ok(desktop.page <= desktop.height + 1, JSON.stringify(desktop));
  assert.ok(desktop.editor > desktop.height * .75);
  assert.ok(desktop.inspector < desktop.panel);
  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await page.evaluate(() => ({ width: innerWidth, page: document.documentElement.scrollWidth,
    editor: document.querySelector('#definition').getBoundingClientRect().height,
    preview: document.querySelector('#preview').getBoundingClientRect().height,
  }));
  assert.ok(narrow.page <= narrow.width, JSON.stringify(narrow));
  assert.ok(narrow.editor > 200 && narrow.preview > 200);
});
