import { createRenderer } from '@viewstem/svelte';
import { registerComponents } from '@viewstem/svelte-ui';
import { shadcn } from '@viewstem/svelte-ui/shadcn';
import { sampleBySlug, samples } from '../test/fixtures/samples.mjs';
import { scenarioBySlug, scenarios } from './scenarios.mjs';
import { createDefinitionDraft, sectionKinds } from './definition-sections.mjs';

const kind = document.querySelector('#example-kind');
const picker = document.querySelector('#family');
const pickerLabel = document.querySelector('label[for="family"]');
const editor = document.querySelector('#definition');
const sectionTabs = document.querySelector('#definition-sections');
const sectionItem = document.querySelector('#section-item');
const sectionPath = document.querySelector('#section-path');
const sectionDetail = document.querySelector('#section-detail');
const editorError = document.querySelector('#editor-error');
const definitionPane = document.querySelector('#definition-pane');
const draft = createDefinitionDraft();
const target = document.querySelector('#preview');
const inspector = document.querySelector('#inspector');
const diagnostics = document.querySelector('#diagnostics');
const status = document.querySelector('#status');
const apply = document.querySelector('#apply');
const restore = document.querySelector('#restore');
const invalid = document.querySelector('#invalid');
const theme = document.querySelector('#theme');
const renderer = createRenderer({
  onError(diagnostic) {
    // Native blur and close events can arrive as the prior View lifetime ends.
    if (diagnostic.phase === 'event' && diagnostic.error.code === 'CANCELLED') return;
    showError(diagnostic.error, diagnostic.node?.componentRef);
  },
});

registerComponents(renderer, shadcn);
const currentExamples = () => kind.value === 'screens' ? scenarioBySlug : sampleBySlug;
function fillPicker(selected) {
  picker.replaceChildren();
  for (const sample of kind.value === 'screens' ? scenarios : samples) picker.add(new Option(sample.title, sample.slug));
  picker.value = currentExamples().has(selected) ? selected : kind.value === 'screens' ? 'profile' : 'button';
  pickerLabel.textContent = kind.value === 'screens' ? '화면' : '컴포넌트';
}

let mounted;
let unsubscribe;
let revision = 0;
let busy = false;
function setBusy(value) {
  busy = value;
  apply.disabled = kind.disabled = picker.disabled = restore.disabled = invalid.disabled = sectionItem.disabled = value;
  for (const tab of sectionTabs.children) tab.disabled = value || tab.dataset.empty === 'true';
}
function syncSectionUrl() {
  const url = new URL(location.href);
  if (draft.selection.kind === 'all') url.searchParams.delete('section');
  else url.searchParams.set('section', draft.selection.kind);
  history.replaceState(null, '', url);
}
function renderEditor() {
  draft.select(draft.selection.kind, draft.selection.path);
  const sections = draft.sections;
  const selected = draft.selection;
  sectionTabs.replaceChildren();
  for (const name of ['all', ...sectionKinds]) {
    // Keep the principal categories visible; secondary inline resource kinds
    // appear only when this document actually contains them.
    if (['Variable', 'Datasource'].includes(name) && !sections[name].length) continue;
    const tab = document.createElement('button');
    tab.type = 'button'; tab.id = 'section-' + name; tab.dataset.kind = name;
    tab.dataset.empty = String(name !== 'all' && sections[name].length === 0);
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'definition-pane');
    tab.setAttribute('aria-selected', String(selected.kind === name));
    tab.tabIndex = selected.kind === name ? 0 : -1;
    tab.textContent = name === 'all' ? '전체' : `${name} ${sections[name].length}`;
    sectionTabs.append(tab);
  }
  sectionDetail.hidden = selected.kind === 'all';
  sectionItem.replaceChildren();
  for (const item of sections[selected.kind] ?? []) sectionItem.add(new Option(item.label, item.path));
  sectionItem.value = selected.path;
  sectionPath.textContent = sectionPath.title = selected.path;
  definitionPane.setAttribute('aria-labelledby', 'section-' + selected.kind);
  editor.setAttribute('aria-label', selected.kind === 'all' ? '전체 ViewSpec JSON' : selected.kind + ' JSON');
  editor.value = draft.text();
  editorError.textContent = '';
  setBusy(busy);
  syncSectionUrl();
}
function commitEditor() {
  try {
    const view = draft.commit(editor.value);
    editorError.textContent = '';
    return view;
  } catch (error) {
    editorError.textContent = 'JSON을 확인하세요. ' + error.message;
    throw error;
  }
}
function selectSection(kind, path) {
  try {
    commitEditor();
    draft.select(kind, path);
    renderEditor();
  } catch {
    sectionItem.value = draft.selection.path;
  }
}
sectionTabs.addEventListener('click', event => {
  const tab = event.target.closest('button[data-kind]');
  if (!tab || tab.disabled) return;
  selectSection(tab.dataset.kind);
  document.getElementById('section-' + draft.selection.kind).focus();
});
sectionTabs.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...sectionTabs.children].filter(tab => !tab.disabled);
  const index = tabs.findIndex(tab => tab.dataset.kind === draft.selection.kind);
  if (!tabs.length) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  selectSection(tabs[next].dataset.kind);
  document.getElementById('section-' + draft.selection.kind).focus();
});
sectionItem.addEventListener('change', () => selectSection(draft.selection.kind, sectionItem.value));
editor.addEventListener('input', () => { editorError.textContent = ''; });
function showError(error, componentRef) {
  const message = error?.code ? error.code + ' · ' + error.message : String(error);
  diagnostics.textContent = componentRef ? componentRef + ' · ' + message : message;
}

