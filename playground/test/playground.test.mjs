import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startPlayground } from '../server.mjs';
import { samples } from '../samples.mjs';

let server, browser;
before(async () => { server = await startPlayground({ port: 0 }); browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); await server?.close(); });
async function pageFor(t, viewport = { width: 1512, height: 982 }) {
  const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no uncaught browser errors'); });
  await page.goto(server.url); await page.waitForFunction(() => document.querySelector('#run-status').textContent === '실행 중');
  return page;
}
const source = page => page.locator('#editor').inputValue();
async function runDocument(page, document) { await page.locator('#editor').fill(JSON.stringify(document, null, 2)); await page.locator('#run').click(); }
async function load(page, id) { await page.locator('#example').selectOption(id); await page.locator('#load-example').click(); await page.waitForFunction(() => document.querySelector('#run-status').textContent === '실행 중'); }
async function entryStatus(page, name, status) {
  await page.waitForFunction(({ name, status }) => [...document.querySelectorAll('.inspect-entry')].some(row => row.dataset.name === name && row.querySelector('.value-status').textContent === status), { name, status });
}
const entry = (page, name) => page.locator(`.inspect-entry[data-name="${name}"]`);
const simple = text => ({ view: { render: { id: 'text', componentRef: 'Text', inputs: { text } } } });
const searchState = value => document.querySelector('.inspect-entry[data-name="search"] .inspect-value')?.textContent === JSON.stringify(value);
const searchEvents = page => page.locator('#activity li').filter({ hasText: /search\.change / }).count();

test('Korean pasted text survives URL encoding and filters the actual HTTP results', async t => {
  const page = await pageFor(t), input = page.getByLabel('개념 검색', { exact: true });
  const response = page.waitForResponse(response => new URL(response.url()).searchParams.get('search') === '입력');
  await input.fill('입력');
  assert.equal((await response).status(), 200);
  await page.waitForFunction(() => document.querySelectorAll('[data-node-id="concept"]').length === 2);
  assert.deepEqual(await page.locator('[data-node-id="concept"] h3').allTextContents(), ['Query', 'Component']);
  await page.waitForFunction(searchState, '입력');
  await input.fill('없는검색어');
  await page.waitForFunction(() => document.querySelectorAll('[data-node-id="concept"]').length === 0);
  assert.equal(await input.inputValue(), '없는검색어');
  assert.equal(await page.locator('#error-banner').isVisible(), false);
});

test('Korean IME composition survives a pending Query response and commits exactly once', async t => {
  const page = await pageFor(t), input = page.getByLabel('개념 검색', { exact: true });
  await page.locator('#tab-log').click(); await page.locator('#clear-log').click(); await page.locator('#tab-states').click();
  const cdp = await page.context().newCDPSession(page), requested = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/api/concepts') requested.push(url.searchParams.get('search')); });
  const previousResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get('search') === '입');
  await input.fill('입'); await page.waitForFunction(searchState, '입');
  // CDP uses Chromium's real composition machinery, including trusted IME events.
  for (const text of ['ㄹ', '려', '력']) await cdp.send('Input.imeSetComposition', { text, selectionStart: 1, selectionEnd: 1 });
  assert.equal(await input.inputValue(), '입력');
  await previousResponse;
  await page.waitForFunction(() => document.querySelector('#activity').textContent.includes('Query results: running → success'));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await input.inputValue(), '입력', 'a Query snapshot must not overwrite the composing syllable');
  assert.deepEqual(requested, ['입'], 'uncommitted syllables must not execute Actions or Queries');
  assert.equal(await searchEvents(page), 1);
  await cdp.send('Input.insertText', { text: '력' });
  await page.waitForFunction(searchState, '입력');
  // Some browser event sequences send a final non-composing input after compositionend.
  await input.dispatchEvent('input', { data: '력', inputType: 'insertText', isComposing: false });
  await page.waitForFunction(() => document.querySelector('#activity').textContent.includes('search.change "입력"'));
  assert.equal(await searchEvents(page), 2);
  assert.deepEqual(requested, ['입', '입력']);
  assert.equal(await input.evaluate(node => document.activeElement === node), true);
  assert.equal(await input.evaluate(node => node.selectionStart), 2);
  assert.equal(await page.locator('#error-banner').isVisible(), false);
});

