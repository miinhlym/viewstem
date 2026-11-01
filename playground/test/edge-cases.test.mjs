import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { request } from 'node:http';
import { chromium } from 'playwright';
import { startPlayground } from '../server.mjs';
import { samples } from '../samples.mjs';

let server, browser;
before(async () => { server = await startPlayground({ port: 0 }); browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); await server?.close(); });
async function open(t, setup) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await context.newPage(), errors = [];
  page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no uncaught browser errors'); });
  if (setup) await setup(page);
  await page.goto(server.url); await ready(page); return page;
}
const ready = page => page.waitForFunction(() => document.querySelector('#run-status').textContent === '실행 중');
const state = (page, name) => page.locator(`.inspect-entry[data-name="${name}"] .inspect-value`);
async function stateIs(page, name, value) { await page.waitForFunction(({ name, value }) => document.querySelector(`.inspect-entry[data-name="${name}"] .inspect-value`)?.textContent === JSON.stringify(value), { name, value }); }
async function run(page, data, wait = true) { await page.locator('#editor').fill(JSON.stringify(data)); await page.locator('#run').click(); if (wait) await ready(page); }
const sample = id => structuredClone(samples(server.url).find(item => item.id === id).document);
const path = value => ({ '@path': value });
const cell = (type, initial) => ({ kind: 'State', schema: { type }, ...(initial === undefined ? {} : { initial }) });
const text = (id, value) => ({ id, componentRef: 'Text', inputs: { text: value } });
const simple = value => ({ view: { render: text('text', value) } });
const setAction = type => sample(type === 'number' ? 'state' : 'query').resources.find(resource => resource.id === `set-${type}`);
const button = (id, label, actionRef, inputs) => ({ id, componentRef: 'Button', inputs: { label }, on: { click: { id, actionRef, inputs } } });
const stack = children => ({ id: 'root', componentRef: 'Stack', slots: { default: children } });
async function shot(page, name) { await mkdir(new URL('./results/audit/', import.meta.url), { recursive: true }); await page.screenshot({ path: new URL(`./results/audit/${name}.png`, import.meta.url).pathname }); }

test('numeric keyboard entry preserves decimals and exponents; blank editing restores the committed value on blur', async t => {
  const page = await open(t); await run(page, sample('state'));
  const input = page.getByLabel('기준 값', { exact: true });
  for (const [typed, expected] of [['-12.5', -12.5], ['-0.5', -0.5], ['0.25', 0.25], ['1e3', 1000]]) {
    await input.fill(''); await input.pressSequentially(typed, { delay: 35 }); await stateIs(page, 'count', expected);
    assert.equal(await page.locator('[data-node-id="doubled"] pre').textContent(), String(expected * 2));
  }
  await input.fill(''); assert.equal(await state(page, 'count').textContent(), '1000');
  await input.press('Tab'); assert.equal(await input.inputValue(), '1000');
  await shot(page, 'numbers');
});

test('pending inputs remain disabled until their State becomes ready, and disabled buttons emit no Action', async t => {
  const page = await open(t);
  const data = { resources: [setAction('string'), { kind: 'Variable', id: 'identity', spec: { ports: { value: { kind: 'Value', schema: { type: 'string' }, required: true } }, expression: 'value' } }], view: { states: { value: cell('string'), resolved: { kind: 'Derived', schema: { type: 'string' }, variableRef: 'identity', inputs: { value: path('/states/value') } } }, render: stack([
    { id: 'pending', componentRef: 'TextInput', inputs: { label: '대기 입력', value: path('/states/resolved') } },
    button('prepare', '값 준비', 'set-string', { target: path('/states/value'), value: '준비됨' }),
    { ...button('disabled', '비활성', 'set-string', { target: path('/states/value'), value: '잘못된 값' }), inputs: { label: '비활성', disabled: true } },
    { id: 'missing', componentRef: 'Json' },
  ]) } };
  await run(page, data); const input = page.getByLabel('대기 입력', { exact: true });
  assert.equal(await input.isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '비활성', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '값 준비', exact: true }).click(); await stateIs(page, 'value', '준비됨');
  assert.equal(await input.isEnabled(), true); assert.equal(await input.inputValue(), '준비됨');
  assert.match(await page.locator('[data-node-id="missing"]').innerText(), /missing/);
});

