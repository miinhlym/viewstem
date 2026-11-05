# Dependency patches

`npm install` and `npm ci` apply these patches through the root `postinstall`
script (`patch-package --error-on-fail`). Keep patches version-specific and review
them when upgrading the affected package.

## @astrojs/starlight 0.39.3

`utils/i18n.ts` reads `astroI18nConfig.routing.prefixDefaultLocale`, although
Astro 6's public configuration permits omitting `routing`. This causes TS18048
when checking the TypeScript source distributed by Starlight and a runtime error
when converting an Astro i18n configuration without `routing`.

Use optional chaining and the documented `false` default. Explicit `true`,
`false`, and the existing rejection of `manual` are preserved. The site's
Starlight `locales` configuration does not change.

- [Astro routing configuration](https://docs.astro.build/en/reference/configuration-reference/#i18nroutingprefixdefaultlocale)
- [Upstream source for the pinned release](https://github.com/withastro/starlight/blob/%40astrojs%2Fstarlight%400.39.3/packages/starlight/utils/i18n.ts)
- Verification: `node apps/docs/scripts/verify-starlight-i18n.mjs`
- Full documentation type check: `npm run typecheck:docs`

Remove this patch when adopting a release with equivalent handling. Starlight
0.42.9 requires Astro ^7.2.10; that framework upgrade is outside this fix.
