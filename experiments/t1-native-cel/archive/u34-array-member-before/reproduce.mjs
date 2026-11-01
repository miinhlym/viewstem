// Re-run the archived adapter against the same verified shared dependencies.
import { readFile, writeFile } from 'node:fs/promises';
import { preparePatch } from '../../../t1-cel-patch/prepare.mjs';
import { StateProbe } from '../../../t3-state/state-probe.mjs';
const base = import.meta.url, originalLocation = new URL('../../adapter.mjs', base);
const archived = await readFile(new URL('snapshot/adapter.mjs', base), 'utf8');
const relocated = archived.replace(/from '(\.\.\/[^']+)'/g, (_, path) => `from '${new URL(path, originalLocation).href}'`);
const { createTypedAdapter } = await import(`data:text/javascript;base64,${Buffer.from(relocated).toString('base64')}`);
const { Environment } = await import((await preparePatch()).entry.href);
const item = { type: 'array', items: { type: 'integer' } }, schema = { 'x-viewstem-type': 'set', items: item };
const cell = new StateProbe().scope().register('set', { schema, initial: new Set([[1]]) });
const s = cell.read(), x = [...s][0], result = { nativeHas: s.has(x) };
try { result.adapterHas = createTypedAdapter(Environment, { inputs: { s: schema, x: item }, output: { type: 'boolean' } }).compile('probeSetHas(s,x)')({ s, x }); }
catch (error) { result.error = /UNSUPPORTED_VALUE/.test(error.message) ? 'UNSUPPORTED_VALUE' : error.message; }
if (result.nativeHas !== true || result.error !== 'UNSUPPORTED_VALUE') throw Error('ARCHIVED_COUNTEREXAMPLE_NOT_REPRODUCED');
await writeFile(new URL('reproduction-before.json', base), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
