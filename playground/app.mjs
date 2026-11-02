import { createRegistry, createRuntime } from '@viewstem/core';
import { components, createPreview, display, element } from './components.mjs';
import { samples } from './samples.mjs';
import { setupLayout } from './layout.mjs';

const $ = id => document.getElementById(id);
const editor = $('editor'), examples = samples(location.origin);
const layout = setupLayout();
const storageKey = 'viewstem.playground.draft.v1', maxBytes = 1_000_000;
let active = null, revision = 0, snapshot = null, selectedTab = 'states', appliedSource = null, frame = 0;
let failure = null, draftRevision = 0, importRevision = 0;
const pending = new Set(), history = [];
let lastStatuses = new Map();
const preview = createPreview($('preview'), async (node, event, payload) => {
  const session = active;
  if (!session) return;
  const source = `event:${node.address}:${node.generation}:${event}`;
  log(`${node.id}.${event} ${display(payload).replace(/\s+/g, ' ').slice(0, 90)}`);
  try { await session.view.emit(node, event, payload); if (active === session) clearError(source); }
  catch (error) { if (active === session) showError(error, '이벤트 실행 오류', source); }
});
function log(message, error = false) {
  history.unshift({ message, error, time: new Date().toLocaleTimeString('en-GB', { hour12: false }) });
  history.length = Math.min(100, history.length);
  $('activity').replaceChildren(...history.map(item => {
    const row = element('li'); row.dataset.error = String(item.error);
    row.append(element('time', '', item.time), element('span', '', item.message)); return row;
  }));
}
function status(label, kind = 'idle') { $('run-status').textContent = failure?.status ?? label; $('run-status').dataset.status = failure ? 'error' : kind; }
function runningStatus() {
  if (!active) { status('실행 준비'); return; }
  const failed = Object.values(snapshot?.queries ?? {}).some(query => query.status === 'error');
  status(failed ? '조회 오류 있음' : '실행 중', failed ? 'error' : 'ready');
}
function clearError(source) {
  if (source !== undefined && failure?.source !== source) return;
  failure = null; $('error-banner').hidden = true; runningStatus();
}
function showError(error, title = '실행할 수 없습니다', source = 'editor') {
  failure = { source, status: source === 'config' ? (active ? '이전 실행 유지' : '구성 오류') : source === 'render' ? '표시 오류' : source === 'editor' ? '편집 오류' : '실행 오류' };
  layout.showPane('preview');
  $('error-banner').hidden = false; $('error-title').textContent = title;
  const detail = error instanceof SyntaxError ? { code: 'JSON_SYNTAX', message: error.message } : error instanceof Error ? { message: error.message } : error;
  $('error-detail').textContent = display(detail);
  $('error-note').textContent = !active ? 'JSON을 수정한 뒤 다시 실행하세요.' : source === 'config' || source === 'editor' ? '마지막으로 실행한 화면은 유지됩니다.' : source === 'render' ? '구성의 표시 한도와 화면 입력을 확인하세요.' : '실패 원인을 확인하고 다시 시도하세요. 완료된 State 변경은 유지됩니다.';
  status(failure.status, 'error');
  log(`${title}: ${detail?.code ?? detail?.message ?? '오류'}`, true);
  const match = /position (\d+)/i.exec(error?.message ?? '');
  if (error instanceof SyntaxError && match) {
    const index = Number(match[1]), preceding = editor.value.slice(0, index).split('\n');
    $('error-title').textContent = `JSON 오류 · ${preceding.length}행 ${preceding.at(-1).length + 1}열`;
    if (editor.checkVisibility()) editor.focus();
    editor.setSelectionRange(index, index + 1); updateCursor();
  }
}
function updateCursor() {
  const before = editor.value.slice(0, editor.selectionStart).split('\n');
  $('cursor-position').textContent = `${before.length}행, ${before.at(-1).length + 1}열`;
}
function updateDraft() {
  const lines = editor.value.split('\n').length;
  $('line-numbers').textContent = Array.from({ length: Math.min(lines, 50000) }, (_, i) => i + 1).join('\n');
  $('line-numbers').scrollTop = editor.scrollTop;
  let saved = true;
  try { localStorage.setItem(storageKey, editor.value); } catch { saved = false; }
  $('draft-status').textContent = `${saved ? '초안 저장됨' : '저장 공간 없음'}${editor.value !== appliedSource ? ' · 미실행 변경' : ''}`;
  updateCursor();
}
function setSource(text) { draftRevision++; editor.value = text; editor.scrollTop = 0; editor.setSelectionRange(0, 0); updateDraft(); }
function parseDocument(source) {
  if (new TextEncoder().encode(source).length > maxBytes) throw Error('JSON은 1MB 이하로 입력하세요.');
  const data = JSON.parse(source);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('최상위 값은 resources와 view를 담은 객체여야 합니다.');
  if (Object.keys(data).some(key => !['resources', 'view', 'viewRef', 'inputs'].includes(key))) throw Error('최상위 필드는 resources, view 또는 viewRef, inputs만 사용할 수 있습니다.');
  if (Object.hasOwn(data, 'view') === Object.hasOwn(data, 'viewRef')) throw Error('view와 viewRef 중 하나를 지정하세요.');
  if (data.resources !== undefined && !Array.isArray(data.resources)) throw Error('resources는 리소스 배열이어야 합니다.');
  if (data.inputs !== undefined && (!data.inputs || typeof data.inputs !== 'object' || Array.isArray(data.inputs))) throw Error('inputs는 객체여야 합니다.');
  return data;
}
function release(session) { session.unsubscribe?.(); session.runtime.dispose(); }
function cancelPending() { for (const session of pending) release(session); pending.clear(); }
function observe(session, next) {
  if (active !== session) return;
  snapshot = next;
  if (session.initialComplete && $('error-banner').hidden) {
    const failed = Object.values(next.queries).some(query => query.status === 'error');
    status(failed ? '조회 오류 있음' : '실행 중', failed ? 'error' : 'ready');
  }
  for (const kind of ['queries', 'actions']) {
    for (const [name, value] of Object.entries(next[kind])) {
      const key = `${kind}/${name}`, before = lastStatuses.get(key);
      if (before !== value.status) { lastStatuses.set(key, value.status); log(`${kind === 'queries' ? 'Query' : 'Action'} ${name}: ${before ? `${before} → ` : ''}${value.status}`, value.status === 'error'); }
      if (kind === 'queries' && value.status === 'success' && before !== 'success') clearError(`query:${name}`);
    }
  }
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; renderSnapshot(); });
}
async function run() {
  const current = ++revision; cancelPending(); clearError();
  const source = editor.value; let session;
  try {
    const document = parseDocument(source), registry = createRegistry();
    for (const component of components) registry.registerComponentContract(component);
    registry.registerResources(document.resources ?? []);
    session = { runtime: createRuntime({ registry }), registry }; pending.add(session);
    status('구성 확인 중', 'running');
    const target = Object.hasOwn(document, 'view') ? { view: document.view } : { viewRef: document.viewRef };
    const mounted = await session.runtime.createView({ ...target, inputs: document.inputs ?? {} });
    // Attach a rejection handler even if a newer run cancels this mount.
    const settled = mounted.initialComplete.then(value => ({ value }), error => ({ error }));
    pending.delete(session);
    if (current !== revision) { release(session); return; }
    if (active) release(active);
    active = session; session.view = mounted.view; appliedSource = source;
    lastStatuses = new Map(); preview.clear(); $('stop').disabled = false;
    session.unsubscribe = session.view.subscribe(next => observe(session, next));
    renderSnapshot(); updateDraft(); layout.showPane('preview'); log('새 JSON 구성 실행'); status('최초 조회 중', 'running');
    const result = await settled;
    if (current !== revision || active !== session) return;
    session.initialComplete = true;
    if (result.error) { showError(result.error, '초기 실행 오류', 'initial'); status('실행 오류', 'error'); }
    else if (result.value.queryErrors.length) { status('조회 오류 있음', 'error'); log('구성은 적용됐습니다. Query 패널에서 오류를 확인하세요.', true); }
    else status('실행 중', 'ready');
  } catch (error) {
    if (session) { pending.delete(session); release(session); }
    if (current !== revision) return;
    showError(error, '실행할 수 없습니다', 'config'); status(active ? '이전 실행 유지' : '구성 오류', 'error');
  }
}
function stop() {
  ++revision; cancelPending(); if (active) release(active); active = null; snapshot = null;
  if (frame) cancelAnimationFrame(frame); frame = 0;
  preview.clear(); $('preview').append(element('div', 'empty-state', '실행을 중지했습니다. JSON을 실행하면 새로 시작합니다.'));
  appliedSource = null; $('stop').disabled = true; clearError(); status('중지됨'); renderInspector(); updateDraft();
  $('snapshot').textContent = '실행이 중지됐습니다.'; $('node-count').textContent = '0개 노드'; log('실행과 구독 정리 완료');
}
function renderSnapshot() {
  if (!snapshot || !active) return;
  try { preview.render(snapshot); clearError('render'); } catch (error) { showError(error, '미리보기 표시 오류', 'render'); }
  const count = nodes => nodes.reduce((n, node) => n + 1 + count(node.children ?? []), 0);
  $('node-count').textContent = `${count(snapshot.roots)}개 노드`;
  $('snapshot').textContent = display(snapshot);
  renderInspector();
}
function renderInspector() {
  const content = $('inspector-content');
  const open = new Set([...content.querySelectorAll('details[open]')].map(node => node.dataset.key));
  const focusedKey = content.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
  for (const key of ['states', 'queries', 'actions']) $(`count-${key}`).textContent = Object.keys(snapshot?.[key] ?? {}).length;
  if (['snapshot', 'log'].includes(selectedTab)) return;
  content.dataset.kind = selectedTab;
  const entries = Object.entries(snapshot?.[selectedTab] ?? {});
  content.replaceChildren();
  if (!entries.length) content.append(element('div', 'empty-state', active ? { states: 'View에 선언한 State가 없습니다.', queries: 'View에 선언한 Query가 없습니다.', actions: '관찰 ID가 있는 Action 연결이 없습니다.' }[selectedTab] : 'JSON을 실행하면 상태가 표시됩니다.'));
  for (const [name, value] of entries) {
    const entry = element('article', 'inspect-entry'); entry.dataset.name = name;
    const heading = element('div', 'entry-heading'), badge = element('span', 'value-status', value.status); badge.dataset.status = value.status;
    heading.append(element('h3', '', name), badge); entry.append(heading);
    if (selectedTab === 'states') entry.append(element('pre', 'inspect-value', display(value.status === 'ready' ? value.value : value.error ?? { status: value.status })));
    else {
      if (value.stale) entry.append(element('p', 'stale-note', '이전 성공 결과 · stale'));
      if (value.waitingReason) entry.append(element('p', 'stale-note', value.waitingReason));
      entry.append(element('pre', 'inspect-value', display(value.error ?? value.data)));
      const details = element('details'); details.dataset.key = `${selectedTab}/${name}`; details.open = open.has(details.dataset.key);
      details.append(element('summary', '', '전체 상태 보기'), element('pre', '', display(value))); entry.append(details);
    }
    if (selectedTab === 'queries') {
      const buttons = element('div', 'query-buttons');
      for (const [method, label] of [['refresh', '새로고침'], ['retry', '오류 재시도']]) {
        const button = element('button', '', label); button.type = 'button'; button.dataset.focusKey = `${name}/${method}`;
        button.disabled = value.status === 'running' || (method === 'retry' && value.status !== 'error');
        button.addEventListener('click', async () => {
          const session = active; if (!session) return;
          try { await session.view.getQuery(name)[method](); if (active === session) clearError(`query:${name}`); } catch (error) { if (active === session) showError(error, 'Query 실행 오류', `query:${name}`); }
        }); buttons.append(button);
      }
      entry.append(buttons);
    }
    content.append(entry);
  }
  if (focusedKey) [...content.querySelectorAll('button')].find(node => node.dataset.focusKey === focusedKey)?.focus({ preventScroll: true });
}
function selectTab(key) {
  selectedTab = key;
  document.querySelectorAll('[data-tab]').forEach(tab => { const selected = tab.dataset.tab === key; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
  $('inspector-content').hidden = ['snapshot', 'log'].includes(key);
  $('snapshot-pane').hidden = key !== 'snapshot'; $('log-pane').hidden = key !== 'log';
  if (!$('inspector-content').hidden) $('inspector-content').setAttribute('aria-labelledby', `tab-${key}`);
  renderInspector();
}
editor.addEventListener('input', () => { draftRevision++; updateDraft(); });
editor.addEventListener('scroll', () => { $('line-numbers').scrollTop = editor.scrollTop; });
for (const event of ['keyup', 'click', 'select']) editor.addEventListener(event, updateCursor);
editor.addEventListener('keydown', event => {
  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault(); editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end'); draftRevision++; updateDraft();
  }
});
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !$('help').open) { event.preventDefault(); run(); } });
$('run').addEventListener('click', run); $('stop').addEventListener('click', stop);
$('format').addEventListener('click', () => { try { setSource(JSON.stringify(JSON.parse(editor.value), null, 2)); clearError('editor'); } catch (error) { showError(error, 'JSON 정렬 오류'); } });
$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([editor.value], { type: 'application/json' }));
  const anchor = element('a'); anchor.href = url; anchor.download = 'viewstem-playground.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); log('JSON 초안 내보내기');
});
$('import').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  const currentImport = ++importRevision, currentDraft = draftRevision;
  const current = () => currentImport === importRevision && currentDraft === draftRevision;
  try {
    if (file.size > maxBytes) throw Error('1MB 이하의 JSON 파일을 선택하세요.');
    const source = await file.text(); if (!current()) return;
    setSource(source); clearError('editor'); log('JSON 파일을 초안으로 불러왔습니다. 실행 버튼으로 적용하세요.');
  } catch (error) { if (current()) showError(error, '파일 가져오기 오류'); }
});
for (const example of examples) { const option = element('option', '', example.label); option.value = example.id; $('example').append(option); }
$('load-example').addEventListener('click', () => { const example = examples.find(item => item.id === $('example').value); setSource(JSON.stringify(example.document, null, 2)); run(); });
for (const tab of document.querySelectorAll('[data-tab]')) {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  tab.addEventListener('keydown', event => {
    const keys = ['states', 'queries', 'actions', 'snapshot', 'log'];
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (keys.indexOf(selectedTab) + (event.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length;
    selectTab(keys[index]); $(`tab-${keys[index]}`).focus();
  });
}
$('clear-log').addEventListener('click', () => { history.length = 0; $('activity').replaceChildren(); });
$('help-button').addEventListener('click', () => $('help').showModal()); $('close-help').addEventListener('click', () => $('help').close());
for (const component of components) {
  const details = element('details'); details.append(element('summary', '', component.id), element('pre', '', JSON.stringify(component.spec, null, 2))); $('component-help').append(details);
}
window.addEventListener('pagehide', () => { ++revision; cancelPending(); if (active) release(active); });
let draft;
try { draft = localStorage.getItem(storageKey); } catch { /* Storage can be disabled; the editor remains usable. */ }
setSource(draft ?? JSON.stringify(examples[0].document, null, 2)); renderInspector();
if (draft === null || draft === undefined) run();
else { status('초안 복원됨'); log('저장된 초안을 복원했습니다. 실행 버튼으로 적용하세요.'); }
