import { parentPort, workerData } from 'node:worker_threads';
const { Environment } = await import(workerData.entry);
const environment = new Environment({ unlistedVariablesAreDyn: true, ...(workerData.patched ? { limits: { maxEvaluationCost: 100000 } } : {}) });
parentPort.postMessage({ ready: true });
try { parentPort.postMessage({ completed: true, value: environment.evaluate('s.matches(p)', { s: 'a'.repeat(35) + '!', p: '^(a+)+$' }) }); }
catch (error) { parentPort.postMessage({ completed: true, error: { code: error.code, message: error.message } }); }
