const base = 'http://fixture.invalid/v1';
const ref = path => ({ '@path': path });
const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const plainPlan = () => ({ version: 1, datasource: { kind: 'Http', baseUrl: base }, inputs: {}, request: { method: 'GET', path: '/data' } });
function login(plan) {
  plan.datasource.auth = { kind: 'Login', request: { method: 'POST', path: '/login' }, token: ref('/response/body/token') };
}
function set(object, keys, value) {
  for (const key of keys.slice(0, -1)) object = object[key];
  object[keys.at(-1)] = value;
}
const fields = [
  ['datasource.baseUrl', base], ['datasource.headers', { 'X-Probe': 'field-value' }], ['datasource.params', { q: ['a', 'b'] }],
  ['request.baseUrl', base], ['request.method', 'POST'], ['request.path', '/data'],
  ['request.headers', { 'X-Probe': 'field-value' }], ['request.params', { q: ['a', 'b'] }], ['request.body', { item: 'field-value' }],
  ['datasource.auth.request', { method: 'POST', path: '/login', body: { '@path': 'literal-data' } }],
  ['datasource.auth.request.baseUrl', base], ['datasource.auth.request.method', 'POST'], ['datasource.auth.request.path', '/login'],
  ['datasource.auth.request.headers', { 'X-Probe': 'field-value' }], ['datasource.auth.request.params', { q: ['a', 'b'] }],
  ['datasource.auth.request.body', { item: 'field-value' }], ['datasource.auth.token', 'fixture-token'],
];
export const coverage = fields.map(([field]) => field);
const cases = [];
const add = (id, setup, verify, error, requests = 0) => cases.push({ id, setup, verify, error, requests });
const body = (plan, value) => { plan.request = { method: 'POST', path: '/data', body: value }; };
for (const [field, value] of fields) {
  const setup = p => {
    if (field.includes('.auth.')) login(p);
    p.inputs.value = value;
    if (field === 'request.body') p.request.method = 'POST';
    set(p, field.split('.'), field === 'datasource.auth.token' ? ref('/response/body/token') : ref('/ports/value'));
  };
  add(`field/${field}`, setup, f => {
    const index = field.includes('.auth.request') ? 0 : f.calls.length - 1;
    const call = f.calls[index];
    equal(f.calls.length, field.includes('.auth.') ? 2 : 1);
    if (field.endsWith('baseUrl') || field.endsWith('path')) equal(call.path, field.includes('.auth.request') ? '/v1/login' : '/v1/data');
    if (field.endsWith('method')) equal(call.method, 'POST');
    if (field.endsWith('headers')) equal(call.headers['x-probe'], 'field-value');
    if (field.endsWith('params')) equal(call.query, [['q', 'a'], ['q', 'b']]);
    if (field.endsWith('body')) equal(JSON.parse(call.body), { item: 'field-value' });
    if (field === 'datasource.auth.request') equal(JSON.parse(call.body), { '@path': 'literal-data' });
  });
  add(`shape/${field}`, p => {
    setup(p); set(p, field.split('.'), { '@path': '/ports/value', extra: 'must-not-be-ignored' });
  }, null, 'INVALID_EXPRESSION');
}
for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
  add(`method/${method}`, p => { p.inputs.method = method; p.request.method = ref('/ports/method'); }, f => {
    equal(f.calls[0].method, method); if (method === 'HEAD') equal(f.result.body, null);
  });
}
for (const method of ['get', 'TRACE', '', null, 7, {}]) {
  add(`method-invalid/${JSON.stringify(method)}`, p => { p.inputs.method = method; p.request.method = ref('/ports/method'); }, null, 'INVALID_DEFINITION');
}
for (const method of ['GET', 'HEAD']) {
  add(`method-body/${method}`, p => { p.inputs.method = method; p.request.method = ref('/ports/method'); p.request.body = 'body'; }, null, 'INVALID_DEFINITION');
}
for (const [name, value] of [['null', null], ['number', 1], ['object', { toString: base }], ['array', [base]],
  ['relative', '/v1'], ['protocol', 'file:///fixture'], ['userinfo', 'http://user:pass@fixture.invalid/v1'],
  ['query', base + '?q=1'], ['fragment', base + '#x']]) {
  add(`base-invalid/${name}`, p => { p.inputs.value = value; p.datasource.baseUrl = ref('/ports/value'); }, null, 'INVALID_DEFINITION');
}
add('base-override-unused-fallback', p => { p.datasource.baseUrl = ref('/secrets/unused'); p.inputs.url = base; p.request.baseUrl = ref('/ports/url'); }, f => equal(f.secrets.length, 0));
add('base-null-is-not-fallback', p => { p.request.baseUrl = null; }, null, 'INVALID_DEFINITION');
add('base-missing-is-not-fallback', p => { p.inputs.config = {}; p.request.baseUrl = ref('/ports/config/url'); }, null, 'INPUT_NOT_READY');
add('base-cross-origin-denied', p => { p.inputs.url = 'http://denied.invalid/v1'; p.datasource.baseUrl = ref('/ports/url'); }, null, 'EXECUTION_BLOCKED');
add('login-base-override', p => { login(p); p.inputs.url = base + '/auth'; p.datasource.auth.request.baseUrl = ref('/ports/url'); }, f => equal(f.calls[0].path, '/v1/auth/login'));
add('login-base-fallback', p => { login(p); p.inputs.url = base; p.datasource.baseUrl = ref('/ports/url'); }, f => equal(f.calls.map(c => c.path), ['/v1/login', '/v1/data']));
for (const field of ['baseUrl', 'method', 'path']) {
  add(`address-secret-denial/${field}`, p => { p.datasource.secrets = { x: 'ref' }; p.request[field] = ref('/secrets/x'); }, null, 'REFERENCE_NOT_FOUND');
}
const keys = ['', 'a/b', '~', '~1', '~~/', '01', 'length', '__proto__', 'constructor', 'toString', '한글', '😀'];
for (const [i, key] of keys.entries()) {
  add(`pointer-key/${i}`, p => {
    p.inputs.value = Object.fromEntries([[key, i]]);
    body(p, ref('/ports/value/' + key.replaceAll('~', '~0').replaceAll('/', '~1')));
  }, f => equal(JSON.parse(f.calls[0].body), i));
}
for (const value of [null, false, 0, '', ['a', null], { a: 1 }]) {
  add(`preserve-type/${JSON.stringify(value)}`, p => { p.inputs.value = value; body(p, { result: ref('/ports/value') }); }, f => equal(JSON.parse(f.calls[0].body), { result: value }));
}
for (const path of ['', 'ports/x', '#/ports/x', '/ports/~', '/ports/~2', 1, null]) {
  add(`pointer-syntax/${JSON.stringify(path)}`, p => { body(p, ref(path)); }, null, 'INVALID_EXPRESSION');
}
for (const index of ['length', '01', '-1', '1.0', '1e0', '+1', '-', '3', '9007199254740992']) {
  add(`array-index/${index}`, p => { p.inputs.value = ['a', false, null]; body(p, ref(`/ports/value/${index}`)); }, null, 'REFERENCE_NOT_FOUND');
}
add('array-existing-index', p => { p.inputs.value = ['a', false, null]; body(p, ref('/ports/value/1')); }, f => equal(JSON.parse(f.calls[0].body), false));
add('unregistered-port', p => body(p, ref('/ports/unknown')), null, 'REFERENCE_NOT_FOUND');
for (const key of ['absent', 'toString', 'constructor']) {
  add(`missing-property/${key}`, p => { p.inputs.value = {}; body(p, ref(`/ports/value/${key}`)); }, null, 'INPUT_NOT_READY');
}
for (const [name, value] of [['null', null], ['string', 'abc'], ['number', 1], ['map', new Map([['x', 1]])], ['set', new Set([1])], ['date', new Date(0)]]) {
  add(`path-container/${name}`, p => { p.inputs.value = value; body(p, ref('/ports/value/x')); }, null, 'TYPE_MISMATCH');
}
for (const expression of [{ '@path': '/ports/value', '@call': 'concat', args: [] }, { '@unknown': 1 }, { '@call': 'unknown', args: [] },
  { '@call': 'concat', args: [], extra: true }, { '@call': 'concat' }, { '@call': 'formatString', args: {} }]) {
  add(`invalid-expression/${JSON.stringify(expression)}`, p => body(p, expression), null, 'INVALID_EXPRESSION');
}
add('recursive-arrays-and-objects', p => { p.inputs.value = 7; body(p, { list: [ref('/ports/value'), { x: ref('/ports/value') }] }); }, f => equal(JSON.parse(f.calls[0].body), { list: [7, { x: 7 }] }));
add('escape-once', p => body(p, { '@@path': '/secrets/x', '@@@tag': { '@@call': 'literal' }, path: 'ordinary', call: 'ordinary' }), f => equal(JSON.parse(f.calls[0].body), { '@path': '/secrets/x', '@@tag': { '@call': 'literal' }, path: 'ordinary', call: 'ordinary' }));
add('returned-expression-is-data', p => { p.inputs.value = { '@path': '/secrets/x', '@@key': 1 }; body(p, ref('/ports/value')); }, f => { equal(JSON.parse(f.calls[0].body), { '@path': '/secrets/x', '@@key': 1 }); equal(f.secrets.length, 0); });
add('input-snapshot-not-interpreted', p => { p.inputs.value = { '@call': 'unknown', args: [] }; body(p, ref('/ports/value')); }, f => equal(JSON.parse(f.calls[0].body)['@call'], 'unknown'));
for (const [name, value] of [['map', new Map([['@path', '/secrets/x']])], ['set', new Set([ref('/secrets/x')])], ['date', new Date(0)]]) {
  add(`native-body-no-silent-coercion/${name}`, p => { p.inputs.value = value; body(p, ref('/ports/value')); }, null, 'INVALID_DEFINITION');
}
add('cyclic-template', p => { const value = {}; value.self = value; body(p, value); }, null, 'INVALID_DEFINITION');
add('cyclic-referenced-data', p => { p.inputs.value = {}; p.inputs.value.self = p.inputs.value; body(p, ref('/ports/value')); }, null, 'INVALID_DEFINITION');
add('shared-acyclic-data', p => { const shared = { x: 1 }; body(p, [shared, shared]); }, f => equal(JSON.parse(f.calls[0].body), [{ x: 1 }, { x: 1 }]));
const fmt = value => ({ '@call': 'formatString', args: { value } });
add('format-path-scalar-types', p => { p.inputs = { s: 'a', n: 2, b: false, nil: null }; body(p, fmt('${/ports/s}:${/ports/n}:${/ports/b}:${/ports/nil}')); }, f => equal(f.calls[0].body, 'a:2:false:null'));
add('format-escape-and-returned-text', p => { p.inputs.text = '${/secrets/x}'; body(p, fmt('$${/ports/text}|${/ports/text}')); }, f => { equal(f.calls[0].body, '${/ports/text}|${/secrets/x}'); equal(f.secrets.length, 0); });
add('format-template-reference', p => { p.inputs.template = '${/ports/name}'; p.inputs.name = 'value'; body(p, { '@call': 'formatString', args: { value: ref('/ports/template') } }); }, f => equal(f.calls[0].body, 'value'));
add('format-unclosed', p => body(p, fmt('${/ports/x')), null, 'INVALID_EXPRESSION');
add('format-syntax-before-login', p => { login(p); body(p, fmt('${/ports/x')); }, null, 'INVALID_EXPRESSION');
add('format-relative', p => body(p, fmt('${ports/x}')), null, 'INVALID_EXPRESSION');
add('format-missing', p => { p.inputs.value = {}; body(p, fmt('${/ports/value/x}')); }, null, 'INPUT_NOT_READY');
add('format-object', p => { p.inputs.value = {}; body(p, fmt('${/ports/value}')); }, null, 'TYPE_MISMATCH');
add('concat-nested-reference', p => { p.inputs.value = 'v'; body(p, { '@call': 'concat', args: ['a', ref('/ports/value')] }); }, f => equal(f.calls[0].body, 'av'));
add('concat-no-coercion', p => { p.inputs.value = 7; body(p, { '@call': 'concat', args: [ref('/ports/value')] }); }, null, 'TYPE_MISMATCH');
for (const root of ['ports', 'secrets', 'auth', 'states']) {
  add(`token-scope/${root}`, p => { login(p); p.inputs.value = 'token'; p.datasource.auth.token = fmt('${/' + root + '/value}'); }, null, 'REFERENCE_NOT_FOUND', 1);
}
add('token-format-response', p => { login(p); p.datasource.auth.token = fmt('${/response/body/token}'); }, f => equal(f.calls.length, 2));
add('login-no-auth-context', p => { login(p); p.datasource.auth.request.body = ref('/auth/token'); }, null, 'REFERENCE_NOT_FOUND');
add('data-no-response-context', p => body(p, ref('/response/body/token')), null, 'REFERENCE_NOT_FOUND');
add('data-secret-authorized', p => { p.datasource.secrets = { x: 'ref' }; body(p, ref('/secrets/x')); }, f => { equal(f.calls[0].body, 'fixture-secret'); equal(f.secrets[0].destination, base + '/data'); });
add('login-request-data-not-reexecuted', p => { login(p); p.inputs.login = { method: 'POST', path: ref('/ports/path') }; p.inputs.path = '/login'; p.datasource.auth.request = ref('/ports/login'); }, null, 'INVALID_DEFINITION');
add('static-definition-not-expression', p => { p.datasource.kind = ref('/ports/kind'); p.inputs.kind = 'Http'; }, null, 'INVALID_DEFINITION');
for (const headers of [{ Host: 'fixture' }, { HOST: null }, { 'Sec-Future': 'fixture' }, { Accept: 'a', accept: null }]) {
  add(`resolved-header-guard/${JSON.stringify(headers)}`, p => { p.inputs.headers = headers; p.request.headers = ref('/ports/headers'); }, null, 'INVALID_DEFINITION');
}

