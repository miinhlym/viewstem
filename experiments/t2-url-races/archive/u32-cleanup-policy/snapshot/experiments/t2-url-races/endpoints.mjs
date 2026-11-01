// Same interface for a memory sink and a real disposable browser History endpoint.
export function memoryEndpoint(initial) {
  let href = new URL(initial, 'http://fixture.invalid').href;
  const listeners = new Set();
  const commits = [];
  const history = [href];
  let cursor = 0;
  const endpoint = {
    commits, listeners,
    read: () => href,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    commit: (next, mode) => {
      href = new URL(next, href).href;
      if (mode === 'push') { history.splice(cursor + 1); history.push(href); ++cursor; }
      else history[cursor] = href;
      commits.push({ href, mode });
    },
    navigate: next => { endpoint.commit(new URL(next, href).href, 'push'); for (const fn of listeners) fn(); },
    traverse: async delta => { cursor += delta; href = history[cursor]; for (const fn of listeners) fn(); },
    dispose: () => { listeners.clear(); },
  };
  return endpoint;
}

export function browserEndpoint(initial) {
  const listeners = new Set();
  const commits = [];
  history.replaceState({ fixture: true }, '', new URL(initial, location.origin));
  const notify = () => { for (const fn of listeners) fn(); };
  window.addEventListener('popstate', notify);
  const endpoint = {
    commits, listeners,
    read: () => location.href,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    commit: (next, mode) => {
      history[mode === 'push' ? 'pushState' : 'replaceState'](history.state, '', next);
      commits.push({ href: location.href, mode });
    },
    navigate: next => { endpoint.commit(new URL(next, location.href).href, 'push'); notify(); },
    traverse: delta => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { window.removeEventListener('popstate', done); reject(new Error('popstate timeout')); }, 3000);
      const done = () => { clearTimeout(timeout); resolve(); };
      window.addEventListener('popstate', done, { once: true });
      history.go(delta);
    }),
    dispose: () => { window.removeEventListener('popstate', notify); listeners.clear(); },
  };
  return endpoint;
}
