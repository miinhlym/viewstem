import assert from 'node:assert/strict';
import { variants, isLogin, path, credentials, checkTransmission, checkSecretBoundary } from './harness.mjs';

export const cases = [];
const add = (id, contracts, run, options = {}) => cases.push({ id, contracts, run, options });
const blocked = (promise, code = 'EXECUTION_BLOCKED') => assert.rejects(promise,
  error => error.code === code && Object.keys(error).sort().join(',') === 'code,message');

for (const [index, variant] of variants.entries()) {
  add(`A${index + 1}/${variant}/wire-and-private-boundary`, ['H09', ...(variant === 'public' ? ['H01'] : ['H04'])], async f => {
    const plan = f.plan(variant), before = structuredClone(plan);
    const result = await f.execute(plan);
    checkTransmission(f, variant, result);
    checkSecretBoundary(result, plan);
    assert.deepEqual(plan, before);
    assert.deepEqual(result.body, { ok: true, resource: '/v1/data', term: 'current-input' });
  });

  add(`P1/${variant}/untrusted-caller-claim`, ['H03', 'H09'], async f => {
    const plan = f.plan(variant);
    // Serialized claims cannot replace the caller captured by the trusted host.
    plan.caller = { id: 'authorized-service-user' };
    plan.authorized = true; plan.permissions = ['*'];
    plan.inputs.caller = plan.caller; plan.inputs.destinationAllowed = true;
    await blocked(f.execute(plan));
    assert.equal(f.authorized.length, 1);
    assert.equal(f.authorized[0].caller, f.trustedCaller);
    assert.equal(f.authorized[0].caller.id, 'unauthorized-service-user');
    assert.equal(f.resolved.length, 0); assert.equal(f.received.length, 0);
  }, { wrongCaller: true });

  add(`P2/${variant}/destination-denied-before-secret`, ['H03', 'H09'], async f => {
    const plan = f.plan(variant);
    const request = isLogin(variant) ? plan.datasource.auth.request : plan.request;
    request.baseUrl = f.apiOrigin; request.path = '/attacker/collect';
    plan.destination = `${f.apiOrigin}/v1/data`; plan.destinationAllowed = true;
    await blocked(f.execute(plan));
    assert.equal(f.authorized.length, 1);
    assert.equal(new URL(f.authorized[0].destination).pathname, '/attacker/collect');
    assert.equal(f.resolved.length, 0); assert.equal(f.received.length, 0);
  });

  if (variant === 'public') continue;
  add(`P3/${variant}/resolver-enforces-caller`, ['H03', 'H04', 'H09'], async f => {
    const plan = f.plan(variant);
    plan.caller = { id: 'authorized-service-user' };
    await blocked(f.execute(plan));
    assert.equal(f.resolved.length, 1); assert.equal(f.received.length, 0);
    assert.equal(f.resolved[0].caller, f.trustedCaller);
  }, { wrongCaller: true, permissiveAuthorize: true });

  add(`P4/${variant}/resolver-enforces-destination`, ['H03', 'H04', 'H09'], async f => {
    const plan = f.plan(variant);
    const request = isLogin(variant) ? plan.datasource.auth.request : plan.request;
    request.baseUrl = f.apiOrigin; request.path = '/attacker/collect';
    await blocked(f.execute(plan));
    assert.equal(f.resolved.length, 1); assert.equal(f.received.length, 0);
    assert.equal(new URL(f.resolved[0].destination).pathname, '/attacker/collect');
  }, { permissiveAuthorize: true });

  add(`P5/${variant}/undeclared-secret-blocks-data`, ['H04', 'H09'], async f => {
    const plan = f.plan(variant);
    plan.datasource.secrets = {};
    await blocked(f.execute(plan), 'REFERENCE_NOT_FOUND');
    assert.equal(f.resolved.length, 0); assert.equal(f.received.length, 0);
  });

  add(`E1/${variant}/api-owned-credential-echo`, ['H04', 'H09', 'U21'], async f => {
    const plan = f.plan(variant); plan.request.path = '/echo';
    const result = await f.execute(plan);
    const expected = variant.startsWith('api-key-') ? credentials.key
      : variant === 'bearer' ? `Bearer ${credentials.token}`
      : variant === 'login-bearer' ? 'Bearer fixture-http-contract-login-token-1' : 'fixture-http-contract-login-token-1';
    assert.deepEqual(result.body, { echoed: expected });
    assert.deepEqual(Object.keys(result).sort(), ['body', 'headers', 'status']);
    assert.equal(JSON.stringify(result).includes('fixture-private-login-only'), false);
    // Echo contents deliberately remain in memory and are excluded from evidence.
  });
}