test('Korean IME cancellation, blur commit and later typing keep State and input synchronized', async t => {
  const page = await pageFor(t), input = page.getByLabel('개념 검색', { exact: true });
  const cdp = await page.context().newCDPSession(page);
  await input.focus();
  await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  assert.equal(await input.inputValue(), '');
  assert.equal(await searchEvents(page), 0, 'cancelling unchanged composition must not invoke an Action');
  await cdp.send('Input.imeSetComposition', { text: '입', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '입' });
  await page.waitForFunction(searchState, '입');
  await cdp.send('Input.imeSetComposition', { text: '력', selectionStart: 1, selectionEnd: 1 });
  await input.press('Tab');
  await page.waitForFunction(searchState, '입력');
  assert.equal(await input.inputValue(), '입력');
  assert.equal(await searchEvents(page), 2);
  await input.fill('입력과'); await page.waitForFunction(searchState, '입력과');
  assert.equal(await input.inputValue(), '입력과');
  assert.equal(await searchEvents(page), 3);
  assert.equal(await page.locator('#error-banner').isVisible(), false);
});

test('an external State reset permits re-entering the same Korean text after IME commit', async t => {
  const page = await pageFor(t), data = samples(server.url)[0].document;
  data.view.render.slots.default.push({ id: 'clear-search', componentRef: 'Button', inputs: { label: '검색 초기화' }, on: { click: { id: 'clearSearch', actionRef: 'set-string', inputs: { target: { '@path': '/states/search' }, value: '' } } } });
  await runDocument(page, data); await page.waitForFunction(() => document.querySelector('#run-status').textContent === '실행 중');
  const input = page.getByLabel('개념 검색', { exact: true }), cdp = await page.context().newCDPSession(page);
  await input.focus(); await cdp.send('Input.imeSetComposition', { text: '입력', selectionStart: 2, selectionEnd: 2 });
  await cdp.send('Input.insertText', { text: '입력' }); await page.waitForFunction(searchState, '입력');
  await page.getByRole('button', { name: '검색 초기화', exact: true }).click();
  await page.waitForFunction(searchState, ''); assert.equal(await input.inputValue(), '');
  await input.fill('입력'); await page.waitForFunction(searchState, '입력');
  assert.equal(await searchEvents(page), 2);
});

test('JSON starts a real HTTP Query; editing input updates State, Action, results and preserves focus', async t => {
  const page = await pageFor(t), input = page.getByLabel('개념 검색', { exact: true });
  assert.equal(await page.locator('[data-node-id="concept"]').count(), 4);
  await page.locator('#tab-queries').click();
  await input.fill('Component');
  await entryStatus(page, 'results', 'running'); await entryStatus(page, 'results', 'success');
  assert.equal(await page.locator('[data-node-id="concept"]').count(), 1);
  assert.equal(await input.evaluate(node => document.activeElement === node), true);
  assert.equal(await input.evaluate(node => node.selectionStart), 9);
  await page.locator('#tab-states').click(); assert.equal(await entry(page, 'search').locator('.inspect-value').textContent(), '"Component"');
  await page.locator('#tab-actions').click(); await entryStatus(page, 'changeSearch', 'success');
});

test('Action inspector observes asynchronous running and successful false without treating it as missing', async t => {
  const page = await pageFor(t); await page.locator('#tab-actions').click();
  await page.getByRole('button', { name: '요청 후 false 반환', exact: true }).click();
  await entryStatus(page, 'requestResult', 'running'); await entryStatus(page, 'requestResult', 'success');
  assert.equal(await entry(page, 'requestResult').locator('.inspect-value').textContent(), 'false');
  assert.match(await page.locator('#activity').textContent(), /Action requestResult: running → success/);
});

test('Query errors preserve last success, expose stale and diagnostics, and recover after input change', async t => {
  const page = await pageFor(t); await page.locator('#tab-queries').click();
  await page.getByLabel('Query 오류 재현', { exact: true }).check();
  await entryStatus(page, 'results', 'error');
  assert.match(await entry(page, 'results').textContent(), /HTTP_ERROR/);
  assert.match(await entry(page, 'results').textContent(), /stale/);
  assert.equal(await page.locator('[data-node-id="concept"]').count(), 4);
  await entry(page, 'results').getByRole('button', { name: '오류 재시도' }).click();
  await entryStatus(page, 'results', 'running'); await entryStatus(page, 'results', 'error');
  await page.getByLabel('Query 오류 재현', { exact: true }).uncheck();
  await entryStatus(page, 'results', 'success'); assert.equal(await entry(page, 'results').locator('.stale-note').count(), 0);
});

