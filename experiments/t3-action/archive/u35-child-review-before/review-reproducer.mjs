import { ActionProbe } from '/Users/minholim/dev/minh/viewstem/experiments/t3-action/action-probe.mjs';
import { StateProbe } from '/Users/minholim/dev/minh/viewstem/experiments/t3-state/state-probe.mjs';
import { queryFixture } from '/Users/minholim/dev/minh/viewstem/experiments/t3-state/ports-probe.mjs';
import { ProbeHost } from '/Users/minholim/dev/minh/viewstem/experiments/t2-query-races/query-probe.mjs';
import { FakeClock, ControlledTransport, flush } from '/Users/minholim/dev/minh/viewstem/experiments/t2-query-races/harness.mjs';
{
  const engine = new ActionProbe({ store: new StateProbe() }), owner = engine.owner();
  let unregisteredCalls = 0;
  engine.register([['parent', { native: async ({ invokeAction }) => {
    await invokeAction({ action: { steps: [{ kind: 'Action', spec: { native: () => { unregisteredCalls++; } } }] } });
  } }]]);
  const outcome = await engine.invoke(owner, 'parent').then(() => 'success', error => error.code);
  console.log(JSON.stringify({ case: 'nested-inline-native', outcome, unregisteredCalls }));
}
for (const forwarded of [true, false]) {
  const clock = new FakeClock(), trace = [], transport = new ControlledTransport(clock, trace), host = new ProbeHost(clock, transport, trace), target = host.mount('q');
  const q = queryFixture(target), ports = { q: { kind: 'Query', required: true } };
  const engine = new ActionProbe({ store: new StateProbe() }), owner = engine.owner();
  let childSignal, parentSignal, childResult;
  engine.register([
    ['child', { ports, native: async ({ inputs, signal }) => { childSignal = signal; await inputs.q.refresh(); } }],
    ['parent', { ports, native: ({ inputs, signal, invokeAction }) => {
      parentSignal = signal;
      childResult = invokeAction({ actionRef: 'child', inputs: forwarded ? inputs : { q } }).then(() => 'success', error => error.code);
    } }],
  ]);
  await engine.invoke(owner, 'parent', { q });
  const outcome = await childResult;
  const pendingAfterParentSettled = !!target.pending;
  transport.respond(1, 'initial'); await flush();
  console.log(JSON.stringify({ case: 'cancelled-pending-refresh', forwarded, outcome, childAborted: childSignal.aborted, parentAborted: parentSignal.aborted, pendingAfterParentSettled, requestsAfterInitialCompletes: transport.requests.length }));
  target.dispose();
}
