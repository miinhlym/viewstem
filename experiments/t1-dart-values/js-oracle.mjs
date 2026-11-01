import { compileSchema, equal } from '../t1-values/schema-runtime.mjs';
import { localInstant } from '../t1-values/values.mjs';
import { StateProbe } from '../t3-state/state-probe.mjs';
import { protect, trustedCopies } from '../t3-state/immutable.mjs';
import { compilePorts, stateValue } from '../t3-state/ports-probe.mjs';
import { createTypedAdapter } from '../t1-native-cel/adapter.mjs';
const hole = Symbol('fixture-hole');
const ready = value => ({ status: 'ready', value: encode(value) });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function factory() {
  const refs = new Map();
  function decode(value) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      const result = new Array(value.length); value.forEach((item, index) => { const child = decode(item); if (child !== hole) result[index] = child; }); return result;
    }
    switch (value.$fixture) {
      case 'undefined': return undefined;
      case 'hole': return hole;
      case 'negativeZero': return -0;
      case 'nan': return NaN;
      case 'infinity': return Infinity;
      case 'negativeInfinity': return -Infinity;
      case 'bigint': return 1n;
      case 'function': return () => 1;
      case 'future': return Promise.resolve(1);
      case 'dateObject': return new Date('2026-10-29T00:00:00Z');
      case 'symbol': return Symbol('fixture');
      case 'sum': return value.a + value.b;
      case 'ref': return refs.get(value.id);
      case 'object': { const object = {}; if (value.id) refs.set(value.id, object); for (const [key, child] of Object.entries(value.value)) object[key] = decode(child); return object; }
      case 'set': return new Set(value.values.map(decode));
      case 'map': return new Map(value.entries.map(([key, child]) => [decode(key), decode(child)]));
      case 'cycle': {
        if (value.kind === 'object') { const object = {}; object.self = object; return object; }
        if (value.kind === 'array') { const array = []; array.push(array); return array; }
        if (value.kind === 'set') { const set = new Set(); set.add(set); return set; }
        const map = new Map(); map.set('self', map); return map;
      }
      default: return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decode(child)]));
    }
  }
  return decode;
}
function encode(value) {
  if (value instanceof Set) return { $set: [...value].map(encode) };
  if (value instanceof Map) return { $map: [...value].map(([key, child]) => [encode(key), encode(child)]) };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, encode(value[key])]));
  return value;
}
function category(error) {
  const code = error.code ?? error.message;
  if (/CYCLIC/.test(code)) return 'CYCLIC_VALUE';
  if (/NON_FINITE/.test(code)) return 'NON_FINITE';
  if (/MAP_KEY/.test(code)) return 'MAP_KEY';
  if (/UNSUPPORTED|ARRAY_HOLE/.test(code)) return 'UNSUPPORTED_VALUE';
  if (/SAFE_INTEGER|SCHEMA|TYPE_MISMATCH/.test(code)) return 'TYPE_MISMATCH';
  if (['INPUT_NOT_READY', 'TIMEOUT', 'VALUE_PENDING'].includes(code)) return code;
  if (/DATE|TIME|range|invalid|multiple instants|no such instant/i.test(code)) return 'DATE_INVALID';
  return 'INTERNAL_ERROR';
}
const admit = (schema, input) => protect(compileSchema(schema).accept(input, trustedCopies(input)));
export async function observeJS(fixture, Environment) {
  const decode = factory(), store = new StateProbe(), scope = store.scope();
  try {
    switch (fixture.op) {
      case 'accept': return ready(admit(fixture.schema, decode(fixture.input)));
      case 'asyncResult': return ready(admit(fixture.schema, await Promise.resolve(decode(fixture.input))));
      case 'yy': { const value = Number(fixture.input); return value <= 68 ? value + 2000 : value + 1900; }
      case 'timezone': return ready(localInstant(fixture.date, fixture.time, fixture.zone));
      case 'intResult': return ready(createTypedAdapter(Environment, { inputs: { i: { type: 'integer' } }, output: { type: 'integer' } }).compile('i+1')({ i: fixture.input }));
      case 'adapterRoundtrip': return ready(createTypedAdapter(Environment, { inputs: { x: fixture.schema }, output: fixture.schema }).compile('x')({ x: decode(fixture.input) }));
      case 'adapterSetArrayMember': {
        const item = { type: 'array', items: { type: 'integer' } }, schema = { 'x-viewstem-type': 'set', items: item };
        const cell = scope.register('set', { schema, initial: new Set([[1]]) }), s = cell.read(), member = [...s][0];
        const run = createTypedAdapter(Environment, { inputs: { s: schema, x: item }, output: { type: 'boolean' } }).compile('probeSetHas(s,x)');
        const output = createTypedAdapter(Environment, { inputs: { x: item }, output: item }).compile('x')({ x: member });
        let readonly = false; try { output.push(2); } catch { readonly = true; }
        return { sameStored: run({ s, x: member }), newEqualContent: run({ s, x: [1] }), nativeReturnOrigin: output === member, readonly };
      }
      case 'nativeEquality': {
        const a = { n: 1 }, b = { n: 1 }, set = new Set([a, b]);
        return { setObjects: set.size, sameReference: set.has(a), sameContent: set.has({ n: 1 }), mapKeys: new Map([[1, 'int'], [1.0, 'double'], ['1', 'string'], [1.5, 'fraction']]).size };
      }
      case 'setIdentity': {
        const cell = scope.register('set', { schema: { 'x-viewstem-type': 'set', items: { type: 'object' } }, initial: new Set([{ n: 1 }, { n: 1 }]) }), members = [...cell.read()];
        return { size: cell.read().size, sameReference: cell.read().has(members[0]), sameContent: cell.read().has({ n: 1 }), reorderedEqual: equal(cell.read(), admit({ 'x-viewstem-type': 'set', items: { type: 'object' } }, new Set(members.reverse()))) };
      }
      case 'setElementReinput': {
        const source = decode(fixture.input), cell = scope.register('set', { schema: fixture.schema, initial: source });
        const old = cell.read(), member = [...old][0], before = encode(member);
        cell.write(new Set([...old])); const next = cell.read();
        let readonly = false;
        try { if (fixture.kind === 'array') member[0] = 9; else if (fixture.kind === 'object-array') member.a.push(9); else member.a = 'mutated'; }
        catch { readonly = true; }
        const raw = [...source][0];
        if (fixture.kind === 'array') raw[0] = 9; else if (fixture.kind === 'object-array') raw.a.push(9); else raw.a = 'changed-source';
        return { size: next.size, sameMember: member === [...next][0], keptSnapshot: old === next, equal: equal(old, next), newSetHasOldMember: next.has(member), readonly, sourceIsolated: JSON.stringify(encode(member)) === JSON.stringify(before), canonical: encode(member) };
      }
      case 'mapIdentity': {
        const cell = scope.register('map', { schema: true, initial: new Map([['null', null], [1.5, { n: 1 }], ['1.5', 3]]) }), map = cell.read();
        return { reorderedEqual: equal(map, admit(true, new Map([...map].reverse()))), hasNull: map.has('null'), nullValue: map.get('null'), hasAbsent: map.has('absent') };
      }
      case 'zero': {
        const value = admit(true, { n: -0, s: new Set([-0, 0]), m: new Map([[-0, 1], ['-0', 2]]) });
        return { negativeZero: Object.is(value.n, -0), setSize: value.s.size, mapSize: value.m.size };
      }
      case 'readonly': {
        const source = { o: { n: 1 }, a: [{ n: 1 }], s: new Set([{ n: 1 }]), m: new Map([['x', { n: 1 }]]) }, cell = scope.register('value', { schema: true, initial: source }), old = cell.read();
        const stableRead = old === cell.read(); source.o.n = 8; source.a.push({ n: 2 }); source.s.clear(); source.m.clear();
        const sourceIsolated = old.o.n === 1 && old.a.length === 1 && old.s.size === 1 && old.m.size === 1;
        const actions = [() => { old.o.n = 9; }, () => old.a.push(3), () => old.s.add(3), () => old.s.delete([...old.s][0]), () => old.m.set('x', 3), () => old.m.clear(), () => { old.m.get('x').n = 9; }, () => { old.a[0].n = 9; }];
        let blockedMutations = 0; for (const action of actions) try { action(); } catch { blockedMutations++; }
        cell.write({ next: true });
        return { sourceMutable: !Object.isFrozen(source) && source.o.n === 8, sourceIsolated, blockedMutations, stableRead, oldSnapshotStable: old.o.n === 1 && old.s.size === 1 };
      }
      case 'readiness': case 'prepare': {
        const declaration = { schema: { type: ['integer', 'null'] } };
        if (fixture.state === 'ready') declaration.initial = fixture.value;
        if (fixture.state === 'pending') declaration.pendingInitial = new Promise(() => {});
        if (fixture.state === 'error') declaration.pendingInitial = Promise.reject({ code: 'TIMEOUT' });
        const cell = scope.register('value', declaration); await tick();
        if (fixture.op === 'prepare') return { status: compilePorts({ resourceKind: 'Action', ports: { input: { kind: 'Value', schema: { type: ['integer', 'null'] }, required: true } } }).prepare({ input: stateValue(cell) }, { mode: fixture.mode }).status };
        const snapshot = cell.snapshot(), result = { status: snapshot.status };
        if (snapshot.status === 'ready') result.value = encode(snapshot.value);
        try { result.simple = cell.read() === undefined ? 'missing' : encode(cell.read()); } catch (error) { result.simpleError = error.code; }
        return result;
      }
      default: throw Error('UNKNOWN_OPERATION');
    }
  } catch (error) { return { status: 'error', category: category(error) }; }
}
