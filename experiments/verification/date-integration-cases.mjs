import { compileSchema, equal } from '../t1-values/schema-runtime.mjs';
import { createHttpProbe } from '../t2-http-boundary/http-probe.mjs';
import { CommitQueue, UrlProbeHost } from '../t2-url-races/url-probe.mjs';
import { memoryEndpoint, browserEndpoint } from '../t2-url-races/endpoints.mjs';

function check(condition, message = 'ASSERTION') { if (!condition) throw Error(message); }
function throws(run, expected) { try { run(); } catch (error) { check((error.code ?? error.message) === expected, `${error.code ?? error.message} !== ${expected}`); return; } throw Error(`Missing ${expected}`); }
const cases = [
  ['date', '2026-10-30', '2026-10-30'], ['time', '09:30', '09:30:00.000'],
  ['datetime', '2026-10-30T09:30:00+09:00', '2026-10-30T00:30:00.000Z'],
];

export async function runDateCases(base, environment = 'node') {
  const results = [];
  const test = async (id, run) => {
    try { await run(); results.push({ id, passed: true }); }
    catch (error) { results.push({ id, passed: false, error: { name: error.name, message: error.message } }); }
  };
  let sent = 0;
  const request = createHttpProbe({ authorize: () => true, transport: (...args) => { sent++; return fetch(...args); } });
  const postValue = (runtime, input) => request({ version: 1, datasource: { kind: 'Http', baseUrl: base }, inputs: { value: runtime.accept(input) },
    request: { method: 'POST', path: '/echo', body: { value: { '@path': '/ports/value' } } } });
  for (const [kind, input, canonical] of cases) {
    const schema = { 'x-viewstem-type': kind }, runtime = compileSchema(schema);
    await test(`http/${kind}/body-roundtrip`, async () => {
      const response = await postValue(runtime, input);
      check(response.body.body === JSON.stringify({ value: canonical }));
      check(runtime.accept(JSON.parse(response.body.body).value) === canonical);
    });
    await test(`http/${kind}/params-roundtrip`, async () => {
      const value = runtime.accept(input);
      const response = await request({ version: 1, datasource: { kind: 'Http', baseUrl: base }, inputs: { value },
        request: { method: 'GET', path: '/echo', params: { value: { '@path': '/ports/value' } } } });
      check(equal(response.body.query, [['value', canonical]]));
      check(runtime.accept(response.body.query[0][1]) === canonical);
    });
    for (const operation of ['write', 'restore', 'invalid', 'equivalent', 'baseline', 'nullable', 'no-schema-guess']) await test(`url/${kind}/${operation}`, async () => {
      const endpoint = (environment === 'browser' ? browserEndpoint : memoryEndpoint)('/date?foreign=%2Fraw%20value#keep');
      const queue = new CommitQueue(endpoint), host = new UrlProbeHost(queue, { compileSchema });
      const binding = { name: 'value', type: 'string', key: 'p.value', baseline: input, history: 'push', schema };
      if (operation === 'nullable') { binding.nullable = true; binding.schema = { anyOf: [schema, { type: 'null' }] }; }
      if (operation === 'no-schema-guess') { delete binding.schema; }
      let connection;
      try {
        if (operation === 'restore') endpoint.commit(`${base}/date?foreign=%2Fraw%20value&p.value=${encodeURIComponent(JSON.stringify(input))}#keep`, 'replace');
        if (operation === 'invalid') endpoint.commit(`${base}/date?p.value=${encodeURIComponent(JSON.stringify('invalid-date'))}`, 'replace');
        connection = host.connect('date', [binding]);
        if (operation === 'restore' || operation === 'baseline') check(connection.values.value === canonical);
        else if (operation === 'invalid') {
          check(connection.values.value === canonical); check(connection.diagnostics.length === 1);
          check(connection.diagnostics[0].code === 'TYPE_MISMATCH');
          const jobs = queue.jobs.length;
          throws(() => connection.write({ value: 'invalid-date' }), 'TYPE_MISMATCH');
          check(connection.values.value === canonical && queue.jobs.length === jobs);
        } else {
          const value = operation === 'nullable' ? null : input;
          const pending = connection.write({ value }); await queue.release(queue.jobs.at(-1).id); await pending;
          const expected = operation === 'nullable' ? null : operation === 'no-schema-guess' ? input : canonical;
          check(JSON.parse(new URL(endpoint.read()).searchParams.get('p.value')) === expected);
          check(endpoint.read().includes('foreign=%2Fraw%20value') && endpoint.read().endsWith('#keep'));
          if (operation === 'equivalent') {
            const commits = endpoint.commits.length;
            const repeated = connection.write({ value: canonical }); await queue.release(queue.jobs.at(-1).id); await repeated;
            check(endpoint.commits.length === commits, 'Equivalent canonical value created browser history');
          }
          connection.dispose();
          connection = host.connect('date', [binding]); check(connection.values.value === expected);
        }
      } finally { connection?.dispose(); endpoint.dispose(); }
      check(host.owners.size === 0 && host.stores.size === 0 && endpoint.listeners.size === 0);
    });
  }
  await test('http/invalid-before-send', async () => {
    const count = sent;
    try { await postValue(compileSchema({ 'x-viewstem-type': 'date' }), '2026-04-31'); throw Error('Accepted invalid day'); }
    catch (error) { check(error.message !== 'Accepted invalid day'); }
    check(sent === count);
  });
  await test('http/invalid-response-revalidated', async () => {
    const response = await request({ version: 1, datasource: { kind: 'Http', baseUrl: base }, request: { method: 'GET', path: '/invalid-date' } });
    let rejected = false; try { compileSchema({ 'x-viewstem-type': 'date' }).accept(response.body); } catch { rejected = true; }
    check(rejected);
    check(compileSchema({ type: 'string' }).accept(response.body) === '2026-04-31');
  });
  await test('url/declaration-before-missing-baseline', () => {
    const endpoint = memoryEndpoint('/date'), host = new UrlProbeHost(new CommitQueue(endpoint), { compileSchema });
    throws(() => host.connect('date', [{ name: 'value', type: 'string', schema: { type: 'string', 'x-viewstem-type': 'date' } }]), 'INVALID_DEFINITION');
    check(host.stores.size === 0 && endpoint.listeners.size === 0); endpoint.dispose();
  });
  return { results, sent };
}
