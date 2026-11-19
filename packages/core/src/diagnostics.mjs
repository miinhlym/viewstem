import { error, safeError } from './errors.mjs';

const delivered = new WeakMap();

export function createDiagnostic(phase, cause, { application, nodeId } = {}) {
  return Object.freeze({
    phase, error: safeError(cause),
    ...(application === undefined ? {} : { application }),
    ...(nodeId === undefined ? {} : { nodeId }),
  });
}

export function notifyDiagnostic(diagnostic, ...observers) {
  if (diagnostic.error.code === 'CANCELLED') return;
  let listeners = delivered.get(diagnostic);
  if (!listeners) delivered.set(diagnostic, listeners = new WeakSet());
  for (const { listener, isOpen } of observers) {
    if (typeof listener !== 'function' || listeners.has(listener) || (isOpen && !isOpen())) continue;
    listeners.add(listener);
    try { void Promise.resolve(listener(diagnostic)).catch(() => {}); } catch {}
  }
}

export function createRenderError(missing, { componentId, connectorId, instanceId } = {}) {
  const missingMessage = typeof connectorId === 'string'
    ? `Connector ${JSON.stringify(connectorId)} is unavailable on this display connection.`
    : 'No implementation is available for this Component on the display connection.';
  return error(missing ? 'REFERENCE_NOT_FOUND' : 'INTERNAL_ERROR', {
    message: missing ? missingMessage : 'The Component could not be rendered.',
    ...(typeof componentId === 'string' ? { resource: { kind: 'Component', id: componentId } } : {}),
    ...(typeof instanceId === 'string' ? { instanceId } : {}),
  });
}

/** A prepare failure detected by the renderer before Core receives the source. */
export function createPreparationError(message) {
  return error('INVALID_DEFINITION', { message });
}
