import { mergeOwnedUrl } from '../../../src/url.mjs';
// A host adapter fixture with the real required commit-time isCurrent protocol.
// URL merging is product code; only delivery control/history recording live here.
export function memoryUrl(initial = 'https://example.test/view', { delayed = false } = {}) {
  let href = new URL(initial, 'https://example.test').href, failure;
  const listeners = new Set(), pending = [], commits = [], attempts = [];
  const adapter = {
    read: () => href,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    writeOwned(patch, options) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const job = { patch: { ...patch }, options, resolve, reject };
      attempts.push(job);
      if (delayed) pending.push(job); else commit(job);
      return promise;
    },
  };
  function commit(job) {
    if (!job.options.isCurrent()) { job.resolve({ applied: false }); return; }
    if (failure) { const error = failure; failure = undefined; job.reject(error); return; }
    const next = mergeOwnedUrl(href, job.patch);
    if (next !== href) { href = next; commits.push({ href, mode: job.options.mode, patch: job.patch }); }
    job.resolve({ applied: true });
  }
  return { adapter, listeners, pending, commits, attempts,
    read: () => href,
    failNext(error = { code: 'HTTP_ERROR' }) { failure = error; },
    release(index = 0) { const [job] = pending.splice(index, 1); if (!job) throw Error('NO_PENDING_URL_JOB'); commit(job); },
    navigate(next) { href = new URL(next, href).href; for (const listener of [...listeners]) listener(); },
  };
}
export const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
export const link = values => `https://example.test/view?${new URLSearchParams(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]))}`;
