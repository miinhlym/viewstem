import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { chromium } from 'playwright';
import { startExample } from '../example/server.mjs';
import { samples } from './fixtures/samples.mjs';
import { scenarios } from '../example/scenarios.mjs';
import { collectSections, createDefinitionDraft, readSection, replaceSection } from '../example/definition-sections.mjs';

test('every section of all 71 examples round trips without changing the ViewSpec', () => {
  for (const example of [...samples, ...scenarios]) {
    const authoring = structuredClone(example.view);
    const original = JSON.parse(JSON.stringify(example.view));
    const draft = createDefinitionDraft();
    draft.load(original);
    for (const [kind, items] of Object.entries(draft.sections)) for (const item of items) {
      draft.select(kind, item.path);
      assert.deepEqual(draft.commit(draft.text()), original, `${example.slug}: ${item.path}`);
    }
    assert.deepEqual(example.view, authoring, 'authoring data remains untouched');
  }
});

test('nested declarations are indexed by scope, literal data is ignored, and escaped keys cannot pollute prototypes', () => {
  const view = JSON.parse(`{
    "states":{"a/b~c":{"kind":"State","initial":{"kind":"Action"}},"__proto__":{"kind":"State","initial":1}},
    "render":{"id":"owner","component":{"states":{"nested":{"kind":"Derived","variable":{"expression":"true"}}},"queries":{"load":{"query":{"sources":{"http":{"datasource":{"type":"Http"},"request":{}}},"transform":{"input":[]}}}},"render":{"id":"inner","componentRef":"shadcn.Button"}},
    "on":{"click":{"action":{"steps":[{"kind":"If","then":[{"kind":"Action","spec":{"steps":[{"kind":"Variable","spec":{"expression":"true"}}]}}],"else":[{"kind":"Query","spec":{"sources":{},"transform":{"input":[]}}}]}]}}}},
    "extra":{"kind":"State"}}
  `);
  const sections = collectSections(view);
  assert.equal(sections.State.length, 2);
  assert.equal(sections.Derived.length, 1);
  assert.equal(sections.Action.length, 2);
  assert.equal(sections.Query.length, 2);
  assert.equal(sections.Datasource.length, 1);
  assert.equal(sections.Variable.length, 2);
  assert.equal(readSection(view, '/states/a~1b~0c').kind, 'State');
  const next = replaceSection(view, '/states/__proto__', { kind: 'State', initial: 'edited' });
  assert.equal(Object.getPrototypeOf(next.states), Object.prototype);
  assert.equal(next.states.__proto__.initial, 'edited');
  assert.equal(view.states.__proto__.initial, 1);
  assert.throws(() => replaceSection(view, '/states/toString/value', 'bad'));
  assert.equal(Object.prototype.initial, undefined);
});

let browser, app;
before(async () => { app = await startExample({ port: 0 }); browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); await app?.close(); });
async function open(t, url = '?example=profile') {
  const page = await browser.newPage(); page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await page.close(); } });
  await page.goto(app.url + '/' + url);
  await ready(page);
  return page;
}
async function ready(page) { await page.getByText('초기 표시 완료', { exact: true }).waitFor(); }
const editor = page => page.locator('#definition');
const contents = async page => JSON.parse(await editor(page).inputValue());
const chooseKind = (page, kind) => page.getByRole('tab', { name: kind === 'all' ? '전체' : new RegExp('^' + kind + ' \\d+$') }).click();
const selectItem = (page, path) => page.getByLabel('JSON 항목').selectOption(path);
async function write(page, value) { await editor(page).fill(JSON.stringify(value, null, 2)); }

