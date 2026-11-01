import assert from 'node:assert/strict';
import { preparePatch } from '../t1-cel-patch/prepare.mjs';
import { compileVariable, connectClock } from './clock-variable.mjs';
import { StateProbe, keyOf } from './state-probe.mjs';
import { compilePorts, stateValue, expression } from './ports-probe.mjs';
import { addDate, parseYY } from '../t1-cel-patch/calendar.mjs';
import { harness, report } from '../verification/report.mjs';
import { ProbeHost } from '../t2-query-races/query-probe.mjs';
import { FakeClock, ControlledTransport, flush } from '../t2-query-races/harness.mjs';
const prepared = await preparePatch(), { Environment } = await import(prepared.entry.href);
const { test, results } = harness();
const integer = { type: 'integer' }, number = { type: 'number' }, string = { type: 'string' };
const date = { 'x-viewstem-type': 'date' }, time = { 'x-viewstem-type': 'time' }, datetime = { 'x-viewstem-type': 'datetime' };
const value = schema => ({ kind: 'Value', schema, required: true });
const fixture = () => { const store = new StateProbe(); return { store, scope: store.scope() }; };
const variable = (expression, ports, output) => compileVariable(Environment, { expression, ports, output });

await test('V01-C09-K24/clock-input-derived-reuse-reset-and-dispose', () => {
  const { store, scope } = fixture(), listeners = new Set(); let now = Date.parse('2026-10-29T23:30:00Z');
  const clock = { now: () => now, subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback); }, tick(value) { now = value; for (const callback of [...listeners]) callback(value); } };
  const current = scope.register('now', { schema: integer, initial: now }), tz = scope.register('tz', { schema: string, initial: 'Asia/Seoul' });
  const connected = connectClock(clock, current), today = variable('localDate(now, tz)', { now: value(integer), tz: value(string) }, date);
  let todayCalls = 0, tomorrowCalls = 0;
  const calculated = scope.register('today', { schema: date, dependencies: [current, tz], derived: (now, tz) => { todayCalls++; return today.evaluate({ now, tz }).value; } });
  const next = variable('addDate(day, 1)', { day: value(date) }, date);
  const tomorrow = scope.register('tomorrow', { schema: date, dependencies: [calculated], derived: day => { tomorrowCalls++; return next.evaluate({ day }).value; } });
  const selection = scope.register('selection', { schema: date, initial: calculated.read() }), unrelated = scope.register('other', { schema: integer, initial: 7 });
  const before = [todayCalls, tomorrowCalls]; unrelated.write(8); assert.deepEqual([todayCalls, tomorrowCalls], before);
  clock.tick(Date.parse('2026-10-30T23:30:00Z')); assert.equal(calculated.read(), '2026-10-31'); assert.equal(tomorrow.read(), '2026-11-01'); assert.equal(selection.read(), '2026-10-30'); assert.equal(unrelated.read(), 8);
  selection.write('2026-11-10'); selection.reset(); assert.equal(selection.read(), '2026-10-30');
  assert.equal(todayCalls, before[0] + 1); assert.equal(tomorrowCalls, before[1] + 1);
  const saved = current.read(); for (const bad of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) clock.tick(bad); assert.equal(current.read(), saved); assert.equal(connected.diagnostics().length, 4);
  connected.dispose(); connected.dispose(); assert.equal(listeners.size, 0); scope.dispose(); clock.tick(0); assert.equal(listeners.size, 0);
});
await test('K33/explicit-zone-definition-readiness-invalid-and-device-independence', () => {
  assert.throws(() => variable('localDate(now)', { now: value(integer) }, date), error => error.code === 'INVALID_DEFINITION');
  const compiled = variable('localDate(now, tz)', { now: value(integer), tz: value(string) }, date), { scope } = fixture();
  const zone = scope.register('zone', { schema: string });
  const input = { now: Date.parse('2026-10-30T00:30:00Z'), tz: stateValue(zone) };
  assert.deepEqual(compiled.evaluate(input, { mode: 'automatic' }), { status: 'waiting' });
  assert.throws(() => compiled.evaluate(input), error => error.code === 'INPUT_NOT_READY' && error.input === 'tz');
  input.tz = expression(() => ({ status: 'pending' })); assert.equal(compiled.evaluate(input, { mode: 'automatic' }).status, 'waiting');
  for (const tz of ['', 'Unknown/Zone', '+09:00']) assert.throws(() => compiled.evaluate({ now: input.now, tz }), error => error.code === 'TYPE_MISMATCH');
  assert.equal(compiled.evaluate({ now: input.now, tz: 'America/Los_Angeles' }).value, '2026-10-29');
  assert.equal(compiled.evaluate({ now: input.now, tz: 'Asia/Seoul' }).value, '2026-10-30');
});
await test('V10-V11/calendar-validation-integer-deltas-and-year-pivot', () => {
  for (const delta of [0.1, 1.5, -1.5, NaN, Infinity, '1']) assert.throws(() => addDate('2026-10-30', delta));
  for (const date of ['2026-02-29', '2026-04-31', '0000-01-01', '2026-13-01']) assert.throws(() => addDate(date, 1n));
  assert.equal(addDate('2024-02-28', 1n), '2024-02-29'); assert.equal(addDate('2024-02-29', 1n), '2024-03-01'); assert.equal(addDate('2026-01-01', -1n), '2025-12-31');
  assert.throws(() => addDate('9999-12-31', 1n)); assert.throws(() => addDate('0001-01-01', -1n));
  const parser = variable('parseYY(text)', { text: value(string) }, integer);
  for (const [text, year] of [['00', 2000], ['68', 2068], ['69', 1969], ['99', 1999]]) { assert.equal(parser.evaluate({ text }).value, year); assert.equal(parseYY(text), BigInt(year)); }
  for (const text of ['0', '100', ' 68', '68 ', 'ab', '６８']) assert.throws(() => parser.evaluate({ text }));
  assert.throws(() => variable('addDate(day, 1.5)', { day: value(date) }, date), error => error.code === 'INVALID_DEFINITION');
});
await test('K34/local-clock-ambiguity-and-calendar-day-versus-elapsed-hours', () => {
  const convert = variable('atLocal(day, time, tz)', { day: value(date), time: value(time), tz: value(string) }, datetime);
  for (const [day, time] of [['2026-03-08', '02:30'], ['2026-11-01', '01:30']]) assert.throws(() => convert.evaluate({ day, time, tz: 'America/New_York' }), error => error.code === 'TYPE_MISMATCH');
  const start = variable('startOfDay(day, tz)', { day: value(date), tz: value(string) }, datetime), next = variable('nextDayStart(day, tz)', { day: value(date), tz: value(string) }, datetime);
  for (const [day, expectedHours] of [['2026-03-08', 23], ['2026-11-01', 25], ['2026-10-30', 24]]) {
    const inputs = { day, tz: 'America/New_York' }, a = start.evaluate(inputs).value, b = next.evaluate(inputs).value;
    assert.equal((Date.parse(b) - Date.parse(a)) / 3600000, expectedHours);
  }
});
await test('K32/date-canonical-equality-and-state-notices', () => {
  for (const [schema, initial, equivalent, changed] of [[date, '2026-10-30', '2026-10-30', '2026-10-31'], [time, '09:00', '09:00:00.000', '09:00:00.001'], [datetime, '2026-10-30T09:00:00+09:00', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.001Z']]) {
    const { store, scope } = fixture(), cell = scope.register('value', { schema, initial }), notices = []; store.subscribe(cell.address, value => notices.push(value));
    const snapshot = cell.snapshot(); cell.write(equivalent); assert.equal(cell.snapshot(), snapshot); assert.equal(notices.length, 1);
    cell.write(changed); assert.equal(notices.length, 2); assert.equal(notices[1].changes[0].kind, 'updated');
  }
});
await test('V39-V45/calculated-nonfinite-and-unsafe-integer-reject-atomically', () => {
  const { scope } = fixture(), source = scope.register('source', { schema: number, initial: 1 }), saved = scope.register('saved', { schema: integer, initial: 7 });
  for (const [expr, output] of [['1.0 / 0.0', number], ['0.0 / 0.0', number], ['1e308 * 1e308', number], ['9007199254740992', integer]]) {
    const calculate = variable(expr, {}, output), before = saved.snapshot(); assert.throws(() => saved.write(calculate.evaluate({}).value)); assert.equal(saved.snapshot(), before);
  }
  const calculate = variable('1.0 / source', { source: value(number) }, number);
  const derived = scope.register('derived', { schema: number, dependencies: [source], derived: source => calculate.evaluate({ source }).value });
  source.write(0); assert.equal(source.read(), 0); assert.equal(derived.snapshot().status, 'error'); assert.equal(saved.read(), 7);
  source.write(2); assert.equal(derived.read(), 0.5);
});
await test('V51/negative-zero-does-not-recalculate-react-or-request', async () => {
  const { store, scope } = fixture(), source = scope.register('source', { schema: number, initial: 0 }), target = scope.register('target', { schema: integer, initial: 9 }); let calculations = 0;
  scope.register('derived', { schema: number, dependencies: [source], derived: x => { calculations++; return x + 1; } }); store.reaction(scope, { watch: [source], target, value: 0 });
  const clock = new FakeClock(), trace = [], transport = new ControlledTransport(clock, trace), host = new ProbeHost(clock, transport, trace), query = host.mount('q', { inputs: { n: 0 } });
  const unsubscribe = store.subscribe(source.address, snapshot => query.configure({ inputs: { n: snapshot.values[keyOf(source.address)] } }));
  transport.respond(1, 1); await flush(); const before = calculations; source.write(-0); await flush();
  assert.equal(calculations, before); assert.equal(target.read(), 9); assert.equal(transport.requests.length, 1); assert.equal(Object.is(source.read(), -0), false); unsubscribe(); query.dispose();
});
await test('C06-C13/two-state-ports-and-same-name-independent-reactions', () => {
  const { store, scope } = fixture(), other = store.scope(), a = scope.register('value', { schema: integer, initial: 1 }), b = other.register('value', { schema: integer, initial: 2 });
  const connection = compilePorts({ resourceKind: 'Component', store, ports: { one: { kind: 'State', schema: integer }, two: { kind: 'State', schema: integer } } }).prepare({ one: a, two: a });
  connection.ports.one.write(3); assert.equal(connection.ports.two.read(), 3); connection.ports.two.write(4); assert.equal(a.read(), 4);
  const trigger = scope.register('trigger', { schema: integer, initial: 0 }); store.reaction(scope, { watch: [trigger], target: a, value: 0 }); store.reaction(other, { watch: [trigger], target: b, value: 0 });
  trigger.write(1); assert.equal(a.read(), 0); assert.equal(b.read(), 0);
});
await test('K08/read-snapshot-distinguishes-every-readiness-state', async () => {
  const { scope } = fixture(), missing = scope.register('missing', { schema: true }), ready = scope.register('null', { schema: true, initial: null });
  let reject; const pending = scope.register('pending', { schema: true, pendingInitial: new Promise((_, no) => { reject = no; }) });
  assert.equal(missing.read(), undefined); assert.equal(missing.snapshot().status, 'missing'); assert.equal(ready.read(), null); assert.equal(ready.snapshot().status, 'ready');
  assert.throws(() => pending.read(), error => error.code === 'VALUE_PENDING'); reject({ code: 'HTTP_ERROR' }); await Promise.resolve(); await Promise.resolve();
  assert.equal(pending.snapshot().status, 'error'); assert.throws(() => pending.read(), error => error === pending.snapshot().error && error.code === 'HTTP_ERROR');
});
await report({ base: import.meta.url, name: process.argv[2] ?? 'time-node24.json', scope: 'Explicit Clock/CEL calendar/State integration; private function names and fixture Clock, no hidden clock/production runtime', results,
  sources: ['time-integration.mjs', 'clock-variable.mjs', 'state-probe.mjs', 'ports-probe.mjs', 'immutable.mjs', '../t1-cel-patch/calendar.mjs', '../t1-cel-patch/guarded.mjs', '../t1-cel-patch/prepare.mjs', '../t1-cel-patch/cel-js-8.0.0.patch', '../t1-cel-patch/patched-sha256.json', '../t1-cel-patch/upstream-sha256.json', '../t1-cel-patch/package-lock.json', '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package.json', '../t1-values/package-lock.json', '../t2-query-races/query-probe.mjs', '../t2-query-races/harness.mjs', '../verification/report.mjs', '../verification/errors.mjs'], extra: { patchSha256: prepared.patchSha256, deviceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
