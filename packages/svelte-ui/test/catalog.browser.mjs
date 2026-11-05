import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createAuditHarness, read, replace, waitState } from './fixtures/audit-harness.mjs';
import { svelteConsumerPlugin } from './fixtures/svelte-consumer-plugin.mjs';
import { fixtureComponentIds, rawCompositionComponentIds, sampleBySlug, samples } from './fixtures/samples.mjs';

const inventory = JSON.parse(await readFile(new URL('../../../docs/handoff/shadcn-component-inventory.json', import.meta.url)));
const styles = fileURLToPath(import.meta.resolve('@viewstem/svelte-ui/shadcn/styles.css'));
let harness;
before(async () => { harness = await createAuditHarness({ fullCatalog: true }); });
after(async () => { await harness?.close(); });

const setup = (t, slug) => harness.setup(t, sampleBySlug.get(slug).view);
const select = (page, slug) => replace(page, sampleBySlug.get(slug).view);

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

async function openRawPage(t) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(4000);
  page.setDefaultNavigationTimeout(30_000);
  const errors = [];
  page.on('pageerror', error => errors.push({ family: page.url(), message: error.message }));
  const trackUnhandled = () => {
    window.unhandled = [];
    window.addEventListener('unhandledrejection', event => window.unhandled.push(String(event.reason?.code ?? event.reason)));
  };
  await page.evaluate(trackUnhandled);
  t.after(async () => {
    try {
      assert.deepEqual(errors, [], 'no browser errors');
      assert.deepEqual(await page.evaluate(() => window.unhandled), [], 'no unhandled rejections');
    } finally {
      await browser.close();
    }
  });
  return page;
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
  const page = await setup(t, samples[0].slug);
  const failures = [];
  for (const { slug } of samples) {
    try {
      await select(page, slug);
      const witness = witnesses[slug] ?? '[data-slot="' + slug + '"]';
      await page.locator('#app').locator(witness).first().waitFor({ state: 'attached' });
    } catch (error) {
      failures.push({ slug, error: error.message.split('\n')[0] });
    }
  }
  assert.deepEqual(failures, []);
});

test('Action, Korean input, Query and rejected replacement use the live View', async t => {
  const page = await setup(t, 'button');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await waitState(page, 'saved', true);
  await page.getByText('저장 여부: true', { exact: true }).waitFor();
  const invalid = structuredClone(sampleBySlug.get('button').view);
  invalid.render.inputs = { ...invalid.render.inputs, unsupportedInput: true };
  const code = await page.evaluate(async view => {
    try {
      await (await mounted.replace({ view })).initialComplete;
    } catch (error) {
      return error.code;
    }
  }, invalid);
  assert.equal(code, 'INVALID_DEFINITION');
  assert.equal(await read(page, 'saved'), true);
  await page.getByText('저장 여부: true', { exact: true }).waitFor();
  await select(page, 'button');
  assert.equal(await read(page, 'saved'), false);
  await select(page, 'input');
  const input = page.getByRole('textbox', { name: '이름' });
  await input.fill('하늘');
  await waitState(page, 'name', '하늘');
  const intermediate = await input.evaluate(async element => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.value = 'ㅎ';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'ㅎ', isComposing: true }));
    await new Promise(requestAnimationFrame);
    return mounted.view.getState('name').read();
  });
  assert.equal(intermediate, '하늘');
  await input.evaluate(element => {
    element.value = '한글';
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한글' }));
  });
  await waitState(page, 'name', '한글');
  await select(page, 'data-table');
  await page.waitForFunction(() => mounted.view.getSnapshot().queries.metrics?.status === 'success');
  assert.equal(await page.locator('#app table tbody tr').count(), 2);
  await page.getByRole('searchbox', { name: 'Filter rows' }).fill('4월');
  await waitState(page, 'filter', '4월');
  await page.locator('#app tbody').getByText('4월', { exact: true }).waitFor();
});

