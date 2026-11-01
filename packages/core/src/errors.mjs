// Only errors created here carry trusted diagnostic metadata across boundaries.
const trusted = new WeakSet();
export const errorCodes = Object.freeze('INVALID_DEFINITION REFERENCE_NOT_FOUND TYPE_MISMATCH TYPE_CONTRACT_MISMATCH INVALID_EXPRESSION INPUT_NOT_READY VALUE_PENDING EXECUTION_BLOCKED QUERY_REFRESH_DISABLED INVALID_RETRY_STATE ACTION_RECURSION ASSERTION_FAILED HTTP_ERROR TIMEOUT CANCELLED LIMIT_EXCEEDED INTERNAL_ERROR'.split(' '));
export function error(code, fields = {}) {
  const result = Object.freeze({ code, message: code, ...fields });
  trusted.add(result);
  return result;
}
export function safeError(value, fallback = 'INTERNAL_ERROR') {
  if (value && typeof value === 'object' && trusted.has(value)) return value;
  let code = fallback;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'code');
    if (descriptor && Object.hasOwn(descriptor, 'value') && errorCodes.includes(descriptor.value)) code = descriptor.value;
  } catch {}
  return error(code);
}
export const fail = (code, fields) => { throw error(code, fields); };
export function at(value, fields, fallback) {
  const cause = safeError(value, fallback);
  return error(cause.code, { message: cause.message, ...fields, cause });
}