test('State and CEL Derived render through JSON; when removes and recreates the visual node', async t => {
  const page = await pageFor(t); await load(page, 'state');
  await page.getByLabel('기준 값', { exact: true }).fill('6');
  await page.waitForFunction(() => document.querySelector('[data-node-id="doubled"] pre')?.textContent === '12');
  assert.equal(await entry(page, 'doubled').locator('.inspect-value').textContent(), '12');
  const old = await page.locator('[data-node-id="doubled"]').elementHandle();
  await page.getByLabel('계산 결과 표시', { exact: true }).uncheck();
  await page.waitForFunction(() => !document.querySelector('[data-node-id="doubled"]'));
  assert.equal(await old.evaluate(node => node.isConnected), false);
  await page.getByLabel('계산 결과 표시', { exact: true }).check();
  await page.locator('[data-node-id="doubled"]').waitFor();
  assert.equal(await page.locator('[data-node-id="doubled"] pre').textContent(), '12');
});

test('JSON Component composition, authored slots and repeat render once without duplicate children', async t => {
  const page = await pageFor(t); await load(page, 'composition');
  assert.equal(await page.locator('[data-node-id="note"]').count(), 2);
  assert.equal(await page.locator('#preview h3').count(), 2);
  assert.equal(await page.getByText('Component와 이름 있는 slot을 조합합니다.', { exact: true }).count(), 1);
  assert.match(await page.locator('#preview').innerText(), /실행은 core에서/);
});

test('invalid JSON, invalid references and invalid schemas preserve the last live preview', async t => {
  const page = await pageFor(t); await load(page, 'state'); const valid = JSON.parse(await source(page));
  for (const invalid of ['{ "view": ', JSON.stringify({ view: { render: { id: 'bad', componentRef: 'Missing' } } }), JSON.stringify({ ...valid, view: { ...valid.view, states: { ...valid.view.states, count: { kind: 'State', schema: { type: 'number' }, initial: 'wrong' } } } })]) {
    await page.locator('#editor').fill(invalid); await page.locator('#run').click();
    await page.locator('#error-banner').waitFor({ state: 'visible' });
    assert.equal(await page.getByLabel('기준 값', { exact: true }).inputValue(), '2');
    assert.match(await page.locator('#error-note').textContent(), /마지막/);
  }
  await page.getByLabel('기준 값', { exact: true }).fill('8');
  await page.waitForFunction(() => document.querySelector('[data-node-id="doubled"] pre')?.textContent === '16');
  await runDocument(page, valid); await page.waitForFunction(() => document.querySelector('#error-banner').hidden);
  assert.equal(await page.getByLabel('기준 값', { exact: true }).inputValue(), '2');
});

test('initial Query failure remains inspectable and the run indicator recovers with the Query', async t => {
  const page = await pageFor(t), data = samples(server.url)[0].document;
  data.view.states.simulateFailure.initial = true;
  await runDocument(page, data);
  await page.waitForFunction(() => document.querySelector('#run-status').textContent === '조회 오류 있음');
  await page.locator('#tab-queries').click(); await entryStatus(page, 'results', 'error');
  await page.getByLabel('Query 오류 재현', { exact: true }).uncheck();
  await entryStatus(page, 'results', 'success');
  await page.waitForFunction(() => document.querySelector('#run-status').textContent === '실행 중');
});

test('rerunning a JSON document creates a fresh runtime instead of retaining edited State', async t => {
  const page = await pageFor(t); await load(page, 'state');
  await page.getByLabel('기준 값', { exact: true }).fill('11');
  await page.locator('#run').click();
  await page.waitForFunction(() => document.querySelector('[data-node-id="number"] input')?.value === '2');
  assert.equal(await page.locator('#count-queries').textContent(), '0');
});

test('stop cancels pending HTTP and rejects late publications; a later run starts cleanly', async t => {
  const page = await pageFor(t), data = samples(server.url)[0].document;
  data.resources.find(row => row.kind === 'Query').spec.sources.response.request.params.delay = 2500;
  let aborted = 0; page.on('requestfailed', request => { if (request.url().includes('/api/concepts')) aborted++; });
  await runDocument(page, data); await page.waitForFunction(() => document.querySelector('#run-status').textContent === '최초 조회 중');
  await page.locator('#stop').click();
  await page.waitForFunction(() => document.querySelector('#run-status').textContent === '중지됨');
  await page.waitForTimeout(150);
  assert.ok(aborted >= 1, 'the active native fetch was aborted');
  assert.equal(await page.locator('#count-queries').textContent(), '0');
  await runDocument(page, simple('새 실행')); await page.getByText('새 실행', { exact: true }).waitFor();
  await page.waitForTimeout(2600);
  assert.equal(await page.locator('#preview').innerText(), '새 실행');
  assert.equal(await page.locator('#count-queries').textContent(), '0');
});