test('a Derived calculation error is inspectable and recovers when its input becomes valid', async t => {
  const page = await open(t), data = sample('state');
  data.resources.find(resource => resource.kind === 'Variable').spec.expression = '10.0 / n';
  await run(page, data); const input = page.getByLabel('기준 값', { exact: true });
  await input.fill('0');
  await page.waitForFunction(() => document.querySelector('.inspect-entry[data-name="doubled"] .value-status')?.textContent === 'error');
  assert.equal(await page.locator('[data-node-id="doubled"] .node-notice').isVisible(), true);
  await input.fill('2'); await stateIs(page, 'doubled', 5);
  assert.equal(await page.locator('[data-node-id="doubled"] .node-notice').isVisible(), false);
  assert.equal(await page.locator('[data-node-id="doubled"] pre').textContent(), '5');
});

test('Action failure preserves completed State writes and a successful retry clears its active error', async t => {
  const page = await open(t);
  const data = { resources: [setAction('boolean'), { kind: 'Action', id: 'write-then-assert', spec: {
    ports: { target: { kind: 'State', schema: { type: 'number' }, required: true }, allowed: { kind: 'Value', schema: { type: 'boolean' }, required: true } },
    steps: [{ kind: 'SetState', target: path('/ports/target'), value: 1 }, { kind: 'Assert', condition: path('/ports/allowed'), message: '허용 후 다시 시도하세요' }, { kind: 'SetState', target: path('/ports/target'), value: 2 }],
  } }], view: { states: { count: cell('number', 0), allowed: cell('boolean', false) }, render: stack([
    { id: 'allow', componentRef: 'Checkbox', inputs: { label: '허용', value: path('/states/allowed') }, on: { change: { id: 'allow', actionRef: 'set-boolean', inputs: { target: path('/states/allowed'), value: path('/event') } } } },
    button('submit', '변경', 'write-then-assert', { target: path('/states/count'), allowed: path('/states/allowed') }),
  ]) } };
  await run(page, data); await page.getByRole('button', { name: '변경', exact: true }).click();
  await page.locator('#error-banner').waitFor({ state: 'visible' }); await stateIs(page, 'count', 1);
  await page.getByLabel('허용', { exact: true }).check();
  assert.equal(await page.locator('#error-banner').isVisible(), true, 'another successful connection must not dismiss this failure');
  await page.getByRole('button', { name: '변경', exact: true }).click(); await stateIs(page, 'count', 2);
  assert.equal(await page.locator('#error-banner').isVisible(), false); await ready(page);
  assert.match(await page.locator('#activity').textContent(), /이벤트 실행 오류/);
  await shot(page, 'action-recovered');
});

test('double-clicking a running Action produces one HTTP execution and recovers after it completes', async t => {
  const page = await open(t); let requests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/concepts') requests++; });
  await page.locator('#tab-actions').click();
  await page.getByRole('button', { name: '요청 후 false 반환', exact: true }).dblclick();
  await page.waitForFunction(() => document.querySelector('.inspect-entry[data-name="requestResult"] .value-status')?.textContent === 'success');
  assert.equal(requests, 1); assert.equal(await page.locator('#error-banner').isVisible(), false);
  assert.equal(await page.locator('.inspect-entry[data-name="requestResult"] .inspect-value').textContent(), 'false');
});

test('Query executeWhen blocks refresh, then opening the gate recovers both data and the error indicator', async t => {
  const page = await open(t), data = sample('query');
  data.view.queries.results.executeWhen = path('/states/simulateFailure');
  data.view.queries.results.inputs.fail = false;
  await run(page, data); await page.locator('#tab-queries').click();
  assert.match(await page.locator('#inspector-content').innerText(), /waiting|executeWhen/);
  await page.locator('#inspector-content').getByRole('button', { name: '새로고침', exact: true }).click();
  await page.locator('#error-banner').waitFor({ state: 'visible' });
  await page.getByLabel('Query 오류 재현', { exact: true }).check();
  await page.waitForFunction(() => document.querySelector('.inspect-entry[data-name="results"] .value-status')?.textContent === 'success');
  assert.equal(await page.locator('[data-node-id="concept"]').count(), 4);
  assert.equal(await page.locator('#error-banner').isVisible(), false); await ready(page);
});

test('polling resumes, pauses without blocking manual refresh, and stops issuing requests after disposal', async t => {
  const page = await open(t), data = sample('query'); let requests = 0;
  data.resources.find(resource => resource.kind === 'Query').spec.sources.response.request.params.delay = 20;
  data.view.queries.results.intervalMs = 70; data.view.queries.results.autoRefreshWhen = path('/states/simulateFailure'); data.view.queries.results.inputs.fail = false;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/concepts') requests++; });
  await run(page, data); await page.waitForTimeout(180); assert.equal(requests, 1);
  const resumed = page.waitForRequest(request => new URL(request.url()).pathname === '/api/concepts');
  await page.getByLabel('Query 오류 재현', { exact: true }).check(); await resumed;
  await page.waitForTimeout(200); assert.ok(requests >= 3);
  await page.getByLabel('Query 오류 재현', { exact: true }).uncheck(); await page.waitForTimeout(80);
  const paused = requests; await page.waitForTimeout(180); assert.equal(requests, paused);
  await page.getByRole('button', { name: '다시 조회', exact: true }).click(); await page.waitForTimeout(80); assert.equal(requests, paused + 1);
  await page.locator('#stop').click(); const stopped = requests; await page.waitForTimeout(180); assert.equal(requests, stopped);
});