test('Command searches Korean labels while preserving stable values', async t => {
  const page = await setup(t, 'command');
  const input = page.getByPlaceholder('명령 검색', { exact: true });
  const preview = page.locator('#app');
  for (const [query, label, value] of [['환경', '환경 설정', 'settings'], ['보고서', '보고서 열기', 'open'], ['도움', '도움말', 'help']]) {
    await input.fill(query);
    await preview.getByRole('option', { name: new RegExp(label) }).waitFor();
    assert.equal(await preview.getByRole('option').count(), 1);
    await waitState(page, 'selected', value);
    assert.equal(await input.inputValue(), query);
    assert.equal(await input.evaluate(element => element === document.activeElement), true);
  }
  await input.fill('없는 명령');
  await preview.getByText('검색 결과가 없습니다.', { exact: true }).waitFor();
  await input.fill('');
  assert.equal(await preview.getByRole('option').count(), 3);
});

test('modal child triggers, menu portals and selection use native controls', { timeout: 45_000 }, async t => {
  const page = await setup(t, 'button');
  for (const [slug, title, role] of [
    ['dialog', '보고서 공유', 'dialog'],
    ['alert-dialog', '보고서 삭제', 'alertdialog'],
    ['sheet', '내보내기 옵션', 'dialog'],
    ['drawer', '필터 설정', 'dialog'],
  ]) {
    await select(page, slug);
    const trigger = page.locator('#app').getByRole('button', { name: title, exact: true });
    await trigger.click();
    const overlay = page.getByRole(role, { name: title });
    await overlay.waitFor();
    await waitState(page, 'open', true);
    assert.equal(await page.locator('#app button button').count(), 0);
    await overlay.getByRole('button', { name: '닫기', exact: true }).click();
    await overlay.waitFor({ state: 'hidden' });
    await waitState(page, 'open', false);
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
    await page.locator('#app').getByText(label, { exact: true }).click({ button });
    await page.getByRole('menuitem', { name: /사본 만들기/ }).click();
    await waitState(page, 'selection', '사본 만들기');
  }
  await select(page, 'select');
  await page.locator('#app').getByRole('combobox').click();
  await page.getByRole('option', { name: '부산' }).click();
  await waitState(page, 'site', 'busan');
  await select(page, 'tooltip');
  const tooltipTrigger = page.locator('#app').getByRole('button', { name: '저장 단축키' });
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
  const page = await openRawPage(t);
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

// Upstream preflight is part of the component contract, scoped away from host UI.
test('original preflight resets widget headings, SVG and hidden states without resetting the host', async t => {
  const page = await openRawPage(t);
  await page.setContent('<div id="host"><h3>Host heading</h3><svg></svg></div><div id="native" data-viewstem-shadcn style="font-size:14px"><h3>Widget heading</h3><svg></svg><div hidden class="flex">Hidden step</div></div>');
  const readHost = () => page.locator('#host').evaluate(root => [...root.children].map(el => {
    const s=getComputedStyle(el);return [s.fontSize,s.fontWeight,s.marginTop,s.display];
  }));
  const host = await readHost();
  await page.addStyleTag({ path: styles });
  assert.deepEqual(await readHost(), host);
  assert.deepEqual(await page.locator('#native h3').evaluate(el => {
    const s=getComputedStyle(el);return [s.fontSize,s.fontWeight,s.marginTop];
  }), ['14px','400','0px']);
  assert.equal(await page.locator('#native svg').evaluate(el => getComputedStyle(el).display), 'block');
  assert.equal(await page.locator('#native [hidden]').isVisible(), false);
});

test('Marker keeps its original styled root when props are spread', async t => {
  const page = await setup(t, 'marker');
  const marker = page.locator('[data-slot="marker"]').first();
  assert.equal(await marker.getAttribute('data-viewstem-shadcn'), '');
  assert.deepEqual(await marker.evaluate(el => {
    const s=getComputedStyle(el);return [s.display,s.fontSize,s.lineHeight];
  }), ['flex','14px','20px']);
});