test('rapid executions and replacement while an Action runs never publish the old generation', async t => {
  const page = await pageFor(t);
  await page.getByRole('button', { name: '요청 후 false 반환', exact: true }).click();
  await runDocument(page, simple('첫 번째')); await runDocument(page, simple('마지막'));
  await page.getByText('마지막', { exact: true }).waitFor();
  await page.waitForTimeout(650);
  assert.equal(await page.locator('#preview').innerText(), '마지막');
  assert.equal(await page.locator('#count-actions').textContent(), '0');
});

test('draft reload restores exact edits without automatically executing their requests', async t => {
  const page = await pageFor(t), draft = '{ "unfinished": true';
  await page.locator('#editor').fill(draft); let requests = 0;
  page.on('request', request => { if (request.url().includes('/api/concepts')) requests++; });
  await page.reload(); await page.waitForFunction(() => document.querySelector('#run-status').textContent === '초안 복원됨');
  assert.equal(await source(page), draft); assert.equal(requests, 0);
  assert.equal(await page.locator('#preview .preview-node').count(), 0);
});

test('import preserves the running view until execution; export retains the exact editable draft', async t => {
  const page = await pageFor(t), text = JSON.stringify(simple('파일에서 실행'), null, 2);
  await page.locator('#file-input').setInputFiles({ name: 'sample.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.waitForFunction(text => document.querySelector('#editor').value === text, text);
  assert.match(await page.locator('#preview').innerText(), /작은 개념 사전/);
  const downloaded = page.waitForEvent('download'); await page.locator('#export').click();
  const download = await downloaded, stream = await download.createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), text);
  await page.locator('#run').click(); await page.getByText('파일에서 실행', { exact: true }).waitFor();
});

test('registered View references and explicit inputs use the same public core API', async t => {
  const page = await pageFor(t);
  await runDocument(page, { resources: [{ kind: 'View', id: 'example', spec: { ports: { label: { kind: 'Value', schema: { type: 'string' }, required: true } }, render: { id: 'label', componentRef: 'Text', inputs: { text: { '@path': '/ports/label' } } } } }], viewRef: 'example', inputs: { label: '외부 입력' } });
  await page.getByText('외부 입력', { exact: true }).waitFor();
});

test('literal HTML stays text and inspector preserves null and false', async t => {
  const page = await pageFor(t), text = '<img src=x onerror="window.injected=true">';
  const data = simple(text); data.view.states = { nil: { kind: 'State', schema: { type: 'null' }, initial: null }, flag: { kind: 'State', schema: { type: 'boolean' }, initial: false } };
  await runDocument(page, data); await page.getByText(text, { exact: true }).waitFor();
  assert.equal(await page.locator('#preview img').count(), 0); assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.equal(await entry(page, 'nil').locator('.inspect-value').textContent(), 'null');
  assert.equal(await entry(page, 'flag').locator('.inspect-value').textContent(), 'false');
});

test('keyboard execution, formatting, accessible tabs and component reference help work', async t => {
  const page = await pageFor(t); await page.locator('#editor').fill(JSON.stringify(simple('키보드 실행')));
  await page.locator('#format').click(); assert.ok((await source(page)).includes('\n'));
  await page.locator('#editor').press('Control+Enter'); await page.getByText('키보드 실행', { exact: true }).waitFor();
  await page.locator('#editor').press('Shift+Tab');
  assert.equal(await page.locator('#export').evaluate(node => document.activeElement === node), true);
  await page.locator('#tab-states').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tab-queries').getAttribute('aria-selected'), 'true');
  await page.locator('#help-button').click(); assert.equal(await page.locator('#help').evaluate(node => node.open), true);
  assert.equal(await page.locator('#component-help details').count(), 9);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#help').evaluate(node => node.open), false);
});

