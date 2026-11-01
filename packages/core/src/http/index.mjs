import { prepareHeaders } from './headers.mjs';
import { createValueEvaluator, expressionKind, dataEntries, validateTemplate } from './expressions.mjs';

// HTTP execution plans are interpreted inside a per-call capability scope.
const messages = {
  INVALID_DEFINITION: 'Invalid HTTP definition', REFERENCE_NOT_FOUND: 'HTTP reference unavailable',
  INVALID_EXPRESSION: 'Invalid HTTP expression', TYPE_MISMATCH: 'Invalid HTTP value type',
  INPUT_NOT_READY: 'HTTP input is not ready',
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
  if (typeof baseUrl !== 'string') invalid();
  let base;
  try { base = new URL(baseUrl); } catch { invalid(); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || /[?#]/.test(base.href)) invalid();
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
function recordObject(value) {
  if (value === null || typeof value !== 'object') invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype) invalid();
  return value;
}
function params(value = {}) {
  recordObject(value);
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
function jsonValue(value, active = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (value === null || typeof value !== 'object' || active.has(value)) invalid();
  if (!Array.isArray(value)) recordObject(value);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (!own(value, i)) invalid();
        jsonValue(value[i], active);
      }
    } else for (const item of Object.values(value)) jsonValue(item, active);
  } finally { active.delete(value); }
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
function headerNames(declaration, literal = false) {
  if (declaration === undefined) return;
  recordObject(declaration);
  if (!literal && expressionKind(declaration)) return;
  const names = literal ? Object.keys(declaration) : dataEntries(declaration).map(([name]) => name);
  prepareHeaders(Object.fromEntries(names.map(name => [name, null])));
}
function requestTemplate(request, allowWhole = false) {
  recordObject(request);
  if (allowWhole && expressionKind(request)) { validateTemplate(request); return; }
  for (const key of ['baseUrl', 'method', 'path', 'headers', 'params', 'body']) validateTemplate(request[key]);
  headerNames(request.headers);
}
const systemClock = { now: () => performance.now(), set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) };

export function createHttpExecutor({
  transport = fetch, clock = systemClock, requestTimeoutMs = 30000,
  caller, authorize, resolveSecret = async () => { throw failure('EXECUTION_BLOCKED'); },
} = {}) {
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) invalid();
  if (authorize !== undefined && typeof authorize !== 'function') invalid();
  const authorizeRequest = authorize ?? (() => true);
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
    const evaluate = createValueEvaluator(check);
    async function evaluateHeaders(declaration, scope, literal = false) {
      if (declaration === undefined) return;
      const value = recordObject(literal ? declaration : await evaluate(declaration, scope));
      prepareHeaders(value); // Validate each declaration before evaluating/merging the next one.
      return value; // Keep null entries so they still remove inherited headers during merging.
    }
    async function send(template, defaults, context, allowWhole = false) {
      check();
      const addressScope = { values: context };
      const literal = allowWhole && expressionKind(template) !== null;
      const request = recordObject(literal ? await evaluate(template, addressScope) : template);
      if (literal) headerNames(request.headers, true);
      const field = value => literal ? value : evaluate(value, addressScope);
      const method = await field(request.method);
      if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method)) invalid();
      // Select before evaluation: an unused fallback never reads a value or secret.
      const baseUrl = request.baseUrl === undefined
        ? await evaluate(defaults.baseUrl, addressScope) : await field(request.baseUrl);
      const path = await field(request.path);
      check();
      const url = joinAddress(baseUrl, path);
      const destination = url.href;
      if (!await authorizeRequest({ caller, destination })) throw failure('EXECUTION_BLOCKED');
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
      const headers = prepareHeaders(await evaluateHeaders(defaults.headers, scope), await evaluateHeaders(request.headers, scope, literal));
      // Validate each evaluated declaration before merging can erase its type.
      const commonParams = defaults.params === undefined ? undefined : recordObject(await evaluate(defaults.params, scope));
      const requestParams = request.params === undefined ? undefined : recordObject(literal ? request.params : await evaluate(request.params, scope));
      const query = Object.assign(Object.create(null), commonParams, requestParams);
      url.search = params(query).toString();
      const evaluated = { method };
      if (own(request, 'body')) evaluated.body = literal ? request.body : await evaluate(request.body, scope);
      const body = encodeBody(evaluated, headers);
      if (!await authorizeRequest({ caller, destination: url.href })) throw failure('EXECUTION_BLOCKED');
      check();
      const response = await transport(url, { method, headers, body,
        signal: controller.signal, redirect: 'manual', credentials: 'omit' });
      check();
      if (response.status < 200 || response.status > 299) throw failure('HTTP_ERROR');
      let resultBody = null;
      if (method !== 'HEAD' && ![204, 205].includes(response.status)) {
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
      recordObject(plan.datasource);
      if (!authorize && (plan.datasource.auth || Object.keys(plan.datasource.secrets ?? {}).length)) throw failure('EXECUTION_BLOCKED');
      for (const key of ['baseUrl', 'headers', 'params']) validateTemplate(plan.datasource[key]);
      headerNames(plan.datasource.headers);
      requestTemplate(plan.request);
      if (plan.datasource.auth) {
        recordObject(plan.datasource.auth);
        requestTemplate(plan.datasource.auth.request, true);
        validateTemplate(plan.datasource.auth.token);
      }
      const context = { ports: plan.inputs };
      if (plan.datasource.auth) {
        const auth = plan.datasource.auth;
        if (auth.kind !== 'Login') invalid();
        const response = await send(auth.request, { baseUrl: plan.datasource.baseUrl }, context, true);
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
