import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { chromium } from 'playwright';
import { createRegistry, createRuntime } from '@viewstem/core';
import { startExample } from '../example/server.mjs';
import { scenarios } from '../example/scenarios.mjs';

let browser, app;
before(async () => {
  app = await startExample({ port: 0 });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await app?.close(); });

async function ready(page) {
  try {
    await page.waitForFunction(() => ['초기 표시 완료', '적용 실패'].includes(document.querySelector('#status').textContent), undefined, { timeout: 15_000 });
    assert.equal(await page.locator('#status').textContent(), '초기 표시 완료');
  }
  catch (error) { throw new Error(`${page.url()} ${await page.locator('#status').textContent()} ${await page.locator('#diagnostics').textContent()} ${await page.locator('#inspector').textContent()}`, { cause: error }); }
  assert.equal(await page.locator('#diagnostics').textContent(), '');
}
async function open(t, slug) {
  const page = await browser.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.unhandled = [];
    window.addEventListener('unhandledrejection', event => unhandled.push(String(event.reason?.code ?? event.reason)));
  });
  t.after(async () => {
    try {
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.unhandled), []);
      assert.equal(await page.locator('#diagnostics').textContent(), '');
    } finally { await page.close(); }
  });
  await page.goto(app.url + '/?example=' + slug);
  await ready(page);
  return page;
}
const snapshot = page => page.locator('#inspector').textContent().then(JSON.parse);
async function stateIs(page, name, expected) {
  await page.waitForFunction(({ name, expected }) => {
    const [root, ...fields] = name.split('/');
    let value = JSON.parse(document.querySelector('#inspector').textContent).states[root]?.value;
    for (const field of fields) value = value?.[field];
    return JSON.stringify(value) === JSON.stringify(expected);
  }, { name, expected });
}

test('screen State schemas reject incomplete or invalid forms and preserve the previous value', async () => {
  const registry = createRegistry();
  registry.registerComponentContract({ kind: 'Component', id: 'Empty', spec: {} });
  const runtime = createRuntime({ registry });
  try {
    for (const { slug, view: definition } of scenarios) {
      for (const declaration of Object.values(definition.states)) assert.equal(typeof declaration.schema, 'object');
      const { view, initialComplete } = await runtime.createView({ view: { states: definition.states, render: { id: 'empty', componentRef: 'Empty' } } });
      await initialComplete;
      const name = slug === 'dashboard' ? 'period' : 'form';
      const cell = view.getState(name);
      const before = cell.getSnapshot();
      const initial = cell.read();
      const invalid = slug === 'dashboard' ? ['quarter', 42] : [
        {}, { ...initial, unexpected: true },
        { ...initial, [slug === 'pricing' ? 'seats' : 'name']: slug === 'pricing' ? '5' : 42 },
        ...(slug === 'pricing' ? [{ ...initial, seats: 0 }, { ...initial, seats: 21 }] : []),
        ...(slug === 'booking' ? [{ ...initial, date: '2026-02-30' }] : []),
      ];
      for (const value of invalid) {
        assert.throws(() => cell.write(value), { code: 'TYPE_MISMATCH' }, slug);
        assert.equal(cell.getSnapshot(), before, slug + ': failed writes retain the previous snapshot');
      }
      if (slug === 'booking') {
        cell.write({ ...initial, date: null });
        assert.equal(view.getState('invalid').read(), true);
        assert.equal(cell.read().room, initial.room);
      }
      view.dispose();
    }
  } finally { runtime.dispose(); }
});

