import { registerSchema, validate, unregisterSchema } from '@hyperjump/json-schema/draft-2020-12';
import { ajv } from './values.mjs';

const dialect = 'https://json-schema.org/draft/2020-12/schema';
export const schemaCases = [
  ['S01', true, null, true], ['S02', false, null, false],
  ['S03', {type:'number'}, '42', false],
  ['S04', {type:'integer'}, 9007199254740991, true],
  ['S05', {type:'integer'}, 1.25, false],
  ['S06', {type:'number', minimum:1, exclusiveMaximum:3}, 3, false],
  ['S07', {type:'string', minLength:1, maxLength:1}, '😀', true],
  ['S08', {type:'string', pattern:'^a+$'}, 'baa', false],
  ['S09', {type:'object', properties:{n:{type:'integer',default:3}}, required:['n']}, {}, false],
  ['S10', {type:'object', properties:{n:{default:3}}}, {}, true],
  ['S11', {type:'object', properties:{n:{type:'number'}}, additionalProperties:false}, {n:1,extra:2}, false],
  ['S12', {type:'object', minProperties:1, maxProperties:2}, {}, false],
  ['S13', {type:'array',prefixItems:[{type:'string'},{type:'integer'}],items:false}, ['x',1], true],
  ['S14', {type:'array',prefixItems:[{type:'string'}],items:false}, ['x',1], false],
  ['S15', {type:'array',items:{type:'number'},minItems:1,maxItems:2}, [1,'2'], false],
  ['S16', {type:'array',uniqueItems:true}, [{a:1,b:2},{b:2,a:1}], false],
  ['S17', {enum:[null,false,0]}, false, true],
  ['S18', {const:{a:1,b:2}}, {b:2,a:1}, true],
  ['S19', {allOf:[{type:'integer'},{minimum:2}]}, 1, false],
  ['S20', {anyOf:[{type:'string'},{type:'null'}]}, null, true],
  ['S21', {oneOf:[{type:'number'},{type:'integer'}]}, 1, false],
  ['S22', {not:{type:'string'}}, 2, true],
  ['S23', {if:{type:'integer'},then:{minimum:0},else:{type:'string'}}, -1, false],
  ['S24', {$defs:{n:{type:'integer'}},type:'object',properties:{n:{$ref:'#/$defs/n'}}}, {n:'1'}, false],
];

// Registration profile proof. Never send external references to an engine.
// It checks the subset, not JSON Schema syntax validity (engines do that).
const allowed = new Set(('$schema $ref $defs type enum const allOf anyOf oneOf not if then else '
  +'minimum maximum exclusiveMinimum exclusiveMaximum minLength maxLength pattern '
  +'properties required additionalProperties minProperties maxProperties items prefixItems '
  +'minItems maxItems uniqueItems title description default examples readOnly writeOnly deprecated $comment').split(' '));
export function profileGuard(root) {
  const active = new Set();
  const done = new Set();
  function walk(s) {
    if (typeof s === 'boolean') return;
    if (!s || Array.isArray(s) || typeof s !== 'object') throw Error('SCHEMA_OBJECT');
    if (active.has(s)) throw Error('CYCLIC_REF');
    if (done.has(s)) return;
    active.add(s);
    for (const k of Object.keys(s)) if (!allowed.has(k)) throw Error(`UNSUPPORTED_KEYWORD:${k}`);
    if (s.$schema && s.$schema !== dialect) throw Error('DIALECT');
    if (s.$ref !== undefined) {
      if (typeof s.$ref !== 'string' || !s.$ref.startsWith('#/')) throw Error('LOCAL_REF_REQUIRED');
      let target = root;
      for (const segment of s.$ref.slice(2).split('/')) {
        const key = decodeURIComponent(segment).replace(/~1/g,'/').replace(/~0/g,'~');
        if (!target || !Object.hasOwn(target,key)) throw Error('MISSING_REF');
        target = target[key];
      }
      walk(target);
    }
    for (const k of ['$defs','properties']) for (const child of Object.values(s[k] ?? {})) walk(child);
    for (const k of ['allOf','anyOf','oneOf','prefixItems']) for (const child of s[k] ?? []) walk(child);
    for (const k of ['not','if','then','else','items','additionalProperties']) if (k in s) walk(s[k]);
    active.delete(s); done.add(s);
  }
  walk(root);
}

export async function probeSchemas(record) {
  for (const [id,schema,value,expected] of schemaCases) {
    profileGuard(schema);
    for (const engine of ['ajv','hyperjump']) {
      const copy = structuredClone(value);
      const uri = `https://viewstem.invalid/t1/${id}`;
      let actual;
      try {
        if (engine === 'ajv') actual = ajv.compile(schema)(copy);
        else {
          registerSchema(schema,uri,dialect);
          actual = (await validate(uri,copy)).valid;
        }
      } finally { if (engine === 'hyperjump') unregisterSchema(uri); }
      record('schema',`${engine}/${id}`,expected,actual, {schema,input:value,unchanged:JSON.stringify(copy)===JSON.stringify(value)});
      record('schema-mutation',`${engine}/${id}`,true,JSON.stringify(copy)===JSON.stringify(value));
    }
  }
}
