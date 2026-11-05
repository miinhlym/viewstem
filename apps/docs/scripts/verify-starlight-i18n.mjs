import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

// Exercise the installed dependency, so reinstalling without the patch fails this check.
const require = createRequire(import.meta.url);
const entry = join(dirname(require.resolve('@astrojs/starlight')), 'utils/i18n.ts');
const { outputFiles } = await build({
  entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm',
});
const { processI18nConfig } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`
);
const convert = (locales, routing) => processI18nConfig(
  { isUsingBuiltInDefaultLocale: true },
  { defaultLocale: 'en', locales, ...(routing === undefined ? {} : { routing }) },
).starlightConfig;

for (const routing of [undefined, {}, { prefixDefaultLocale: false }]) {
  const multi = convert(['en', 'ko'], routing);
  assert.equal(multi.isMultilingual, true);
  assert.deepEqual(Object.keys(multi.locales), ['root', 'ko']);
  assert.equal(multi.defaultLocale.locale, undefined);
  const mono = convert(['en'], routing);
  assert.equal(mono.isMultilingual, false);
  assert.equal(mono.locales, undefined);
}
const prefixed = convert(['en', 'ko'], { prefixDefaultLocale: true });
assert.deepEqual(Object.keys(prefixed.locales), ['en', 'ko']);
assert.equal(prefixed.defaultLocale.locale, 'en');
assert.throws(() => convert(['en', 'ko'], 'manual'), /not compatible.*manual/);
console.log('Starlight i18n: 8 routing scenarios passed');