function inspect(snapshot) {
  const selected = { states: snapshot.states, queries: snapshot.queries, actions: snapshot.actions, errors: snapshot.errors };
  inspector.textContent = JSON.stringify(selected, (_key, value) => {
    if (value instanceof Set) return [...value];
    if (value instanceof Map) return Object.fromEntries(value);
    return value;
  }, 2);
}

async function applyDefinition() {
  const current = ++revision;
  setBusy(true);
  diagnostics.textContent = '';
  status.textContent = '준비 중';
  try {
    const definition = commitEditor();
    renderEditor();
    let result;
    if (mounted) {
      result = await mounted.replace({ view: definition });
    } else {
      mounted = await renderer.mount({ target, view: definition });
      unsubscribe = mounted.view.subscribe(inspect);
      result = mounted;
    }
    await mounted.whenRendered();
    status.textContent = '표시 중';
    result.initialComplete.then(report => {
      if (revision !== current) return;
      status.textContent = report.queryErrors.length ? '최초 Query 오류 ' + report.queryErrors.length + '건' : '초기 표시 완료';
    }).catch(error => {
      if (revision === current && error?.code !== 'CANCELLED') showError(error);
    });
  } catch (error) {
    status.textContent = '적용 실패';
    if (!diagnostics.textContent) showError(error);
  } finally {
    setBusy(false);
  }
}

function loadSample(preferredKind = draft.selection.kind) {
  const sample = currentExamples().get(picker.value);
  draft.load(sample.view, preferredKind);
  const url = new URL(location.href);
  url.searchParams.delete('family'); url.searchParams.delete('example');
  url.searchParams.set(kind.value === 'screens' ? 'example' : 'family', picker.value);
  history.replaceState(null, '', url);
  renderEditor();
  void applyDefinition();
}

kind.addEventListener('change', () => { fillPicker(); loadSample(); });
picker.addEventListener('change', () => loadSample());
restore.addEventListener('click', () => loadSample());
apply.addEventListener('click', () => void applyDefinition());
invalid.addEventListener('click', () => {
  const sample = structuredClone(currentExamples().get(picker.value).view);
  sample.render.inputs = { ...sample.render.inputs, unsupportedExampleField: true };
  draft.load(sample, 'all');
  renderEditor();
  void applyDefinition();
});
theme.addEventListener('click', () => {
  const dark = document.documentElement.classList.toggle('dark');
  theme.setAttribute('aria-pressed', String(dark));
});
window.addEventListener('pagehide', event => {
  // A cached page resumes with its DOM and module state; keep its execution alive.
  if (event.persisted) return;
  revision++;
  unsubscribe?.();
  void renderer.dispose().catch(() => {});
});

const params = new URL(location.href).searchParams;
kind.value = scenarioBySlug.has(params.get('example')) ? 'screens' : 'components';
fillPicker(params.get(kind.value === 'screens' ? 'example' : 'family'));
loadSample(params.get('section') ?? 'all');
