import test from 'node:test';
import { cases, setup } from './query-polling-cases.mjs';
for (const item of cases) test(item.id, async () => {
  const f = setup(item.options);
  try { await item.run(f); } finally { await f.close(); }
});
