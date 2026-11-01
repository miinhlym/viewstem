// U33 decision regression; the pre-decision observation is preserved in archive.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CommitQueue, UrlProbeHost, relative } from './url-probe.mjs';
import { memoryEndpoint } from './endpoints.mjs';

const endpoint = memoryEndpoint('/view?foreign=keep#section');
const queue = new CommitQueue(endpoint), host = new UrlProbeHost(queue);
const binding = baseline => [{ name: 'filter', type: 'string', baseline }];
const old = host.connect('screen', binding('old-baseline'));
const initial = old.write({ filter: 'old-filter' }); await queue.release(queue.jobs.at(-1).id); await initial;
const changed = old.write({ filter: 'new-filter' }); await queue.release(queue.jobs.at(-1).id, { failure: true });
const ordinaryFailure = { result: await changed, connectionAlive: old.alive,
  state: structuredClone(old.values), url: relative(endpoint.read()), diagnostics: structuredClone(old.diagnostics) };
const transition = host.replace(old, 'screen', binding('next-baseline'));
const outcome = transition.completion.then(() => ({ status: 'fulfilled' }), error => ({ status: 'rejected', code: error.code }));
await queue.release(transition.jobId, { failure: true });
const replacementFailure = { outcome: await outcome, oldConnectionAlive: old.alive,
  activeStoreCount: host.stores.size, activeSubscriptionCount: endpoint.listeners.size,
  replacementCount: host.replacements.size, url: relative(endpoint.read()), newConnectionCreated: host.connections.length > 1,
  newState: structuredClone(host.stores.get('screen')?.values), diagnostics: structuredClone(host.stores.get('screen')?.diagnostics) };
assert.equal(ordinaryFailure.connectionAlive, true);
assert.deepEqual(ordinaryFailure.state, { filter: 'new-filter' });
assert.equal(replacementFailure.outcome.status, 'fulfilled');
assert.equal(replacementFailure.activeStoreCount, 1); assert.equal(replacementFailure.activeSubscriptionCount, 1);
assert.equal(replacementFailure.oldConnectionAlive, false); assert.equal(replacementFailure.replacementCount, 0);
assert.equal(replacementFailure.newConnectionCreated, true);
assert.deepEqual(replacementFailure.newState, { filter: 'next-baseline' });
assert.deepEqual(replacementFailure.diagnostics, [{ kind: 'replace-cleanup', code: 'URL_WRITE_FAILED', keys: ['p.filter'] }]);
assert.equal(replacementFailure.url, ordinaryFailure.url);
for (const connection of host.connections) connection.dispose(); endpoint.dispose();
const sourceSha256 = {};
for (const name of ['replacement-failure.mjs', 'url-probe.mjs', 'endpoints.mjs', 'package.json']) {
  sourceSha256[name] = createHash('sha256').update(await readFile(new URL(name, import.meta.url))).digest('hex');
}
const report = { generatedAt: new Date().toISOString(), runtime: process.version, platform: process.platform,
  status: 'passed', contractVerdict: 'U33 replacement completes and reports URL cleanup failure',
  scope: 'Memory endpoint; injected cleanup write failure; private connection model, no View/renderer',
  sourceSha256, ordinaryFailure, replacementFailure, trace: queue.trace };
await writeFile(new URL(`results/${process.argv[2] ?? 'replacement-failure-node24.json'}`, import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, ordinaryFailure, replacementFailure }));