test('State and Action edits retain other kinds and run as one ViewSpec', async t => {
  const page = await open(t);
  const original = await contents(page);
  await chooseKind(page, 'State');
  await selectItem(page, '/states/form');
  const name = await contents(page);
  assert.equal(name.kind, 'State'); assert.equal(name.initial.name, '김서윤');
  name.initial.name = '분리 편집';
  await write(page, name);
  await chooseKind(page, 'Derived');
  assert.equal((await contents(page)).kind, 'Derived');
  await chooseKind(page, 'all');
  const changed = await contents(page);
  original.states.form.initial.name = '분리 편집';
  assert.deepEqual(changed, original);
  await chooseKind(page, 'Action');
  const target = collectSections(changed).Action.find(item => item.label === '설정 적용 · click');
  await selectItem(page, target.path);
  const action = await contents(page);
  assert.ok(action.action.steps.length > 0); assert.ok(action.inputs);
  action.inputs.value0 = { ...name.initial, name: 'Action에서 적용' };
  await write(page, action);
  await page.getByRole('button', { name: '적용', exact: true }).click();
  await ready(page);
  assert.equal(await page.getByLabel('이름', { exact: true }).inputValue(), '분리 편집');
  await page.getByRole('button', { name: '설정 적용', exact: true }).click();
  await page.getByText('Action에서 적용 · seoyun@example.com', { exact: true }).waitFor();
  await chooseKind(page, 'all');
  assert.equal(readSection(await contents(page), target.path).inputs.value0.name, 'Action에서 적용');
});

test('Query and Component sections retain their input bindings and alter the actual preview', async t => {
  const page = await open(t, '?example=customers&section=Query');
  assert.equal(await page.getByRole('tab', { name: /^Query / }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#section-path').textContent(), '/queries/customers');
  const usage = await contents(page);
  assert.deepEqual(usage.inputs.value, { '@path': '/states/filtered' });
  usage.query.transform.input = [{ id: 'only', name: '독립 Query', email: 'query@example.com', company: '예제', status: '활성' }];
  await write(page, usage);
  await chooseKind(page, 'Component');
  const title = collectSections(scenarios.find(item => item.slug === 'customers').view).Component.find(item => item.label === '고객 목록 · shadcn.Card.Title');
  await selectItem(page, title.path);
  const first = await contents(page);
  first.inputs.text = '수정한 고객 목록';
  await write(page, first);
  await page.getByRole('button', { name: '적용', exact: true }).click();
  await ready(page);
  await page.locator('#preview').getByText('수정한 고객 목록', { exact: true }).waitFor();
  await page.locator('#preview tbody').getByText('독립 Query', { exact: true }).waitFor();
  assert.equal(await page.locator('#preview tbody tr').count(), 1);
  await chooseKind(page, 'all');
  assert.deepEqual((await contents(page)).queries.customers.inputs, usage.inputs);
});

test('invalid JSON blocks section changes without losing the draft or the running preview', async t => {
  const page = await open(t, '?example=profile&section=State');
  await selectItem(page, '/states/form');
  const original = await contents(page);
  await editor(page).fill('{ "kind": "State",');
  await chooseKind(page, 'Action');
  assert.equal(await editor(page).inputValue(), '{ "kind": "State",');
  assert.equal(await page.getByRole('tab', { name: /^State / }).getAttribute('aria-selected'), 'true');
  assert.match(await page.locator('#editor-error').textContent(), /JSON/);
  assert.equal(await page.getByLabel('이름', { exact: true }).inputValue(), '김서윤');
  await selectItem(page, '/states/receipt');
  assert.equal(await page.getByLabel('JSON 항목').inputValue(), '/states/form');
  await write(page, original);
  await chooseKind(page, 'Action');
  assert.equal(await page.locator('#editor-error').textContent(), '');
  await page.getByRole('button', { name: '예제 복원' }).click();
  await ready(page);
  assert.equal(await page.getByRole('tab', { name: /^Action / }).getAttribute('aria-selected'), 'true');
});

test('section navigation supports keyboard, URL reload, and narrow screens', async t => {
  const page = await open(t, '?example=profile&section=State');
  const state = page.getByRole('tab', { name: /^State / });
  await state.focus(); await state.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: /^Derived / }).getAttribute('aria-selected'), 'true');
  assert.equal(new URL(page.url()).searchParams.get('section'), 'Derived');
  await page.reload(); await ready(page);
  assert.equal((await contents(page)).kind, 'Derived');
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, editor: document.querySelector('#definition').getBoundingClientRect().height }));
  assert.ok(bounds.width <= bounds.viewport);
  assert.ok(bounds.editor >= 180);
  await page.getByRole('tab', { name: /^Derived / }).press('Home');
  assert.equal(await page.getByRole('tab', { name: '전체' }).getAttribute('aria-selected'), 'true');
  assert.ok((await contents(page)).render);
});