test('rapid search edits converge to the last input without publishing stale Query results', async t => {
  const page = await open(t), input = page.getByLabel('개념 검색', { exact: true });
  for (const term of ['S', 'State', 'Query', '입력', 'Component']) { await input.fill(term); await page.waitForTimeout(25); }
  await page.waitForFunction(() => document.querySelectorAll('[data-node-id="concept"]').length === 1 && document.querySelector('[data-node-id="concept"] h3')?.textContent === 'Component');
  await page.waitForTimeout(550); await stateIs(page, 'search', 'Component');
  assert.equal(await input.inputValue(), 'Component'); assert.equal(await page.locator('#error-banner').isVisible(), false);
});

test('keyed repeat reorders preserve focused IME editing and local State; removal creates a fresh lifetime', async t => {
  const page = await open(t), a = { id: 'a', label: 'A' }, b = { id: 'b', label: 'B' };
  const data = { resources: [setAction('string'), { kind: 'Action', id: 'rows', spec: { ports: { target: { kind: 'State', schema: { type: 'array' }, required: true }, value: { kind: 'Value', schema: { type: 'array' }, required: true } }, steps: [{ kind: 'SetState', target: path('/ports/target'), value: path('/ports/value') }] } },
    { kind: 'Component', id: 'Item', spec: { ports: { label: { kind: 'Value', schema: { type: 'string' }, required: true } }, states: { draft: cell('string', '') }, render: { id: 'input', componentRef: 'TextInput', inputs: { label: path('/ports/label'), value: path('/states/draft') }, on: { change: { id: 'edit', actionRef: 'set-string', inputs: { target: path('/states/draft'), value: path('/event') } } } } } },
  ], view: { states: { rows: cell('array', [a, b]) }, render: stack([
    button('swap', '순서 변경', 'rows', { target: path('/states/rows'), value: [b, a] }),
    button('remove', 'B 제거', 'rows', { target: path('/states/rows'), value: [a] }),
    button('restore', 'B 복원', 'rows', { target: path('/states/rows'), value: [a, b] }),
    { id: 'item', componentRef: 'Item', repeat: { items: path('/states/rows'), as: 'row', key: path('/repeat/row/id') }, inputs: { label: path('/repeat/row/label') } },
  ]) } };
  await run(page, data); const input = page.getByLabel('B', { exact: true }), original = await input.elementHandle();
  await input.fill('수정'); const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: '글', selectionStart: 1, selectionEnd: 1 });
  await page.getByRole('button', { name: '순서 변경', exact: true }).evaluate(node => node.click());
  await page.waitForFunction(() => document.querySelector('#preview input')?.closest('label').textContent === 'B');
  assert.equal(await original.evaluate(node => document.activeElement === node), true);
  assert.equal(await input.inputValue(), '수정글'); await cdp.send('Input.insertText', { text: '글' });
  await page.getByRole('button', { name: 'B 제거', exact: true }).click(); await input.waitFor({ state: 'detached' });
  assert.equal(await original.evaluate(node => node.isConnected), false);
  await page.getByRole('button', { name: 'B 복원', exact: true }).click(); await input.waitFor(); assert.equal(await input.inputValue(), '');
  await shot(page, 'repeat-lifetimes');
});

test('named slots retain their order and duplicate repeat keys are rejected before replacing the running view', async t => {
  const page = await open(t);
  await run(page, { view: { render: { id: 'card', componentRef: 'Card', slots: { header: [text('header', '머리')], default: [text('body', '본문')], footer: [text('footer', '꼬리')] } } } });
  assert.deepEqual(await page.locator('#preview .preview-text').allTextContents(), ['머리', '본문', '꼬리']);
  const data = sample('composition'); data.view.states.notes.initial[1].id = 'a';
  await run(page, data, false); await page.locator('#error-banner').waitFor({ state: 'visible' });
  assert.deepEqual(await page.locator('#preview .preview-text').allTextContents(), ['머리', '본문', '꼬리']);
});

