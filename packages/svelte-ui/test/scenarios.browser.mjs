import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createRegistry, createRuntime } from '@viewstem/core';
import { createAuditHarness, snapshot } from './fixtures/audit-harness.mjs';
import { scenarioBySlug, scenarios } from './fixtures/scenarios.mjs';

let harness;
before(async () => { harness = await createAuditHarness(); });
after(async () => { await harness?.close(); });

const open = (t, slug) => harness.setup(t, scenarioBySlug.get(slug).view);
async function stateIs(page, name, expected) {
  await page.waitForFunction(({ name, expected }) => {
    const [root, ...fields] = name.split('/');
    let value = mounted.view.getSnapshot().states[root]?.value;
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

test('five composition fixtures render from serializable ViewSpecs', async t => {
  for (const { view } of scenarios) {
    const page = await harness.setup(t, JSON.parse(JSON.stringify(view)));
    assert.ok(await page.locator('#app [data-slot]').count() > 5);
    assert.deepEqual((await snapshot(page)).errors, []);
  }
});

test('profile validation, tabs and settings persist through Actions', async t => {
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
});

test('customer filters, Query results and modal additions share the same State', async t => {
  const page = await open(t, 'customers');
  assert.equal((await snapshot(page)).queries.customers.data.length, 6);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await stateIs(page, 'pagination/pageIndex', 1);
  await page.getByLabel('고객 상태', { exact: true }).selectOption('체험');
  await stateIs(page, 'pagination', { pageIndex: 0, pageSize: 4 });
  await page.waitForFunction(() => mounted.view.getSnapshot().queries.customers.data.length === 2);
  assert.equal(await page.locator('#app tbody tr').count(), 2);
  await page.getByLabel('Rows per page').selectOption('10');
  await stateIs(page, 'pagination', { pageIndex: 0, pageSize: 10 });
  await page.getByRole('searchbox').fill('하린');
  await stateIs(page, 'filters', { segment: '체험', search: '하린' });
  assert.equal(await page.locator('#app tbody tr').count(), 1);
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
  await page.waitForFunction(() => mounted.view.getSnapshot().queries.customers.data.length === 7);
  await stateIs(page, 'form', { name: '', email: '', company: '' });
  await stateIs(page, 'filters', { segment: 'all', search: '' });
  await stateIs(page, 'pagination', { pageIndex: 0, pageSize: 10 });
  await stateIs(page, 'selected', []);
  assert.deepEqual((await snapshot(page)).states.rows.value.at(-1), { id: 'c7', name: '한가람', email: 'garam@example.com', company: '새 회사', status: '체험' });
  await page.getByRole('searchbox').fill('한가람');
  await page.locator('#app tbody').getByText('한가람', { exact: true }).waitFor();
  assert.equal(await page.locator('#app tbody tr').count(), 1);
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

test('dashboard periods refresh Query metrics and chart geometry in the same View', async t => {
  const page = await open(t, 'dashboard');
  await page.getByText('₩4,820,000', { exact: true }).waitFor();
  assert.equal((await snapshot(page)).queries.report.data.rows.length, 6);
  await page.getByRole('tab', { name: '이번 달' }).click();
  await page.getByText('₩18,640,000', { exact: true }).waitFor();
  assert.equal((await snapshot(page)).queries.report.data.rows.length, 4);
  await page.getByLabel('차트 종류').selectOption('area');
  await stateIs(page, 'kind', 'area');
  await page.locator('#app figure svg path').first().waitFor({ state: 'attached' });
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
