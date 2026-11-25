import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntime, defineResourceSet } from '@viewstem/core';
import { withDeadline } from './deadline.mjs';
import { sampleQueryProjection } from './query-projection.mjs';

test('sample deadline signals cancellation and names the unfinished phase', async () => {
  let cancelled = false;
  await assert.rejects(
    withDeadline(new Promise(() => {}), 'test sample', 10, () => {
      cancelled = true;
    }),
    { name: 'BenchmarkTimeout', phase: 'test sample', milliseconds: 10 },
  );
  assert.equal(cancelled, true);
  assert.equal(await withDeadline(Promise.resolve(7), 'next sample', 100), 7);
});

test('missing Query running publication rejects, disposes and allows the next sample', async () => {
  let disposed = false;
  const createWithoutRunning = (options) => {
    const runtime = createRuntime(options);
    return {
      ...runtime,
      async createView(...args) {
        const view = await runtime.createView(...args);
        return {
          ...view,
          initial: view.initial,
          subscribe: (listener) =>
            view.subscribe((snapshot) => {
              if (snapshot.queries.summary.status !== 'running') listener(snapshot);
            }),
        };
      },
      async dispose() {
        disposed = true;
        await runtime.dispose();
      },
    };
  };
  await assert.rejects(
    sampleQueryProjection({
      createRuntime: createWithoutRunning,
      defineResourceSet,
      size: 1,
      timeoutMs: 1000,
    }),
    {
      name: 'BenchmarkTimeout',
      phase: 'summary request and running publication',
    },
  );
  assert.equal(disposed, true);
  const elapsed = await sampleQueryProjection({
    createRuntime,
    defineResourceSet,
    size: 1,
    timeoutMs: 1000,
  });
  assert.ok(Number.isFinite(elapsed));
});
