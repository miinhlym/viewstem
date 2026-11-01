import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './query-composite-fixtures.mjs';
import { cases, staticCases } from './query-composite-cases.mjs';
import './query-composite-boundaries.mjs';
for (const item of cases) test(item.id, async () => {
  if (item.id === 'C19-sibling-source-reference-is-unavailable') {
    assert.throws(() => setup(item.options), error => error.code === 'REFERENCE_NOT_FOUND'); return;
  }
  let f;
  try { f = setup(item.options); await item.run(f); } finally { await f?.close(); }
});
for (const item of staticCases) test(item.id, item.run);
