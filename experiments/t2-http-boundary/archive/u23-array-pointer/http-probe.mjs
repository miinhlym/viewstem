import { prepareHeaders } from './header-profile.mjs';

// Independent protocol/lifetime experiment. Expression support is intentionally
// limited to fixture @path and concat; this is not the production interpreter.
const messages = {
  INVALID_DEFINITION: 'Invalid HTTP definition', REFERENCE_NOT_FOUND: 'HTTP reference unavailable',
  INVALID_EXPRESSION: 'Invalid HTTP expression',
  HTTP_ERROR: 'HTTP execution failed', TIMEOUT: 'HTTP execution timed out',
  CANCELLED: 'HTTP execution cancelled', EXECUTION_BLOCKED: 'HTTP execution blocked',
};
const failure = code => ({ code, message: messages[code] });
const invalid = () => { throw failure('INVALID_DEFINITION'); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function publicErrorCode(error) {
  try {
    if (error === null || (typeof error !== 'object' && typeof error !== 'function')) return 'HTTP_ERROR';
    // Do not invoke accessors, walk prototypes, or coerce opaque values.
    // Even descriptor inspection can throw for a Proxy; keep it inside the guard.
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    const code = descriptor?.value;
    if (typeof code === 'string' && own(messages, code)) return code;
  } catch {
    // Never retain the original exception or a failure of the sanitizer itself.
  }
  return 'HTTP_ERROR';
}

export function joinAddress(baseUrl, path) {
  let base;
  try { base = new URL(baseUrl); } catch { invalid(); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) invalid();
  if (typeof path !== 'string' || /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/.test(path)
      || /[?#\\\u0000-\u0020]/.test(path)) invalid();
  // Reject decoded traversal/separators rather than relying on URL normalization.
  for (const part of path.split('/')) {
    let decoded;
    try { decoded = decodeURIComponent(part); } catch { invalid(); }
    if (decoded === '..' || /[\/\\]/.test(decoded)) invalid();
  }
  return new URL(`${base.href.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
}
function params(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const result = new URLSearchParams();
  for (const [key, item] of Object.entries(value)) {
    if (item === null) continue;
    for (const entry of Array.isArray(item) ? item : [item]) {
      if (!['string', 'number', 'boolean'].includes(typeof entry)
          || (typeof entry === 'number' && !Number.isFinite(entry))) invalid();
      result.append(key, String(entry));
    }
  }
  return result;
}
function jsonValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { for (const item of value) jsonValue(item); return; }
  if (typeof value === 'object' && value !== null) { for (const item of Object.values(value)) jsonValue(item); return; }
  invalid();
}
const mediaType = value => (value ?? '').split(';')[0].trim().toLowerCase();
const jsonType = type => type === 'application/json' || /^application\/[\w.+-]+\+json$/.test(type);
function encodeBody(template, headers) {
  if (!own(template, 'body')) return undefined;
  if (['GET', 'HEAD'].includes(template.method)) invalid();
  const value = template.body;
  if (!own(headers, 'content-type')) headers['content-type'] = typeof value === 'string' ? 'text/plain;charset=UTF-8' : 'application/json';
  const type = mediaType(headers['content-type']);
  if (jsonType(type)) { jsonValue(value); return JSON.stringify(value); }
  if (type === 'application/x-www-form-urlencoded') return params(value).toString();
  if (type.startsWith('text/') && typeof value === 'string') return value;
  invalid();
}
function headerNames(declaration) {
  if (declaration === undefined) return;
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) invalid();
  prepareHeaders(Object.fromEntries(Object.keys(declaration).map(name => [name, null])));
}
const systemClock = { now: () => performance.now(), set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) };

export function createHttpProbe({
  transport = fetch, clock = systemClock, requestTimeoutMs = 30000,
  caller, authorize = () => false, resolveSecret = async () => { throw failure('EXECUTION_BLOCKED'); },
} = {}) {
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) invalid();
  return async function executeRequest(originalPlan, { signal } = {}) {
    let plan;
    try { plan = structuredClone(originalPlan); } catch { throw failure('INVALID_DEFINITION'); }
    const controller = new AbortController();
    let timer;
    let terminal;
    let rejectStopped;
    const stopped = new Promise((_, reject) => { rejectStopped = reject; });
    function stop(code) {
      if (terminal) return;
      terminal = code;
      controller.abort();
      rejectStopped(failure(code));
    }
    const cancelled = () => stop('CANCELLED');
    const deadline = clock.now() + requestTimeoutMs;
    const arm = () => {
      const remaining = deadline - clock.now();
      if (remaining <= 0) stop('TIMEOUT');
      else timer = clock.set(arm, Math.min(remaining, 2147483647));
    };
    function check() {
      if (!terminal && clock.now() >= deadline) stop('TIMEOUT');
      if (terminal) throw failure(terminal);
    }
    if (signal?.aborted) cancelled();
    else signal?.addEventListener('abort', cancelled, { once: true });
    arm();
    async function evaluate(value, scope) {
      check();
      if (Array.isArray(value)) {
        const result = [];
        for (const item of value) result.push(await evaluate(item, scope));
        return result;
      }
      if (value === null || typeof value !== 'object') return value;
      if (own(value, '@path')) {
        const path = value['@path'];
        if (typeof path !== 'string' || !path.startsWith('/') || /~(?:[^01]|$)/.test(path)) throw failure('INVALID_EXPRESSION');
        const keys = path.split('/').slice(1).map(key => key.replace(/~1/g, '/').replace(/~0/g, '~'));
        if (keys[0] === 'secrets') {
          if (!scope.readSecret || keys.length !== 2) throw failure('REFERENCE_NOT_FOUND');
          const result = await scope.readSecret(keys[1]);
          check();
          return result;
        }
        let result = scope.values;
        for (const key of keys) {
          if (result === null || typeof result !== 'object' || !own(result, key)) throw failure('REFERENCE_NOT_FOUND');
          result = result[key];
        }
        return result;
      }
      if (own(value, '@call')) {
        if (value['@call'] !== 'concat' || !Array.isArray(value.args)) invalid();
        const args = await evaluate(value.args, scope);
        if (!args.every(item => typeof item === 'string')) invalid();
        return args.join('');
      }
      const result = Object.create(null);
      for (const [key, item] of Object.entries(value)) result[key] = await evaluate(item, scope);
      return result;
    }
    async function send(request, defaults, context) {
      check();
      if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method)) invalid();
      const url = joinAddress(request.baseUrl ?? defaults.baseUrl, request.path);
      const destination = url.href;
      if (!await authorize({ caller, destination })) throw failure('EXECUTION_BLOCKED');
      check();
      // Only a request with an authorized destination receives this capability.
      // Recursive expressions retain the same scope; token extraction gets none.
      const scope = {
        values: context,
        readSecret: alias => {
          if (!own(plan.datasource.secrets ?? {}, alias)) throw failure('REFERENCE_NOT_FOUND');
          return resolveSecret(plan.datasource.secrets[alias], { caller, destination, signal: controller.signal });
        },
      };
      const headers = prepareHeaders(await evaluate(defaults.headers, scope), await evaluate(request.headers, scope));
      const query = Object.assign(Object.create(null), await evaluate(defaults.params, scope), await evaluate(request.params, scope));
      url.search = params(query).toString();
      const evaluated = { method: request.method };
      if (own(request, 'body')) evaluated.body = await evaluate(request.body, scope);
      const body = encodeBody(evaluated, headers);
      if (!await authorize({ caller, destination: url.href })) throw failure('EXECUTION_BLOCKED');
      check();
      const response = await transport(url, { method: request.method, headers, body,
        signal: controller.signal, redirect: 'manual', credentials: 'omit' });
      check();
      if (response.status < 200 || response.status > 299) throw failure('HTTP_ERROR');
      let resultBody = null;
      if (request.method !== 'HEAD' && ![204, 205].includes(response.status)) {
        const type = mediaType(response.headers.get('content-type'));
        if (jsonType(type)) {
          try { resultBody = await response.json(); jsonValue(resultBody); }
          catch { throw failure('HTTP_ERROR'); }
        } else if (type.startsWith('text/')) resultBody = await response.text();
        else throw failure('HTTP_ERROR');
      }
      check();
      return { status: response.status, headers: Object.fromEntries(response.headers), body: resultBody };
    }
    async function work() {
      check();
      if (plan.version !== 1 || plan.datasource?.kind !== 'Http' || !plan.request) invalid();
      headerNames(plan.datasource.headers);
      headerNames(plan.request.headers);
      headerNames(plan.datasource.auth?.request?.headers);
      const context = { ports: plan.inputs };
      if (plan.datasource.auth) {
        const auth = plan.datasource.auth;
        if (auth.kind !== 'Login') invalid();
        const response = await send(auth.request, { baseUrl: plan.datasource.baseUrl }, context);
        const token = await evaluate(auth.token, { values: { response } });
        if (typeof token !== 'string' || token.length === 0 || /[\u0000-\u0020\u007f]/.test(token)) throw failure('HTTP_ERROR');
        context.auth = { token };
      }
      return await send(plan.request, plan.datasource, context);
    }
    try { return await Promise.race([work(), stopped]); }
    catch (error) {
      const code = terminal ?? publicErrorCode(error);
      throw failure(code);
    } finally {
      clock.clear(timer);
      signal?.removeEventListener('abort', cancelled);
      controller.abort();
    }
  };
}
