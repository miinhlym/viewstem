import test from 'node:test';
import assert from 'node:assert/strict';
import { createStateStore } from '../src/index.mjs';

const schema = { type: 'integer' };
const hostFailure = () => { throw new Error('private host details'); };

test('URL disposal releases the connection when the adapter unsubscribe throws', { timeout: 1000 }, async () => {
  const store = createStateStore(), scope = store.createScope();
  let restore, reads = 0, writes = 0;
  const target = scope.registerState('value', { schema, initial: 2 });
  const adapter = {
    read() { reads++; return 'https://example.test/?p.value=4'; },
    subscribe(listener) { restore = listener; return hostFailure; },
    writeOwned() { writes++; }
  };
  const errors = [];
  const options = { adapter, bindings: [{ target }], restore: false, onError: error => errors.push(error) };
  const connection = store.connectUrl(options);

  connection.dispose();
  connection.dispose();
  await connection.ready;
  assert.equal(errors.length, 1);
  assert.deepEqual(connection.getDiagnostics(), errors);
  assert.doesNotMatch(JSON.stringify(errors), /private host details/);
  restore();
  target.write(3);
  assert.deepEqual([reads, writes], [0, 0]);
  const replacement = store.connectUrl({ ...options, restore: true });
  assert.equal(target.read(), 4);
  store.dispose();
  assert.throws(() => target.read(), { code: 'CANCELLED' });
  assert.equal(replacement.getDiagnostics().length, 1);
});

test('scope disposal cancels handles and all clock subscriptions despite host failure', () => {
  const store = createStateStore(), owner = store.createScope(), other = store.createScope();
  const clockState = owner.registerState('clock', { schema });
  const watch = other.registerState('watch', { schema, initial: 1 });
  const target = other.registerState('target', { schema, initial: 0 });
  let lateTick, stops = 0;
  const connectFailingClock = () => owner.connectClock(clockState, {
    now: () => 1, subscribe(listener) { lateTick = listener; return hostFailure; }
  });
  const disconnect = connectFailingClock();
  disconnect();
  disconnect();
  connectFailingClock();
  owner.connectClock(clockState, { now: () => 2, subscribe: () => () => { stops++; } });
  store.registerReaction(owner, { watch: [watch], target, value: 7 });
  watch.write(2);
  assert.equal(target.read(), 7);

  store.transaction(() => owner.dispose());
  owner.dispose();
  assert.equal(stops, 1);
  assert.doesNotThrow(() => lateTick(3));
  assert.throws(() => clockState.read(), { code: 'CANCELLED' });
  target.write(0);
  watch.write(3);
  assert.equal(target.read(), 0);
  assert.deepEqual(store.getDiagnostics(), Array(2).fill({ code: 'INTERNAL_ERROR', message: 'INTERNAL_ERROR' }));
});

test('failed transaction rolls back newly created scopes despite host cleanup errors', () => {
  const store = createStateStore(), original = store.createScope();
  const retained = original.registerState('value', { schema, initial: 1 });
  let discarded;
  const failure = new Error('transaction failure');
  assert.throws(() => store.transaction(() => {
    retained.write(2);
    const created = store.createScope();
    discarded = created.registerState('clock', { schema });
    created.connectClock(discarded, { now: () => 1, subscribe: () => hostFailure });
    throw failure;
  }), error => error === failure);
  assert.equal(retained.read(), 1);
  assert.throws(() => discarded.read(), { code: 'CANCELLED' });
  assert.equal(store.getDiagnostics()[0].code, 'INTERNAL_ERROR');
});

test('reaction registration rejects foreign and cancelled owners without changing the graph', () => {
  const store = createStateStore(), owner = store.createScope(), other = store.createScope();
  const foreign = createStateStore().createScope(), cancelled = store.createScope();
  cancelled.dispose();
  const watch = other.registerState('watch', { schema, initial: 1 });
  const target = other.registerState('target', { schema, initial: 0 });
  const reaction = { watch: [watch], target, value: 7 };

  assert.throws(() => store.registerReaction(foreign, reaction), { code: 'INVALID_DEFINITION' });
  assert.throws(() => store.registerReaction(cancelled, reaction), { code: 'CANCELLED' });
  watch.write(2);
  assert.equal(target.read(), 0);
  store.registerReaction(owner, reaction);
  watch.write(3);
  assert.equal(target.read(), 7);
  owner.dispose();
  target.write(0);
  watch.write(4);
  assert.equal(target.read(), 0);
});

test('URL startup failures release claims and installed subscriptions', () => {
  const store = createStateStore(), scope = store.createScope();
  const target = scope.registerState('value', { schema, initial: 1 });
  let failing = 'subscribe', stops = 0, reads = 0;
  const adapter = {
    subscribe(listener) {
      if (failing === 'subscribe') hostFailure();
      if (failing !== 'read') listener();
      return () => { stops++; };
    },
    read() {
      reads++;
      if (failing === 'read') hostFailure();
      return 'https://example.test/?p.value=4';
    },
    writeOwned() {},
  };
  const options = { adapter, bindings: [{ target }] };

  assert.throws(() => store.connectUrl(options), /private host details/);
  // Fail the initial read after subscribe has returned its cleanup callback.
  failing = 'read';
  assert.throws(() => store.connectUrl(options), /private host details/);
  assert.equal(stops, 1);
  failing = null;
  const connection = store.connectUrl(options);
  assert.equal(target.read(), 4);
  assert.equal(reads, 3);
  connection.dispose();
  assert.equal(stops, 2);
});
