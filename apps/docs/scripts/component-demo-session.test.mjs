import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSession } from '../src/examples/component-demo-session.mjs';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('latest settings wait for stale mount disposal before mounting; pause disposes the active instance', async () => {
  const mounted = deferred(), released = deferred();
  const events = [];
  const session = createDemoSession({
    pending() {}, ready(v) {events.push('ready:' + v);}, error(error) {throw error;},
    async mount(source) {
      events.push('mount:' + source);
      if (source === 'first') await mounted.promise;
      return { async dispose() { events.push('dispose:' + source); if (source === 'first') await released.promise; } };
    },
  });
  session.request('first'); await tick();
  session.request('second'); session.request('latest');
  mounted.resolve(); await tick();
  assert.deepEqual(events, ['mount:first', 'dispose:first']);
  released.resolve(); await tick();
  assert.deepEqual(events, ['mount:first', 'dispose:first', 'mount:latest', 'ready:3']);
  session.pause(); await tick();
  assert.equal(events.at(-1), 'dispose:latest');
});

test('page exit during mount never publishes the stale result; resume mounts the current settings', async () => {
  const gate = deferred(); const events = [];
  const session = createDemoSession({pending() {}, ready(v) {events.push('ready:' + v);}, error(error) {throw error;},
    async mount(source) { events.push(source); if (source === 'old') await gate.promise; return {async dispose() {events.push('disposed:' + source);}}; }});
  session.request('old'); await tick(); session.pause(); session.request('resumed'); gate.resolve(); await tick();
  assert.deepEqual(events, ['old', 'disposed:old', 'resumed', 'ready:3']);
  session.pause(); await tick();
});

test('failed runs recover; superseded failures are not surfaced', async () => {
  const gate = deferred(); const events = [];
  const session = createDemoSession({pending() {}, ready(v) {events.push('ready:' + v);}, error(e) {events.push(e.message);},
    async mount(source) { if (source === 'slow') {await gate.promise; throw Error('stale');} if (source === 'bad') throw Error('invalid'); return {async dispose() {}}; }});
  session.request('bad'); await tick();
  session.request('slow'); await tick(); session.request('valid'); gate.resolve(); await tick();
  assert.deepEqual(events, ['invalid', 'ready:3']); session.pause(); await tick();
});

test('debounced updates keep only the newest setting', async () => {
  const done = deferred(); const mounted = [];
  const session = createDemoSession({pending() {}, ready() {done.resolve();}, error(e) {throw e;},
    async mount(source) {mounted.push(source); return {async dispose() {}};}});
  session.request('a', 5); session.request('b', 5); session.request('c', 5);
  await done.promise; assert.deepEqual(mounted, ['c']); session.pause(); await tick();
});