test('invalid JSON envelopes, duplicate built-ins and oversized UTF-8 drafts preserve the active view', async t => {
  const page = await open(t); await run(page, simple('유지'));
  for (const data of [[], null, { view: {}, viewRef: 'both' }, { view: {}, inputs: [] }, { view: {}, extra: true }, { view: {}, resources: {} }, { resources: [{ kind: 'Component', id: 'Text', spec: {} }], view: {} }]) {
    await run(page, data, false); await page.locator('#error-banner').waitFor({ state: 'visible' }); assert.equal(await page.locator('#preview').innerText(), '유지');
  }
  await run(page, simple('한'.repeat(340000)), false); await page.locator('#error-banner').waitFor({ state: 'visible' });
  assert.match(await page.locator('#error-detail').textContent(), /1MB/); assert.equal(await page.locator('#preview').innerText(), '유지');
});

test('a slow file import never overwrites a newer editor change or a later imported file', async t => {
  const page = await open(t, page => page.addInitScript(() => {
    const original = File.prototype.text;
    File.prototype.text = function () { return this.name.startsWith('slow') ? new Promise(resolve => { window.finishImport = () => original.call(this).then(resolve); }) : original.call(this); };
  }));
  const imported = JSON.stringify(simple('늦은 파일'));
  const upload = name => page.locator('#file-input').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(imported) });
  await upload('slow-a.json'); await page.waitForFunction(() => typeof window.finishImport === 'function');
  await page.locator('#editor').fill('새 편집 내용'); await page.evaluate(() => window.finishImport());
  await page.waitForTimeout(30); assert.equal(await page.locator('#editor').inputValue(), '새 편집 내용');
  await upload('slow-b.json');
  const newer = JSON.stringify(simple('최신 파일'));
  await page.locator('#file-input').setInputFiles({ name: 'new.json', mimeType: 'application/json', buffer: Buffer.from(newer) });
  await page.waitForFunction(value => document.querySelector('#editor').value === value, newer);
  await page.evaluate(() => window.finishImport()); await page.waitForTimeout(30); assert.equal(await page.locator('#editor').inputValue(), newer);
});

test('storage denial and oversized file rejection leave the editor and runtime usable', async t => {
  const page = await open(t, page => page.addInitScript(() => { Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; }));
  assert.match(await page.locator('#draft-status').textContent(), /저장 공간 없음/);
  const previous = await page.locator('#editor').inputValue();
  await page.locator('#file-input').setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(1_000_001, 32) });
  await page.locator('#error-banner').waitFor({ state: 'visible' }); assert.equal(await page.locator('#editor').inputValue(), previous);
  await run(page, simple('저장 없이 실행')); assert.equal(await page.locator('#preview').innerText(), '저장 없이 실행');
});

test('preview node and diagnostic limits remain recoverable and never report a rendering failure as ready', async t => {
  const page = await open(t);
  await run(page, { view: { states: { items: cell('array', Array.from({ length: 3001 }, (_, i) => i)) }, render: stack([
    { ...text('item', '항목'), repeat: { items: path('/states/items'), as: 'item', key: path('/repeat/item') } },
  ]) } }, false);
  await page.locator('#error-banner').waitFor({ state: 'visible' }); assert.match(await page.locator('#error-detail').textContent(), /3,000/);
  assert.equal(await page.locator('#run-status').getAttribute('data-status'), 'error');
  await run(page, simple('한도 오류 복구')); assert.equal(await page.locator('#error-banner').isVisible(), false);
  await run(page, { view: { states: { large: cell('string', 'x'.repeat(45000)) }, render: text('ok', '정상') } });
  assert.match(await state(page, 'large').textContent(), /표시 한도 초과/);
});

test('narrow and landscape viewports expose controls without page overflow, and logs stay bounded', async t => {
  const page = await open(t); await run(page, sample('state'));
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
    for (const id of ['run', 'example', 'help-button']) assert.equal(await page.locator(`#${id}`).isVisible(), true);
    await shot(page, `viewport-${viewport.width}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  const input = page.getByLabel('기준 값', { exact: true });
  for (let i = 1; i <= 45; i++) await input.fill(String(i));
  await stateIs(page, 'count', 45); assert.equal(await page.locator('#activity li').count(), 100);
  await page.locator('#tab-log').click(); await page.locator('#clear-log').click(); assert.equal(await page.locator('#activity li').count(), 0);
});

test('malformed HTTP request targets return 400 without terminating the playground server', async () => {
  const response = await new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: new URL(server.url).port, path: '//[', method: 'GET' }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    req.on('error', reject); req.setTimeout(3000, () => req.destroy(Error('request timeout'))); req.end();
  });
  assert.equal(response, 400); assert.equal((await fetch(server.url)).status, 200);
});
