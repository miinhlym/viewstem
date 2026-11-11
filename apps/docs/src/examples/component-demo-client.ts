import type { ViewSpec } from '@viewstem/core';
import { createDemoSession } from './component-demo-session.mjs';

export function setupComponentDemo(container: HTMLElement) {
  const find = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
  const target = find<HTMLElement>('[data-demo-target]');
  const reset = find<HTMLButtonElement>('[data-demo-reset]');
  const copy = find<HTMLButtonElement>('[data-demo-copy]');
  const status = find<HTMLElement>('[data-demo-status]');
  const copyStatus = find<HTMLElement>('[data-copy-status]');
  const source = find<HTMLScriptElement>('[data-demo-view]').textContent!;
  const ko = container.dataset.locale === 'ko';
  const listeners = new AbortController();
  const { signal } = listeners;
  const showError = (error: unknown) => {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    target.replaceChildren();
    status.textContent = `${ko ? '미리보기를 실행하지 못했습니다. 다시 실행해 보세요.' : 'Could not run the preview. Try running it again.'} ${message}`;
    container.dataset.demoError = message;
    delete container.dataset.demoReady;
    status.hidden = false;
    target.setAttribute('aria-busy', 'false');
  };
  const session = createDemoSession({
    async mount(snapshot, version) {
      const surface = document.createElement('div');
      target.replaceChildren(surface);
      const { mountUiComponentDemo } = await import('./component-demo-ui-runtime');
      return mountUiComponentDemo(surface, JSON.parse(snapshot) as ViewSpec, container.dataset.family!, error => {
        if (session.isCurrent(version)) showError(error);
      });
    },
    pending(version) {
      container.dataset.demoVersion = String(version);
      delete container.dataset.demoReady;
      delete container.dataset.demoError;
      target.setAttribute('aria-busy', 'true');
      target.inert = true;
      status.textContent = ko ? '미리보기를 불러오는 중입니다.' : 'Loading preview.';
      status.hidden = false;
      copyStatus.textContent = '';
    },
    ready(version) {
      target.setAttribute('aria-busy', 'false');
      target.inert = false;
      if (!container.dataset.demoError) {
        container.dataset.demoReady = 'true';
        container.dataset.demoAppliedVersion = String(version);
        status.hidden = true;
      }
    },
    error(error) { showError(error); },
  });

  let started = false;
  let observer: IntersectionObserver | undefined;
  function run() {
    started = true;
    observer?.disconnect();
    session.request(source);
  }

  reset.disabled = false;
  reset.addEventListener('click', run, { signal });
  async function copySource(value: string | null | undefined, kind: 'setup' | 'json', feedback: HTMLElement) {
    try {
      if (value == null) throw new Error('Missing code to copy');
      await navigator.clipboard.writeText(value);
      feedback.textContent = kind === 'setup'
        ? (ko ? '실행 코드를 복사했습니다.' : 'Setup code copied.')
        : (ko ? 'JSON을 복사했습니다.' : 'JSON copied.');
    } catch {
      feedback.textContent = ko ? '복사하지 못했습니다. 코드를 직접 선택해 복사하세요.' : 'Could not copy. Select and copy the code directly.';
    }
  }

  copy.disabled = false;
  copy.addEventListener('click', () => {
    const setup = copy.closest<HTMLElement>('.demo-workbench')?.dataset.panel === 'setup';
    const value = setup ? container.querySelector('.workbench-setup pre code')?.textContent : source;
    void copySource(value, setup ? 'setup' : 'json', copyStatus);
  }, { signal });
  const inlineCopy = container.querySelector<HTMLButtonElement>('[data-demo-copy-inline-setup]');
  if (inlineCopy) {
    const inlineCopyStatus = find<HTMLElement>('[data-inline-copy-status]');
    inlineCopy.disabled = false;
    inlineCopy.addEventListener('click', () => {
      void copySource(container.querySelector('.inline-setup pre code')?.textContent, 'setup', inlineCopyStatus);
    }, { signal });
  }
  window.addEventListener('pagehide', () => session.pause(), { signal });
  window.addEventListener('pageshow', event => { if (event.persisted && started) run(); }, { signal });
  if (container.hasAttribute('data-demo-lazy') && typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(entries => {
      if (!started && !signal.aborted && entries.some(entry => entry.isIntersecting)) run();
    });
    observer.observe(target);
  } else run();

  return {
    dispose() { listeners.abort(); observer?.disconnect(); session.pause(); },
  };
}
