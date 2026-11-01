import { parentPort, workerData } from 'node:worker_threads';
// Import only the engine being measured; imports belong to startup time.
const engine = workerData.engine === 'marc' ? (await import('@marcbachmann/cel-js')).evaluate
  : workerData.engine === 'buf' ? (await import('@bufbuild/cel')).run
  : new (await import('ajv/dist/2020.js')).default({ strict: false });

// A real worker termination experiment, not Promise.race around synchronous JS.
parentPort.postMessage({kind:'ready'});
parentPort.once('message',()=>{
  parentPort.postMessage({kind:'started'});
  try {
    if (workerData.engine === 'schema-regex') {
      engine.compile({type:'string',pattern:'^(a+)+$'})('a'.repeat(2000)+'!');
    } else {
      const xs=Array.from({length:20000},(_,i)=>i);
      engine('xs.all(x,xs.all(y,x+y>=0.0))',{xs});
    }
    parentPort.postMessage({kind:'completed'});
  } catch(e) { parentPort.postMessage({kind:'error',message:e.message.slice(0,200)}); }
});
