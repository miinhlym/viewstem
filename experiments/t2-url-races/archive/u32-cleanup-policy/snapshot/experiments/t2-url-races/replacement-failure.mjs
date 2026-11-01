// Observation probe for an unresolved lifecycle policy, not an acceptance test.
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
  replacementCount: host.replacements.size, url: relative(endpoint.read()), newConnectionCreated: host.connections.length > 1 };
for (const connection of host.connections) connection.dispose(); endpoint.dispose();
const sourceSha256 = {};
for (const name of ['replacement-failure.mjs', 'url-probe.mjs', 'endpoints.mjs', 'package.json']) {
  sourceSha256[name] = createHash('sha256').update(await readFile(new URL(name, import.meta.url))).digest('hex');
}
const report = { generatedAt: new Date().toISOString(), runtime: process.version, platform: process.platform,
  status: 'needs-contract-decision', contractVerdict: 'not-assessed',
  scope: 'Memory endpoint; injected cleanup write failure; private connection model, no View/renderer',
  question: 'If owned URL-key cleanup fails during a full View replacement, retain the old View or finish replacing and report a URL sync error?',
  sourceSha256, ordinaryFailure, replacementFailure, trace: queue.trace };
await writeFile(new URL(`results/${process.argv[2] ?? 'replacement-failure-node24.json'}`, import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, ordinaryFailure, replacementFailure }));
