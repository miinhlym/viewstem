import { registerSchema, validate, unregisterSchema } from '@hyperjump/json-schema/draft-2020-12';
import { ajv } from './values.mjs';

import { dialect, profileGuard } from './schema-profile.mjs';
export { profileGuard } from './schema-profile.mjs';
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
