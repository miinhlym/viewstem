import { compilePorts } from './ports-probe.mjs';
import { compileSchema } from '../t1-values/schema-runtime.mjs';
import { createGuarded } from '../t1-cel-patch/guarded.mjs';
import { calendarFunctions } from '../t1-cel-patch/calendar.mjs';
import { fromCelInteger, toCelInteger } from '../t1-values/values.mjs';
import { safeError } from '../verification/errors.mjs';
import { protect } from './immutable.mjs';
const fail = code => { throw Object.assign(new Error(code), { code }); };

// Bounded primitive Variable/Clock connection; native collection/CEL adapter is separate.
export function compileVariable(Environment, { ports, expression, output, functions = calendarFunctions }) {
  const connected = compilePorts({ resourceKind: 'Variable', ports }), result = compileSchema(output), variables = {}, integerPorts = new Set();
  for (const [name, port] of Object.entries(ports)) {
    const type = port.schema?.type, native = port.schema?.['x-viewstem-type'];
    if (type === 'integer') { variables[name] = 'int'; integerPorts.add(name); }
    else if (type === 'number') variables[name] = 'double';
    else if (type === 'string' || ['date', 'time', 'datetime'].includes(native)) variables[name] = 'string';
    else if (type === 'boolean') variables[name] = 'bool';
    else fail('UNSUPPORTED_IN_PROBE');
  }
  let evaluate;
  try { evaluate = createGuarded(Environment, { variables, functions }).compile(expression); }
  catch { fail('INVALID_DEFINITION'); }
  return Object.freeze({ evaluate(inputs, { mode = 'explicit' } = {}) {
    const prepared = connected.prepare(inputs, { mode });
    if (prepared.status === 'waiting') return Object.freeze({ status: 'waiting' });
    const bindings = Object.fromEntries(Object.entries(prepared.ports).map(([name, value]) => [name, integerPorts.has(name) ? toCelInteger(value) : value]));
    let value;
    try { value = evaluate(bindings); if (typeof value === 'bigint') value = fromCelInteger(value); value = protect(result.accept(value)); }
    catch (error) { throw safeError(error, 'TYPE_MISMATCH'); }
    return Object.freeze({ status: 'ready', value });
  } });
}

export function connectClock(clock, handle) {
  let alive = true; const errors = [];
  const accept = value => { if (!Number.isSafeInteger(value)) fail('TYPE_MISMATCH'); return value; };
  handle.write(accept(clock.now()));
  const unsubscribe = clock.subscribe(value => { if (!alive) return; try { handle.write(accept(value)); } catch (error) { errors.push(safeError(error)); } });
  if (typeof unsubscribe !== 'function') fail('INVALID_DEFINITION');
  return Object.freeze({ dispose() { if (!alive) return; alive = false; unsubscribe(); }, diagnostics: () => [...errors] });
}