export async function runPathAudit(createHttpProbe) {
  const results = [];
  for (const test of cases) {
    const calls = [], secrets = [], authorities = [];
    const plan = plainPlan();
    let result, error, failure;
    try {
      test.setup(plan);
      const execute = createHttpProbe({ caller: 'trusted-fixture',
        authorize: ({ caller, destination }) => {
          equal(caller, 'trusted-fixture'); authorities.push(destination);
          return new URL(destination).origin === 'http://fixture.invalid' && new URL(destination).pathname.startsWith('/v1/');
        },
        resolveSecret: async (reference, context) => { secrets.push({ reference, ...context }); return 'fixture-secret'; },
        transport: async (url, options) => {
          const call = { path: url.pathname, method: options.method, headers: { ...options.headers }, body: options.body, query: [...url.searchParams] };
          calls.push(call);
          return new Response(JSON.stringify(url.pathname.endsWith('/login') ? { token: 'fixture-token' } : { ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        },
      });
      try { result = await execute(plan); } catch (caught) { error = caught; }
      if (test.error) {
        equal(error?.code, test.error); equal(calls.length, test.requests);
        equal(Object.keys(error).sort(), ['code', 'message']);
      } else { equal(error, undefined); await test.verify?.({ calls, secrets, authorities, result }); }
    } catch (caught) { failure = caught.message ?? String(caught); }
    results.push({ id: test.id, passed: !failure, requests: calls.length, secretReads: secrets.length, ...(failure ? { failure, actualCode: error?.code } : {}) });
  }
  return { coverage, results };
}
