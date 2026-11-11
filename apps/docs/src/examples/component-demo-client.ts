import type { ViewSpec } from '@viewstem/svelte';
import type { DemoControl } from './component-demo-controls.mjs';
import { createDemoSession } from './component-demo-session.mjs';
import { renderDemoJson } from './component-demo-json';

export function setupComponentDemo(container: HTMLElement) {
  const find = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
  const target = find<HTMLElement>('[data-demo-target]');
  const reset = find<HTMLButtonElement>('[data-demo-reset]');
  const copy = find<HTMLButtonElement>('[data-demo-copy]');
  const status = find<HTMLElement>('[data-demo-status]');
  const copyStatus = find<HTMLElement>('[data-copy-status]');
  const sourceElement = find<HTMLScriptElement>('[data-demo-view]');
  const original = sourceElement.textContent!;
  const code = find<HTMLElement>('.source-code code');
  const codeRegion = find<HTMLElement>('.source-scroll [data-slot="scroll-area-viewport"]');
  const ko = container.dataset.locale === 'ko';
  const listeners = new AbortController();
  const { signal } = listeners;
  let source = original;
  const showError = (error: unknown) => {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    target.replaceChildren();
    status.textContent = `${ko ? '미리보기를 실행하지 못했습니다. 설정을 수정하거나 다시 실행하세요.' : 'Could not run the preview. Change an option or run it again.'} ${message}`;
    container.dataset.demoError = message;
    delete container.dataset.demoReady;
    status.hidden = false;
    target.setAttribute('aria-busy', 'false');
  };
  const session = createDemoSession({
    async mount(snapshot, version) {
      const surface = document.createElement('div');
      target.replaceChildren(surface);
      if (container.dataset.renderer === 'ui') {
        const { mountUiComponentDemo } = await import('./component-demo-ui-runtime');
        return mountUiComponentDemo(surface, JSON.parse(snapshot) as ViewSpec, container.dataset.family!, error => {
          if (session.isCurrent(version)) showError(error);
        });
      }
      const { mountComponentDemo } = await import('./component-demo-runtime');
      return mountComponentDemo(surface, JSON.parse(snapshot) as ViewSpec, container.dataset.family!, diagnostic => {
        if (session.isCurrent(version)) showError(diagnostic.error);
      });
    },
    pending(version) {
      container.dataset.demoVersion = String(version);
      delete container.dataset.demoReady;
      delete container.dataset.demoError;
      target.setAttribute('aria-busy', 'true');
      target.inert = true;
      status.textContent = ko ? '현재 설정을 적용하는 중입니다.' : 'Applying the current settings.';
      status.hidden = false;
      copyStatus.textContent = '';
    },
    ready(version) {
      target.setAttribute('aria-busy', 'false');
      target.inert = false;
      if (!container.dataset.demoError) {
        container.dataset.demoReady = 'true';
        container.dataset.demoAppliedVersion = String(version);
        status.textContent = ko ? '현재 설정이 적용되었습니다.' : 'Current settings applied.';
      }
    },
    error(error) { showError(error); },
  });

  function updateSource(next: string, changed?: string[]) {
    source = next;
    sourceElement.textContent = next;
    renderDemoJson(code, next, changed);
    code.parentElement!.className = 'live-json';
    code.parentElement!.removeAttribute('style');
  }
  function apply(control: DemoControl, value: string | number | boolean) {
    const view = JSON.parse(source);
    let parent: Record<string, unknown> = view;
    for (const key of control.path.slice(0, -1)) {
      parent[key] ??= {};
      parent = parent[key] as Record<string, unknown>;
    }
    parent[control.path.at(-1)!] = value;
    updateSource(JSON.stringify(view, null, 2), control.path);
    session.request(source, control.kind === 'text' || control.kind === 'number' ? 180 : 0);
  }
  function showJson(control: DemoControl) {
    container.dispatchEvent(new CustomEvent('demo:reveal', { detail: 'json' }));
    updateSource(source, control.path);
    const line = [...code.querySelectorAll<HTMLElement>('[data-json-path]')]
      .find(element => element.dataset.jsonPath === JSON.stringify(control.path));
    codeRegion.focus({ preventScroll: true });
    codeRegion.scrollIntoView({ block: 'nearest' });
    if (line) codeRegion.scrollTop += line.getBoundingClientRect().top - codeRegion.getBoundingClientRect().top - codeRegion.clientHeight / 3;
    else copyStatus.textContent = ko ? '이 옵션은 생략되어 기본값을 사용합니다. 값을 바꾸면 JSON에 추가됩니다.' : 'This option uses its default and is omitted. Changing it adds the field to JSON.';
  }
  reset.disabled = false;
  reset.addEventListener('click', () => session.request(source), { signal });
  copy.disabled = false;
  copy.addEventListener('click', async () => {
    const copied = source;
    try {
      await navigator.clipboard.writeText(copied);
      copyStatus.textContent = copied === source ? (ko ? 'JSON을 복사했습니다.' : 'JSON copied.')
        : (ko ? '이전 설정을 복사했습니다. 현재 설정은 다시 복사하세요.' : 'Copied the previous settings. Copy again for the current settings.');
    } catch {
      copyStatus.textContent = ko ? '복사하지 못했습니다. JSON을 직접 선택해 복사하세요.' : 'Could not copy. Select and copy the JSON directly.';
    }
  }, { signal });
  window.addEventListener('pagehide', () => session.pause(), { signal });
  window.addEventListener('pageshow', event => { if (event.persisted) session.request(source); }, { signal });
  // Match API references back to the relevant option, including collapsed sections.
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-demo-option-link]')) {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const id = link.hash.slice(1);
      const element = document.getElementById(id);
      history.pushState(null, '', link.hash);
      container.dispatchEvent(new CustomEvent('demo:reveal', { detail: 'options' }));
      element?.scrollIntoView({ block: 'center' });
      element?.querySelector<HTMLElement>('[data-control]')?.focus({ preventScroll: true });
    }, { signal });
  }
  session.request(source);
  return {
    apply,
    showJson,
    restore() { updateSource(original); session.request(source); },
    dispose() { listeners.abort(); session.pause(); },
  };
}
