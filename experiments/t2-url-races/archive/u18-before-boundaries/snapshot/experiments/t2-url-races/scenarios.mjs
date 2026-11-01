import { CommitQueue, UrlProbeHost, relative } from './url-probe.mjs';

function check(condition, message = 'Expectation failed') {
  if (!condition) throw Object.assign(new Error(message), { code: 'ASSERTION' });
}
function same(actual, expected, message) {
  check(JSON.stringify(actual) === JSON.stringify(expected), message ?? `${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
}
function throws(fn, code) {
  try { fn(); } catch (error) { same(error.code, code); return; }
  check(false, `Expected ${code}`);
}
const binding = (name, extra = {}) => ({ name, type: 'string', baseline: `${name}-base`, ...extra });
const initial = '/view?foreign=keep&p.unowned=%2Fraw%20value#part';
const cases = [];
const add = (id, run) => cases.push({ id, run });
const value = (s, key) => new URL(s.endpoint.read()).searchParams.get(key);
const decoded = (s, key) => JSON.parse(value(s, key));
const last = s => s.queue.jobs.at(-1).id;
const connect = (s, bindings = [binding('x'), binding('y')], options = {}) => s.host.connect('screen', bindings, options);

add('U01-newest-write-wins', async s => {
  const c = connect(s);
  c.write({ x: 'old' }); const old = last(s);
  c.write({ x: 'new' }); const fresh = last(s);
  await s.queue.release(fresh);
  await s.queue.release(old);
  same(decoded(s, 'p.x'), 'new');
  same(s.endpoint.commits.length, 1);
});

add('U02-coalesce-distinct-dirty-keys', async s => {
  const c = connect(s);
  c.write({ x: 'first' }); const old = last(s);
  c.write({ y: 'second' }); const fresh = last(s);
  await s.queue.release(old);
  await s.queue.release(fresh);
  same(decoded(s, 'p.x'), 'first');
  same(decoded(s, 'p.y'), 'second');
  same(s.endpoint.commits.length, 1);
});

add('U03-merge-latest-external-url', async s => {
  const c = connect(s);
  c.write({ x: 'mine' });
  s.endpoint.commit(new URL('/another?foreign=changed&foreign=second&p.unowned=%2Fraw%20value#new', s.endpoint.read()).href, 'replace');
  await s.queue.release(last(s));
  const url = new URL(s.endpoint.read());
  same(url.pathname, '/another'); same(url.hash, '#new');
  same(url.searchParams.getAll('foreign'), ['changed', 'second']);
  check(url.search.includes('p.unowned=%2Fraw%20value'));
  same(decoded(s, 'p.x'), 'mine');
});

add('U04-independent-connections', async s => {
  const a = s.host.connect('a', [binding('x')]);
  const b = s.host.connect('b', [binding('y')]);
  a.write({ x: 'a' }); const first = last(s);
  b.write({ y: 'b' }); const second = last(s);
  await s.queue.release(second); await s.queue.release(first);
  same(decoded(s, 'p.x'), 'a'); same(decoded(s, 'p.y'), 'b');
});

add('U05-restore-invalidates-pending-write', async s => {
  const c = connect(s);
  c.write({ x: 'stale', y: 'stale' }); const old = last(s);
  s.endpoint.navigate('/view?p.x=%22restored%22&foreign=nav#back');
  same(c.values, { x: 'restored', y: 'y-base' });
  const url = s.endpoint.read(); const count = s.endpoint.commits.length;
  await s.queue.release(old);
  same(s.endpoint.read(), url); same(s.endpoint.commits.length, count);
  same(s.queue.jobs.length, 1);
});

add('U06-dispose-keeps-url-and-blocks-write', async s => {
  const c = connect(s); c.write({ x: 'stale' });
  const url = s.endpoint.read();
  c.dispose(); await s.queue.release(last(s));
  same(s.endpoint.read(), url); same(s.endpoint.listeners.size, 0);
  throws(() => c.write({ x: 'after' }), 'CANCELLED');
});

add('U07-replace-cleans-only-owned-keys', async s => {
  const service = s.host.connect('service', [binding('shared', { key: 'svc.keep' })]);
  service.write({ shared: 'service' }); await s.queue.release(last(s));
  const a = connect(s); a.write({ x: 'A', y: 'A' }); await s.queue.release(last(s));
  a.write({ x: 'late-A' }); const late = last(s);
  const transition = s.host.replace(a, 'screen', [binding('x', { baseline: 'B-base' })]);
  await s.queue.release(transition.jobId);
  const b = await transition.completion;
  same(b.values.x, 'B-base'); same(value(s, 'p.x'), null); same(value(s, 'p.y'), null);
  b.write({ x: 'B' }); await s.queue.release(last(s));
  await s.queue.release(late);
  same(decoded(s, 'p.x'), 'B'); same(decoded(s, 'svc.keep'), 'service');
  same(value(s, 'p.unowned'), '/raw value'); check(service.alive);
});

add('U08-cancelled-cleanup-cannot-delete-new-owner', async s => {
  const a = connect(s); a.write({ x: 'A' }); await s.queue.release(last(s));
  const transition = s.host.replace(a, 'screen', [binding('x')]);
  const completion = transition.completion.catch(error => error.code);
  transition.cancel();
  const c = s.host.connect('screen', [binding('x')], { restore: false });
  c.write({ x: 'C' }); await s.queue.release(last(s));
  await s.queue.release(transition.jobId);
  same(await completion, 'CANCELLED'); same(decoded(s, 'p.x'), 'C');
});

add('U09-check-after-asynchronous-preparation', async s => {
  const c = connect(s); c.write({ x: 'stale' }); const old = last(s);
  const before = s.endpoint.read();
  await s.queue.release(old, { prepare: async () => { await Promise.resolve(); c.write({ x: 'new' }); } });
  same(s.endpoint.read(), before);
  await s.queue.release(last(s)); same(decoded(s, 'p.x'), 'new');
});

add('U10-obsolete-failure-does-not-report-current-error', async s => {
  const c = connect(s); c.write({ x: 'old' }); const old = last(s);
  c.write({ x: 'new' }); const fresh = last(s);
  await s.queue.release(fresh); await s.queue.release(old, { failure: true });
  same(c.diagnostics, []); same(decoded(s, 'p.x'), 'new');
});

add('U11-write-failure-keeps-state', async s => {
  const c = connect(s); const before = s.endpoint.read();
  const result = c.write({ x: 'valid-state' });
  await s.queue.release(last(s), { failure: true });
  same((await result).code, 'URL_WRITE_FAILED');
  same(c.values.x, 'valid-state'); same(s.endpoint.read(), before);
  same(c.diagnostics.at(-1).code, 'URL_WRITE_FAILED');
});

add('U12-oversized-output-is-atomic', async s => {
  const c = connect(s, undefined, { limits: { maxValueBytes: 24 } });
  const before = s.endpoint.read();
  const result = c.write({ x: 'ok', y: 'oversized-value-'.repeat(4) });
  await s.queue.release(last(s));
  same((await result).code, 'LIMIT_EXCEEDED'); same(s.endpoint.read(), before);
  same(c.values.x, 'ok'); check(c.values.y.length > 24); same(s.endpoint.commits.length, 0);
});

add('U13-owned-budget-includes-existing-owned-values', async s => {
  const c = connect(s, undefined, { limits: { maxOwnedBytes: 45 } });
  c.write({ x: '123456789012345' }); await s.queue.release(last(s));
  const before = s.endpoint.read();
  const result = c.write({ y: '123456789012345' }); await s.queue.release(last(s));
  same((await result).code, 'LIMIT_EXCEEDED'); same(s.endpoint.read(), before);
  same(c.values.y, '123456789012345');
});

add('U14-limit-counts-percent-encoded-bytes', async s => {
  const c = connect(s, [binding('x')], { limits: { maxValueBytes: 16 } });
  const result = c.write({ x: '한🙂' }); await s.queue.release(last(s));
  same((await result).code, 'LIMIT_EXCEEDED'); same(value(s, 'p.x'), null);
  same(c.values.x, '한🙂');
});

add('U15-input-byte-limit-before-json-parse', async s => {
  s.endpoint.navigate('/view?p.x=' + 'x'.repeat(40));
  const c = connect(s, [binding('x')], { limits: { maxValueBytes: 16 } });
  same(c.parseCalls, 0); same(c.values.x, 'x-base');
  same(c.diagnostics.at(-1).code, 'LIMIT_EXCEEDED'); same(s.queue.jobs.length, 0);
});

add('U16-duplicate-decoded-key-falls-back', async s => {
  s.endpoint.navigate('/view?p.x=%22first%22&%70.x=%22second%22');
  const c = connect(s, [binding('x')]);
  same(c.values.x, 'x-base'); same(c.diagnostics.at(-1).code, 'DUPLICATE_KEY');
  same(c.parseCalls, 0);
});

add('U17-restore-always-starts-at-baseline', async s => {
  const c = connect(s); c.write({ x: 'changed', y: 'changed' }); await s.queue.release(last(s));
  s.endpoint.navigate('/view?p.x=%7Bbroken&p.y=42');
  same(c.values, { x: 'x-base', y: 'y-base' });
  c.write({ x: 'different' }); const pending = last(s);
  s.endpoint.navigate('/view?p.x=%7Bbroken&p.y=42');
  same(c.values, { x: 'x-base', y: 'y-base' });
  await s.queue.release(pending);
  same(s.queue.jobs.length, 2);
});

add('U18-null-string-null-empty-and-absence', async s => {
  const c = connect(s, [binding('x', { nullable: true }), binding('y')]);
  c.write({ x: null, y: 'null' }); await s.queue.release(last(s));
  same(value(s, 'p.x'), 'null'); same(value(s, 'p.y'), '"null"');
  c.restore(); same(c.values.x, null); same(c.values.y, 'null');
  c.write({ x: '', y: '' }); await s.queue.release(last(s)); c.restore();
  same(c.values.x, ''); same(c.values.y, '');
  s.endpoint.navigate('/view'); same(c.values, { x: 'x-base', y: 'y-base' });
});

add('U19-array-and-set-codec', async s => {
  const c = connect(s, [binding('x', { type: 'array:number', baseline: [] }), binding('y', { type: 'set:string', baseline: new Set() })]);
  c.write({ x: [0, 1.5], y: new Set(['a', 'b']) }); await s.queue.release(last(s));
  same(decoded(s, 'p.x'), [0, 1.5]); same(decoded(s, 'p.y'), ['a', 'b']);
  c.restore(); check(c.values.y instanceof Set); same([...c.values.y], ['a', 'b']);
  c.write({ x: [], y: new Set() }); await s.queue.release(last(s)); c.restore();
  same(c.values.x, []); same(c.values.y.size, 0);
});

add('U20-explicit-baseline-value-is-not-omitted', async s => {
  const c = connect(s); c.write({ x: 'other' }); await s.queue.release(last(s));
  c.write({ x: 'x-base' }); await s.queue.release(last(s));
  same(value(s, 'p.x'), '"x-base"');
});

add('U21-one-batch-push-dominates', async s => {
  const c = connect(s, [binding('x'), binding('y', { history: 'push' })]);
  c.write({ x: 'X', y: 'Y' }); await s.queue.release(last(s));
  same(s.endpoint.commits.length, 1); same(s.endpoint.commits[0].mode, 'push');
});

add('U22-no-duplicate-history-entry', async s => {
  const c = connect(s, [binding('x', { history: 'push' })]);
  c.write({ x: 'same' }); await s.queue.release(last(s));
  c.write({ x: 'same' }); await s.queue.release(last(s));
  same(s.endpoint.commits.length, 1);
});

add('U23-connection-and-key-collisions', async s => {
  connect(s);
  throws(() => s.host.connect('screen', [binding('z')]), 'DUPLICATE_CONNECTION');
  throws(() => s.host.connect('other', [binding('z', { key: 'p.x' })]), 'DUPLICATE_KEY');
  throws(() => s.host.connect('other', [binding('a', { key: 'same' }), binding('b', { key: 'same' })]), 'DUPLICATE_KEY');
  same(s.queue.jobs.length, 0); same(s.endpoint.commits.length, 0);
});

add('U24-invalid-limits-and-unsupported-bindings', async s => {
  for (const limit of [0, -1, Infinity, 1.5]) throws(() => connect(s, [binding('x')], { limits: { maxValueBytes: limit } }), 'INVALID_DEFINITION');
  throws(() => connect(s, [binding('x'), binding('y')], { limits: { maxKeys: 1 } }), 'LIMIT_EXCEEDED');
  throws(() => connect(s, [binding('x', { type: 'object' })]), 'UNSUPPORTED_BINDING');
  same(s.host.connections.length, 0);
});

add('U25-percent-encoding-once', async s => {
  const c = connect(s); const original = '한글 + & = %25 / 🙂';
  c.write({ x: original }); await s.queue.release(last(s));
  same(decoded(s, 'p.x'), original); c.restore(); same(c.values.x, original);
  check(s.endpoint.read().includes('p.unowned=%2Fraw%20value'));
  same(new URL(s.endpoint.read()).hash, '#part');
});

add('U26-primitives-no-coercion', async s => {
  const c = connect(s, [binding('x', { type: 'number', baseline: 1 }), binding('y', { type: 'boolean', baseline: true })]);
  c.write({ x: -0, y: false }); await s.queue.release(last(s)); c.restore();
  same(value(s, 'p.x'), '0'); check(!Object.is(c.values.x, -0)); same(c.values.y, false);
  throws(() => c.write({ x: '2' }), 'TYPE_MISMATCH');
  throws(() => c.write({ x: NaN }), 'TYPE_MISMATCH');
});

add('U27-real-history-back-forward-restoration', async s => {
  const c = connect(s, [binding('x', { history: 'push' }), binding('y')]);
  c.write({ x: 'one' }); await s.queue.release(last(s));
  c.write({ x: 'two' }); await s.queue.release(last(s));
  c.write({ y: 'pending' }); const pending = last(s);
  const writes = s.endpoint.commits.length;
  await s.endpoint.traverse(-1);
  same(c.values, { x: 'one', y: 'y-base' });
  await s.queue.release(pending); same(s.endpoint.commits.length, writes);
  await s.endpoint.traverse(1); same(c.values, { x: 'two', y: 'y-base' });
  same(s.endpoint.commits.length, writes);
});

add('U28-list-limit-keeps-state-and-url', async s => {
  const c = connect(s, [binding('x', { type: 'array:number', baseline: [] })], { limits: { maxItems: 2 } });
  const before = s.endpoint.read(); const result = await c.write({ x: [1, 2, 3] });
  same(result.code, 'LIMIT_EXCEEDED'); same(c.values.x, [1, 2, 3]); same(s.endpoint.read(), before);
  same(s.queue.jobs.length, 0);
  s.endpoint.navigate('/view?p.x=%5B1%2C2%2C3%5D'); same(c.values.x, []);
  same(c.diagnostics.at(-1).code, 'LIMIT_EXCEEDED');
});

add('U29-cleanup-exact-keys-not-prefix', async s => {
  s.endpoint.navigate('/view?%70.x=%22old%22&p.x.extra=keep&p.z=foreign#hash');
  const c = connect(s, [binding('x')]);
  const transition = s.host.replace(c, 'screen', [binding('y')]);
  await s.queue.release(transition.jobId); await transition.completion;
  same(value(s, 'p.x'), null); same(value(s, 'p.x.extra'), 'keep'); same(value(s, 'p.z'), 'foreign');
  same(new URL(s.endpoint.read()).hash, '#hash');
});

add('U30-retry-retains-unsynchronized-keys', async s => {
  const c = connect(s); c.write({ x: 'first' }); await s.queue.release(last(s), { failure: true });
  c.write({ y: 'second' }); await s.queue.release(last(s));
  same(decoded(s, 'p.x'), 'first'); same(decoded(s, 'p.y'), 'second');
});

add('U31-write-ABA-is-not-current-by-value', async s => {
  const c = connect(s); c.write({ x: 'A' }); const a = last(s);
  c.write({ x: 'B' }); const b = last(s);
  c.write({ x: 'A' }); const latest = last(s);
  await s.queue.release(b); await s.queue.release(a);
  same(s.endpoint.commits.length, 0);
  await s.queue.release(latest); same(decoded(s, 'p.x'), 'A');
});

add('U32-missing-baseline-is-not-null', async s => {
  const c = connect(s, [binding('x', { baseline: undefined })]);
  check(c.values.x === undefined);
  c.write({ x: 'present' }); await s.queue.release(last(s));
  s.endpoint.navigate('/view'); check(c.values.x === undefined);
  s.endpoint.navigate('/view?p.x=broken'); check(c.values.x === undefined);
});

add('U33-invalid-state-write-preserves-valid-pending', async s => {
  const c = connect(s); c.write({ x: 'valid' });
  throws(() => c.write({ x: 4 }), 'TYPE_MISMATCH');
  await s.queue.release(last(s)); same(decoded(s, 'p.x'), 'valid');
});

add('U34-oversized-new-write-invalidates-older-work', async s => {
  const c = connect(s, [binding('x')], { limits: { maxValueBytes: 20 } });
  c.write({ x: 'old' }); const old = last(s);
  c.write({ x: 'very-long-value-'.repeat(4) }); const latest = last(s);
  await s.queue.release(latest); await s.queue.release(old);
  same(value(s, 'p.x'), null); same(s.endpoint.commits.length, 0);
  same(c.diagnostics.at(-1).code, 'LIMIT_EXCEEDED');
});

add('U35-unchanged-key-does-not-reorder-url', async s => {
  const c = connect(s, [binding('x', { history: 'push' }), binding('y')]);
  c.write({ x: 'X', y: 'Y' }); await s.queue.release(last(s));
  const before = s.endpoint.read(); const count = s.endpoint.commits.length;
  c.write({ x: 'X' }); await s.queue.release(last(s));
  same(s.endpoint.read(), before);
  same(s.endpoint.commits.length, count);
});

add('U36-only-actually-changed-fields-select-push', async s => {
  const c = connect(s, [binding('x', { history: 'push' }), binding('y')]);
  c.write({ x: 'X', y: 'Y' }); await s.queue.release(last(s));
  c.write({ x: 'X', y: 'different' }); await s.queue.release(last(s));
  same(s.endpoint.commits.at(-1).mode, 'replace');
});

export { cases };
export const mutations = [
  ['skipCommitGuard', 'U01-newest-write-wins'],
  ['checkOnlyAtStart', 'U01-newest-write-wins'],
  ['staleUrlSnapshot', 'U03-merge-latest-external-url'],
  ['dropPendingPatch', 'U02-coalesce-distinct-dirty-keys'],
  ['skipRestoreInvalidation', 'U05-restore-invalidates-pending-write'],
  ['checkBeforePreparation', 'U09-check-after-asynchronous-preparation'],
];

function setup(makeEndpoint, mutation) {
  const endpoint = makeEndpoint(initial);
  const queue = new CommitQueue(endpoint, mutation);
  return { endpoint, queue, host: new UrlProbeHost(queue) };
}

export async function runCase(id, makeEndpoint, mutation = {}) {
  const s = setup(makeEndpoint, mutation);
  const test = cases.find(item => item.id === id);
  let result;
  try {
    await test.run(s);
    result = { id, passed: true };
  } catch (error) {
    result = { id, passed: false, code: error.code, error: error.message };
  } finally {
    for (const connection of s.host.connections) connection.dispose();
    if (s.endpoint.listeners.size !== 0) result = { id, passed: false, code: 'ASSERTION', error: 'Leaked subscription' };
  }
  result.url = relative(s.endpoint.read());
  result.commits = s.endpoint.commits.map(item => ({ mode: item.mode, url: relative(item.href) }));
  result.trace = s.queue.trace;
  s.endpoint.dispose();
  return result;
}

export async function runSeed(seed, makeEndpoint) {
  const s = setup(makeEndpoint, {});
  const c = connect(s, [binding('x'), binding('y'), binding('z')]);
  let random = seed >>> 0;
  const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0);
  const expected = {};
  let result;
  try {
    for (let i = 0; i < 18; ++i) {
      const name = ['x', 'y', 'z'][i % 3];
      expected[name] = `${name}-${next()}`;
      c.write({ [name]: expected[name] });
    }
    s.endpoint.commit(new URL('/view?foreign=latest#fresh', s.endpoint.read()).href, 'replace');
    const ids = s.queue.jobs.map(job => job.id);
    for (let i = ids.length - 1; i > 0; --i) { const j = next() % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    for (const id of ids) await s.queue.release(id);
    for (const [name, expectedValue] of Object.entries(expected)) same(decoded(s, `p.${name}`), expectedValue);
    same(value(s, 'foreign'), 'latest'); same(new URL(s.endpoint.read()).hash, '#fresh');
    same(s.endpoint.commits.length, 2);
    result = { seed, passed: true, writes: 18, releaseOrder: ids, finalUrl: relative(s.endpoint.read()) };
  } catch (error) { result = { seed, passed: false, code: error.code, error: error.message }; }
  finally { c.dispose(); s.endpoint.dispose(); }
  return result;
}
