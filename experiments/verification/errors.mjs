// Shared experiment boundary, not a public error SDK. Never copy hostile metadata.
const publicCodes = new Set('INVALID_DEFINITION REFERENCE_NOT_FOUND TYPE_MISMATCH TYPE_CONTRACT_MISMATCH INVALID_EXPRESSION INPUT_NOT_READY VALUE_PENDING EXECUTION_BLOCKED QUERY_REFRESH_DISABLED INVALID_RETRY_STATE ACTION_RECURSION ASSERTION_FAILED HTTP_ERROR TIMEOUT CANCELLED LIMIT_EXCEEDED INTERNAL_ERROR'.split(' '));
export function safeError(error, fallback = 'INTERNAL_ERROR') {
  let code = fallback;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    if (descriptor && Object.hasOwn(descriptor, 'value') && publicCodes.has(descriptor.value)) code = descriptor.value;
  } catch {}
  return Object.freeze({ code, message: code });
}