for (const variant of variants.filter(isLogin)) {
  for (const loginFailure of ['http', 'missing', 'non-string']) {
    add(`L1/${variant}/${loginFailure}-blocks-data`, ['H05', 'H09'], async f => {
      await blocked(f.execute(f.plan(variant)), loginFailure === 'missing' ? 'INPUT_NOT_READY' : 'HTTP_ERROR');
      assert.equal(f.received.length, 1);
      assert.equal(f.received[0].pathname.endsWith('/login'), true);
      assert.equal(f.resolved.length, 2);
    }, { loginFailure });
  }
  add(`L2/${variant}/concurrent-and-sequential-independent-login`, ['H06', 'H09'], async f => {
    const plan = f.plan(variant);
    const first = await Promise.all([f.execute(plan), f.execute(plan)]);
    const third = await f.execute(plan);
    for (const result of [...first, third]) checkSecretBoundary(result, plan);
    const logins = f.received.filter(row => row.pathname.endsWith('/login'));
    const data = f.received.filter(row => !row.pathname.endsWith('/login'));
    assert.equal(logins.length, 3); assert.equal(data.length, 3); assert.equal(f.resolved.length, 6);
    const tokens = data.map(row => row.headers.authorization ?? row.headers['x-access-token'] ?? row.params.access_token);
    assert.equal(new Set(tokens).size, 3);
    assert(tokens.every(token => token.startsWith(variant === 'login-bearer' ? 'Bearer fixture-' : 'fixture-')));
    for (const login of logins) {
      assert.equal(login.headers.authorization, undefined); assert.equal(login.headers['x-access-token'], undefined);
      assert.deepEqual(login.params, {}); assert.notEqual(login.headers.accept, 'application/json');
    }
  });
  add(`L3/${variant}/outer-unused-secret-not-inherited`, ['H06', 'H09'], async f => {
    const plan = f.plan(variant);
    plan.datasource.headers['X-Outer-Only'] = path('/secrets/notDeclared');
    plan.datasource.params = { ...plan.datasource.params, outerOnly: path('/secrets/notDeclared') };
    await blocked(f.execute(plan), 'REFERENCE_NOT_FOUND');
    assert.equal(f.received.length, 1); assert.equal(f.received[0].pathname.endsWith('/login'), true);
    assert.equal(f.received[0].headers['x-outer-only'], undefined);
    assert.deepEqual(f.received[0].params, {});
    assert.equal(f.resolved.length, 2);
  });
}

add('P6/final-query-destination-rechecked', ['H03'], async f => {
  const plan = f.plan('api-key-header'); plan.request.params.exfil = 'forbidden-route';
  await blocked(f.execute(plan));
  assert.equal(f.authorized.length, 2); assert.equal(f.resolved.length, 1); assert.equal(f.received.length, 0);
  assert.equal(new URL(f.authorized[0].destination).search, '');
  assert.equal(new URL(f.authorized[1].destination).searchParams.get('exfil'), 'forbidden-route');
}, { denyFinalQuery: true });

add('S1/current-resource-snapshot-without-database-reload', ['H01', 'H02'], async f => {
  let databaseReads = 0;
  const database = new Map([['resource-id', f.plan('public')]]);
  const loadForScreen = id => { databaseReads++; return structuredClone(database.get(id)); };
  const current = loadForScreen('resource-id');
  current.resourceLocation = { id: 'resource-id', source: 'current-screen' };
  current.request.path = '/current'; current.request.headers = { 'X-Current': path('/ports/revision') };
  current.inputs = { term: 'screen-term', revision: 'screen-revision' };
  // A separate persisted record changes after screen loading, including its URL.
  const replacement = f.plan('public'); replacement.datasource.baseUrl = 'http://127.0.0.1:1';
  replacement.request.path = '/database-replacement'; replacement.inputs.term = 'database-term';
  database.set('resource-id', replacement);
  const pending = f.execute(current);
  // executeRequest snapshots its supplied plan before asynchronous execution.
  current.request.path = '/mutated-after-dispatch'; current.inputs.term = 'late-screen-mutation';
  const result = await pending;
  assert.equal(databaseReads, 1);
  assert.equal(f.received.length, 1); assert.equal(f.received[0].pathname, '/v1/current');
  assert.equal(f.received[0].params.term, 'screen-term'); assert.equal(f.received[0].headers['x-current'], 'screen-revision');
  assert.deepEqual(result.body, { ok: true, resource: '/v1/current', term: 'screen-term' });
  assert.equal(database.get('resource-id').request.path, '/database-replacement');
});
