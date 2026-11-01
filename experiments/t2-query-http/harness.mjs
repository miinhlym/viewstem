import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ProbeHost } from '../t2-query-races/query-probe.mjs';
import { FakeClock, deferred, flush, observe } from '../t2-query-races/harness.mjs';
import { createHttpProbe } from '../t2-http-boundary/http-probe.mjs';

export { flush, observe };
const ref = path => ({ '@path': path });
export const secretMarker = 'integration-fixture-secret';
export const privateMarker = 'integration-private-login-field';
export const tokenMarker = 'integration-fixture-token-';
export const input = term => ({ term });

async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Fixture timeout: ${label}`)), 5000);
    })]);
  } finally { clearTimeout(timer); }
}

// This bridge only adapts the two existing experiments' private harness shapes.
// One direct HTTP source exposes response.body, as required by the Query contract.
export async function setup(options = {}, mutation = {}) {
  const clock = new FakeClock();
  const trace = [], timeline = [], received = [], plans = [], arrivals = [];
  let nextEvent = 0, origin;
  const log = (kind, detail = {}) => timeline.push({ sequence: ++nextEvent, at: clock.now, kind, ...detail });
  const server = createServer(async (req, res) => {
    try {
      let text = '';
      for await (const chunk of req) text += chunk;
      const url = new URL(req.url, origin);
      const row = { id: received.length + 1, stage: url.pathname.endsWith('/login') ? 'login' : 'data',
        term: url.searchParams.get('term'), method: req.method, headers: req.headers, body: text, res, ended: false };
      received.push(row);
      log('received', { id: row.id, stage: row.stage, term: row.term });
      res.on('close', () => log('response-closed', { id: row.id, ended: row.ended }));
      for (const arrival of arrivals) if (received.length >= arrival.count) arrival.resolve();
    } catch (error) { res.destroy(error); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const baseUrl = `${origin}/v1`;
  const caller = Object.freeze({ id: 'fixture-caller' });
  const executeHttp = createHttpProbe({
    clock: { now: () => clock.now, set: (fn, ms) => clock.setTimeout(fn, ms), clear: id => clock.clearTimeout(id) },
    requestTimeoutMs: options.httpTimeout ?? 30_000,
    caller,
    authorize: context => context.caller === caller && new URL(context.destination).origin === origin
      && new URL(context.destination).pathname.startsWith('/v1/'),
    resolveSecret: async (_reference, context) => { log('resolve-secret', { destinationPath: new URL(context.destination).pathname }); return secretMarker; },
  });
  const transport = {
    execute(inputs, { signal, owner, generation }) {
      const id = plans.length + 1;
      const plan = {
        version: 1, requestId: `fixture-plan-${id}`, inputs,
        datasource: { kind: 'Http', baseUrl },
        request: { method: 'GET', path: '/data', params: { term: ref('/ports/term') } },
      };
      if (options.login) {
        plan.datasource.secrets = { password: 'fixture-reference' };
        plan.datasource.auth = {
          kind: 'Login',
          request: { method: 'POST', path: '/login', params: { term: ref('/ports/term') },
            body: { password: ref('/secrets/password'), term: ref('/ports/term') } },
          token: ref('/response/body/token'),
        };
        plan.request.headers = { Authorization: { '@call': 'concat', args: ['Bearer ', ref('/auth/token')] } };
      }
      options.changePlan?.(plan, id);
      const promise = executeHttp(plan, { signal }).then(response => response.body);
      const request = { id, owner, generation, inputs: structuredClone(inputs), signal, completion: { promise }, outcome: observe(promise) };
      plans.push(request);
      log('plan-start', { id, owner, generation, term: inputs.term });
      signal.addEventListener('abort', () => log('plan-abort', { id }), { once: true });
      promise.then(() => log('plan-success', { id }), error => log('plan-error', { id, code: error.code }));
      return request;
    },
  };
  const host = new ProbeHost(clock, transport, trace, mutation);
  const mount = (name = 'search', overrides = {}) => host.mount(name, {
    inputs: input('A'), timeoutMs: options.queryTimeout ?? 60_000, ...options.query, ...overrides,
  });
  const query = mount();
  const f = {
    clock, trace, timeline, received, plans, host, query, mount,
    async waitFor(count) {
      if (received.length >= count) return;
      await bounded(new Promise(resolve => arrivals.push({ count, resolve })), `HTTP request ${count}`);
    },
    async settle(id = plans.length) {
      await bounded(plans[id - 1].outcome.settled, `plan ${id}`);
      await flush();
    },
    async reply(id, config = {}) {
      const row = received[id - 1];
      assert.ok(row, `Unknown request ${id}`);
      log('release-response', { id, destroyed: row.res.destroyed });
      row.ended = true;
      if (!row.res.destroyed) {
        if (!row.res.headersSent) row.res.writeHead(config.status ?? 200, { 'content-type': config.type ?? 'application/json' });
        const value = Object.hasOwn(config, 'value') ? config.value : row.stage === 'login'
          ? { token: `${tokenMarker}${id}`, private: privateMarker } : { term: row.term, request: id };
        row.res.end(Object.hasOwn(config, 'raw') ? config.raw : JSON.stringify(value));
      }
      await flush();
    },
    headers(id) {
      const row = received[id - 1];
      row.res.writeHead(200, { 'content-type': 'application/json' }); row.res.flushHeaders();
      log('response-headers', { id });
    },
    async close() {
      for (const slot of host.slots.values()) slot.query.dispose();
      for (const row of received) row.res.destroy();
      await bounded(Promise.all(plans.map(plan => plan.outcome.settled)), 'cleanup');
      await flush();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      assert.equal(clock.tasks.size, 0, 'Leaked timer');
      for (const slot of host.slots.values()) assert.equal(slot.query.tickets.size, 0, 'Leaked refresh waiter');
    },
    evidence() {
      return { timeline, snapshots: trace,
        received: received.map(({ id, stage, term, method, ended }) => ({ id, stage, term, method, ended })),
        plans: plans.map(({ id, owner, generation, inputs, signal, outcome }) => ({
          id, owner, generation, inputs, aborted: signal.aborted, outcome: { status: outcome.status, code: outcome.code },
        })) };
    },
  };
  return f;
}