test('mobile switches between full-height editor, preview and inspector without page overflow', async t => {
  const page = await pageFor(t, { width: 390, height: 844 });
  await mkdir(new URL('./results/', import.meta.url), { recursive: true });
  for (const pane of ['editor', 'preview', 'inspector']) {
    await page.locator(`button[data-pane="${pane}"]`).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
    assert.equal(await page.locator(`#${pane}-panel`).isVisible(), true);
    for (const other of ['editor', 'preview', 'inspector'].filter(value => value !== pane)) assert.equal(await page.locator(`#${other}-panel`).isVisible(), false);
    await page.screenshot({ path: new URL(`./results/mobile-${pane}.png`, import.meta.url).pathname });
  }
  await page.locator('button[data-pane="editor"]').click();
  await runDocument(page, simple('모바일 실행'));
  await page.getByText('모바일 실행', { exact: true }).waitFor();
  await page.locator('button[data-pane="editor"]').click();
  await page.locator('#editor').fill('{'); await page.locator('#run').click();
  await page.locator('#error-banner').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#preview').innerText(), '모바일 실행');
});

test('workspace fills the viewport; splitters resize by pointer and keyboard with bounded pane sizes', async t => {
  const page = await pageFor(t), divider = page.locator('#column-divider'), row = page.locator('#row-divider');
  const dimensions = () => page.locator('#editor-panel').boundingBox();
  const start = await dimensions();
  assert.equal(start.x, 0); assert.equal(start.y, 42); assert.ok(start.height > 900);
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight === innerHeight), true);
  await divider.focus(); await page.keyboard.press('ArrowRight');
  assert.ok((await dimensions()).width > start.width + 20);
  const box = await divider.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 100); await page.mouse.down();
  await page.mouse.move(550, box.y + 100); await page.mouse.up();
  assert.ok(Math.abs((await dimensions()).width - 550) < 2);
  await divider.dblclick(); assert.ok(Math.abs((await dimensions()).width - start.width) < 2);
  const initialHeight = (await page.locator('#preview-panel').boundingBox()).height;
  await row.focus(); await page.keyboard.press('ArrowDown');
  assert.ok((await page.locator('#preview-panel').boundingBox()).height > initialHeight + 15);
  await row.dblclick();
  await page.setViewportSize({ width: 800, height: 650 });
  await divider.focus(); await page.keyboard.press('Home'); assert.ok((await dimensions()).width >= 249);
  await page.keyboard.press('End'); assert.ok((await page.locator('#preview-panel').boundingBox()).width >= 299);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), true);
  await page.setViewportSize({ width: 1512, height: 982 }); await divider.dblclick();
  await mkdir(new URL('./results/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('./results/desktop.png', import.meta.url).pathname });
});

test('Snapshot and Log use exclusive inspectable tabs and log clearing does not alter runtime state', async t => {
  const page = await pageFor(t);
  await page.locator('#tab-snapshot').click();
  assert.equal(await page.locator('#snapshot-pane').isVisible(), true);
  assert.equal(await page.locator('#inspector-content').isVisible(), false);
  assert.match(await page.locator('#snapshot').textContent(), /"roots": \[/);
  await page.keyboard.press('End');
  assert.equal(await page.locator('#tab-log').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#snapshot-pane').isVisible(), false);
  assert.ok(await page.locator('#activity li').count() > 0);
  await page.locator('#clear-log').click(); assert.equal(await page.locator('#activity li').count(), 0);
  assert.equal(await page.locator('[data-node-id="concept"]').count(), 4);
  await page.locator('#tab-states').click(); assert.equal(await page.locator('#inspector-content').isVisible(), true);
});

test('Action failure exposes the actual core error in the inspector', async t => {
  const page = await pageFor(t), data = samples(server.url)[0].document;
  data.resources.find(row => row.id === 'request-and-return-false').spec.steps[0].inputs.fail = true;
  await runDocument(page, data);
  await page.waitForFunction(() => document.querySelector('#run-status').textContent === '실행 중');
  await page.locator('#tab-actions').click();
  await page.getByRole('button', { name: '요청 후 false 반환', exact: true }).click();
  await entryStatus(page, 'requestResult', 'error');
  assert.match(await entry(page, 'requestResult').textContent(), /HTTP_ERROR/);
});

test('playground server serves only its assets and mock endpoint, without a filesystem or proxy route', async () => {
  assert.equal((await fetch(`${server.url}/package.json`)).status, 404);
  assert.equal((await fetch(`${server.url}/api/concepts`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${server.url}/api/concepts?delay=50000`)).status, 400);
  assert.equal((await fetch(`${server.url}/api/concepts?fail=true`)).status, 503);
  const result = await (await fetch(`${server.url}/api/concepts?search=Component`)).json(); assert.equal(result.items.length, 1);
});
