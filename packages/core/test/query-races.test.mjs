import test from 'node:test';
import { cases, setup } from './query-races-cases.mjs';
for (const item of cases) test(item.id, async () => {
  const f = setup(item.options);
  try { await item.run(f); }
  finally {
    for (const slot of f.host.slots.values()) slot.query.dispose();
    for (const row of f.transport.outstanding()) f.transport.respond(row.id, undefined, 'CANCELLED');
  }
});