test('five full-screen examples are serializable, addressable and switch back to the 66 component samples', async t => {
  const page = await open(t, 'profile');
  assert.equal(await page.locator('#family option').count(), 5);
  for (const scenario of scenarios) {
    await page.locator('#family').selectOption(scenario.slug);
    await ready(page);
    assert.equal(new URL(page.url()).searchParams.get('example'), scenario.slug);
    assert.deepEqual(JSON.parse(await page.locator('#definition').inputValue()), JSON.parse(JSON.stringify(scenario.view)));
    assert.ok(await page.locator('#preview [data-slot]').count() > 5);
    assert.deepEqual((await snapshot(page)).errors, []);
  }
  await page.locator('#example-kind').selectOption('components');
  await ready(page);
  assert.equal(await page.locator('#family option').count(), 66);
  await page.locator('#preview').getByRole('button', { name: '저장', exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('family'), 'button');
  await page.locator('#example-kind').selectOption('screens');
  await ready(page);
  await page.getByRole('button', { name: '설정 적용' }).waitFor();
});

test('profile validation, tabs and settings persist through Actions and restore resets the example', async t => {
  const page = await open(t, 'profile');
  const apply = page.getByRole('button', { name: '설정 적용' });
  await page.getByLabel('이름', { exact: true }).fill('');
  await stateIs(page, 'nameInvalid', true);
  assert.equal(await page.getByLabel('이름', { exact: true }).getAttribute('aria-invalid'), 'true');
  assert.equal(await page.getByLabel('이메일', { exact: true }).getAttribute('aria-invalid'), 'false');
  await page.getByLabel('이름', { exact: true }).fill('한글 사용자');
  await page.getByLabel('이메일', { exact: true }).fill('invalid');
  await stateIs(page, 'invalid', true);
  assert.equal(await apply.isDisabled(), true);
  await page.getByLabel('이메일', { exact: true }).fill('hangul@example.com');
  await stateIs(page, 'invalid', false);
  await apply.click();
  await stateIs(page, 'receipt', { name: '한글 사용자', email: 'hangul@example.com', team: 'product', emailAlerts: true, weeklyReport: false });
  await page.getByText('한글 사용자 · hangul@example.com', { exact: true }).waitFor();
  await page.getByRole('tab', { name: '알림', exact: true }).click();
  await page.getByRole('switch', { name: '주간 리포트' }).click();
  await stateIs(page, 'form/weeklyReport', true);
  assert.equal((await snapshot(page)).states.receipt.value.weeklyReport, false);
  await page.getByRole('switch', { name: '이메일 알림', exact: true }).click();
  await stateIs(page, 'form/emailAlerts', false);
  await apply.click();
  await stateIs(page, 'receipt', { name: '한글 사용자', email: 'hangul@example.com', team: 'product', emailAlerts: false, weeklyReport: true });
  await page.getByRole('tab', { name: '프로필', exact: true }).click();
  assert.equal(await page.getByLabel('이름', { exact: true }).inputValue(), '한글 사용자');
  await page.getByLabel('이름', { exact: true }).fill('저장 전 수정');
  await page.getByLabel('팀', { exact: true }).selectOption('design');
  await stateIs(page, 'form/team', 'design');
  assert.equal((await snapshot(page)).states.form.value.weeklyReport, true);
  assert.equal((await snapshot(page)).states.receipt.value.name, '한글 사용자');
  await page.getByRole('button', { name: '변경 취소', exact: true }).click();
  await stateIs(page, 'form', { name: '한글 사용자', email: 'hangul@example.com', team: 'product', emailAlerts: false, weeklyReport: true });
  await page.getByRole('button', { name: '예제 복원' }).click();
  await ready(page);
  await stateIs(page, 'form', { name: '김서윤', email: 'seoyun@example.com', team: 'product', emailAlerts: true, weeklyReport: false });
  await stateIs(page, 'receipt', null);
  await stateIs(page, 'saved', false);
});

test('customer filters, Query results and modal additions share the same State', async t => {
  const page = await open(t, 'customers');
  assert.equal((await snapshot(page)).queries.customers.data.length, 6);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await stateIs(page, 'pagination/pageIndex', 1);
  await page.getByLabel('고객 상태', { exact: true }).selectOption('체험');
  await stateIs(page, 'pagination', { pageIndex: 0, pageSize: 4 });
  await page.waitForFunction(() => JSON.parse(document.querySelector('#inspector').textContent).queries.customers.data.length === 2);
  assert.equal(await page.locator('#preview tbody tr').count(), 2);
  await page.getByLabel('Rows per page').selectOption('10');
  await stateIs(page, 'pagination', { pageIndex: 0, pageSize: 10 });
  await page.getByRole('searchbox').fill('하린');
  await stateIs(page, 'filters', { segment: '체험', search: '하린' });
  assert.equal(await page.locator('#preview tbody tr').count(), 1);
  await page.getByRole('checkbox', { name: 'Select row c4' }).check();
  await stateIs(page, 'selected', ['c4']);
  await page.getByText('1명 선택', { exact: true }).waitFor();
  await page.getByRole('button', { name: '고객 추가' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('이름', { exact: true }).fill('취소할 입력');
  await dialog.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await stateIs(page, 'form', { name: '', email: '', company: '' });
  await page.getByRole('button', { name: '고객 추가' }).click();
  assert.equal(await dialog.getByRole('button', { name: '추가', exact: true }).isDisabled(), true);
  await dialog.getByLabel('이름', { exact: true }).fill('한가람');
  await dialog.getByLabel('이메일', { exact: true }).fill('garam@example.com');
  await dialog.getByLabel('회사', { exact: true }).fill('새 회사');
  await stateIs(page, 'form', { name: '한가람', email: 'garam@example.com', company: '새 회사' });
  await dialog.getByRole('button', { name: '추가', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => JSON.parse(document.querySelector('#inspector').textContent).queries.customers.data.length === 7);
  await stateIs(page, 'form', { name: '', email: '', company: '' });
  await stateIs(page, 'filters', { segment: 'all', search: '' });
  await stateIs(page, 'pagination', { pageIndex: 0, pageSize: 10 });
  await stateIs(page, 'selected', []);
  assert.deepEqual((await snapshot(page)).states.rows.value.at(-1), { id: 'c7', name: '한가람', email: 'garam@example.com', company: '새 회사', status: '체험' });
  await page.getByRole('searchbox').fill('한가람');
  await page.locator('#preview tbody').getByText('한가람', { exact: true }).waitFor();
  assert.equal(await page.locator('#preview tbody tr').count(), 1);
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).pointerEvents), 'none');
});

test('booking requires a name and captures the selected room, date and time before cancellation', async t => {
  const page = await open(t, 'booking');
  const confirm = page.getByRole('button', { name: '예약 확인', exact: true });
  assert.equal(await confirm.isDisabled(), true);
  await page.getByLabel('예약자', { exact: true }).fill('이하늘');
  await page.getByLabel('시작 시간').selectOption('14:00');
  await page.getByRole('combobox', { name: '서울 A · 6인' }).click();
  await page.getByRole('option', { name: '서울 B · 10인' }).click();
  await page.getByLabel('요청 사항').fill('화이트보드');
  await confirm.click();
  await stateIs(page, 'receipt', { name: '이하늘', date: '2026-11-10', room: 'Seoul B', time: '14:00', note: '화이트보드' });
  await page.getByText('예약 확인서', { exact: true }).waitFor();
  await page.getByLabel('요청 사항').fill('수정한 요청');
  await stateIs(page, 'form/note', '수정한 요청');
  assert.equal((await snapshot(page)).states.receipt.value.note, '화이트보드');
  await page.getByRole('button', { name: '예약 취소', exact: true }).click();
  await stateIs(page, 'confirmed', false);
  await stateIs(page, 'receipt', null);
  assert.equal((await snapshot(page)).states.form.value.name, '이하늘');
  assert.equal(await page.getByText('예약 확인서', { exact: true }).count(), 0);
});

test('dashboard periods refresh Query metrics and chart geometry without remounting the gallery', async t => {
  const page = await open(t, 'dashboard');
  await page.getByText('₩4,820,000', { exact: true }).waitFor();
  assert.equal((await snapshot(page)).queries.report.data.rows.length, 6);
  await page.getByRole('tab', { name: '이번 달' }).click();
  await page.getByText('₩18,640,000', { exact: true }).waitFor();
  assert.equal((await snapshot(page)).queries.report.data.rows.length, 4);
  await page.getByLabel('차트 종류').selectOption('area');
  await stateIs(page, 'kind', 'area');
  await page.locator('#preview figure svg path').first().waitFor({ state: 'attached' });
});

test('pricing uses plan, billing period and keyboard-adjusted seats, preserving a saved quote snapshot', async t => {
  const page = await open(t, 'pricing');
  await page.getByText('월 75000원', { exact: true }).waitFor();
  await page.getByLabel('요금제', { exact: true }).selectOption('pro');
  await page.getByLabel('결제 주기').selectOption('yearly');
  const slider = page.getByRole('slider');
  await slider.focus();
  await slider.press('ArrowRight');
  await stateIs(page, 'form', { plan: 'pro', billing: 'yearly', seats: 6 });
  await page.getByText('월 120000원', { exact: true }).waitFor();
  await page.getByRole('button', { name: '견적 보관' }).click();
  await stateIs(page, 'receipt', { seats: 6, plan: 'Pro', billing: '연간', monthly: 120000 });
  await slider.press('ArrowRight');
  await stateIs(page, 'form', { plan: 'pro', billing: 'yearly', seats: 7 });
  assert.equal((await snapshot(page)).states.receipt.value.monthly, 120000);
});

test('screen examples fit narrow layouts and retain functional controls in dark mode', async t => {
  const page = await open(t, 'profile');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '어두운 테마' }).click();
  assert.equal(await page.getByRole('button', { name: '어두운 테마' }).getAttribute('aria-pressed'), 'true');
  for (const { slug } of scenarios) {
    await page.locator('#family').selectOption(slug);
    await ready(page);
    const bounds = await page.evaluate(() => ({
      viewport: innerWidth, width: document.documentElement.scrollWidth,
      preview: document.querySelector('#preview').getBoundingClientRect().height,
      editor: document.querySelector('#definition').getBoundingClientRect().height,
    }));
    assert.ok(bounds.width <= bounds.viewport, `${slug}: no page horizontal overflow`);
    assert.ok(bounds.preview > 200 && bounds.editor > 200, `${slug}: usable panes`);
  }
});
