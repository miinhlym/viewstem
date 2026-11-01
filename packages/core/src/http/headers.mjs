// The v1 reserved list is fixed by the HTTP contract.
const reservedNames = new Set([
  'accept-charset', 'accept-encoding', 'access-control-request-headers',
  'access-control-request-method', 'connection', 'content-length', 'cookie',
  'cookie2', 'date', 'dnt', 'expect', 'host', 'keep-alive', 'origin', 'referer',
  'set-cookie', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'via',
  // v1 deliberately reserves these names regardless of value.
  'user-agent', 'x-http-method', 'x-http-method-override', 'x-method-override',
]);
const nameSyntax = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const valueSyntax = /^[\t\x20-\x7e\x80-\xff]*$/;

function invalid() {
  // Never retain header values or a transport exception in diagnostics.
  const error = new Error('Invalid HTTP header declaration');
  error.code = 'INVALID_DEFINITION';
  throw error;
}

export function prepareHeaders(...declarations) {
  const merged = Object.create(null);
  for (const declaration of declarations) {
    if (declaration === undefined) continue;
    if (declaration === null || typeof declaration !== 'object' || Array.isArray(declaration)) invalid();
    const seen = new Set();
    for (const [name, value] of Object.entries(declaration)) {
      const lower = name.toLowerCase();
      if (!nameSyntax.test(name) || seen.has(lower) || reservedNames.has(lower)
        || lower.startsWith('proxy-') || lower.startsWith('sec-')) invalid();
      seen.add(lower);
      if (value === null) delete merged[lower];
      else {
        if (typeof value !== 'string' || !valueSyntax.test(value)) invalid();
        merged[lower] = value.replace(/^[\t ]+|[\t ]+$/g, '');
      }
    }
  }
  return merged;
}
