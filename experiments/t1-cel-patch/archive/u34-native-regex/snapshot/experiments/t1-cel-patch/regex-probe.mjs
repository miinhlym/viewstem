import { Worker } from 'node:worker_threads';
import { preparePatch } from './prepare.mjs';
import { report } from '../verification/report.mjs';

export async function boundedRegex(entry, patched) {
  const worker = new Worker(new URL('./regex-worker.mjs', import.meta.url), { workerData: { entry, patched } });
  return new Promise((resolve, reject) => {
    let timer = setTimeout(async () => { await worker.terminate(); reject(Error('WORKER_STARTUP_TIMEOUT')); }, 30000);
    worker.on('error', error => { clearTimeout(timer); reject(error); });
    worker.on('message', async message => {
      clearTimeout(timer);
      if (message.ready) timer = setTimeout(async () => { await worker.terminate(); resolve({ terminated: true, deadlineMs: 300 }); }, 300);
      else { await worker.terminate(); resolve(message); }
    });
  });
}
const prepared = await preparePatch();
const upstream = await boundedRegex(new URL('../t1-values/node_modules/@marcbachmann/cel-js/lib/index.js', import.meta.url).href, false);
const patched = await boundedRegex(prepared.entry.href, true);
await report({ base: import.meta.url, name: process.argv[2] ?? 'regex-native-observation.json',
  scope: 'Controlled worker observation of native RegExp; deadline termination is a gap, not conformance success',
  results: [{ id: 'upstream-regex-control', passed: upstream.terminated === true, observation: upstream },
    { id: 'patched-regex-must-complete', passed: patched.completed === true && patched.value === false, observation: patched }],
  sources: ['regex-probe.mjs', 'regex-worker.mjs', 'prepare.mjs', 'cel-js-8.0.0.patch', 'upstream-sha256.json', 'patched-sha256.json', '../verification/report.mjs'],
  extra: { patchSha256: prepared.patchSha256 } });
