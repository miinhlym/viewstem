import { readFile } from 'node:fs/promises';
import { preparePatch } from './prepare.mjs';
import { report } from '../verification/report.mjs';
const prepared = await preparePatch();
const { Environment } = await import(prepared.entry.href);
const environment = new Environment();
const definitions = environment.getDefinitions();
const catalog = JSON.parse(await readFile(new URL('./function-catalog.json', import.meta.url), 'utf8'));
const signatures = definitions.functions.map(row => row.signature);
const macroSignatures = definitions.functions.filter(row => row.params.some(param => param.type === 'ast')).map(row => row.signature);
await report({ base: import.meta.url, name: process.argv[2] ?? 'catalog-node22.json',
  scope: 'Default candidate registry inventory equality, not whole function conformance or v1 public profile approval',
  results: [
    { id: 'catalog/exact-108-signatures', passed: signatures.length === 108 && JSON.stringify(signatures) === JSON.stringify(catalog.functionSignatures) },
    { id: 'catalog/exact-10-overlapping-macros', passed: macroSignatures.length === 10 && JSON.stringify(macroSignatures) === JSON.stringify(catalog.macroSignatures) },
    { id: 'catalog/default-enableOptionalTypes-false', passed: environment.opts.enableOptionalTypes === false },
    { id: 'catalog/variables-match', passed: JSON.stringify(definitions.variables) === JSON.stringify(catalog.variables) },
    { id: 'catalog/classifications-cover-all', passed: catalog.classifications.length === 108 && catalog.classifications.every((row, index) => row.signature === signatures[index]) },
    { id: 'catalog/patch-provenance', passed: catalog.currentPatchSha256 === prepared.patchSha256 },
  ], sources: ['catalog.mjs', 'function-catalog.json', 'prepare.mjs', 'cel-js-8.0.0.patch', 'upstream-sha256.json', 'patched-sha256.json', '../verification/report.mjs'],
  extra: { patchSha256: prepared.patchSha256, macroSignatures } });
