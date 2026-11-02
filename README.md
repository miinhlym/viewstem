# Viewstem

English | [한국어](README.ko.md)

A framework-independent runtime for declarative UIs. Describe resources, state,
queries, actions, and views in JSON, then connect them to your application's renderer.

## Packages

| Package | Purpose |
|---|---|
| [@viewstem/core](packages/core/README.md) | Validation, values, state, Query/Action execution, and view lifecycles without DOM or framework dependencies |
| [@viewstem/svelte](packages/svelte/README.md) | Svelte 5 client renderer; start with `createRenderer()` and register your components explicitly |
| [@viewstem/svelte-ui](packages/svelte-ui/README.md) | Optional shadcn-svelte component sets, registered explicitly through kit or family imports |

The packages have been built and tested locally. A package version or local
verification result does not establish publication on npm. See each package's
README for its public API, supported behavior, and limitations.

## Try it locally

From a clone of this repository:

```sh
npm ci --ignore-scripts
npm run playground
```

The [vanilla playground](playground/README.md) lets you edit JSON, preview the
rendered view, and inspect State, Query, and Action execution. To try Svelte, run
one of these commands in a separate terminal:

```sh
npm run example:svelte
npm run example:svelte-ui
```

The [Svelte example](packages/svelte/example/README.md) demonstrates custom
component registration. The [shadcn gallery](packages/svelte-ui/example/README.md)
includes 66 component families and five composed screen examples, with JSON
editing and runtime inspection. Its README distinguishes JSON adapters from
parts that require native Svelte composition.

## Documentation

- [Documentation guide](docs/README.md): usage, contracts, and verification records.
- [Contributing](CONTRIBUTING.md): setup, checks, review, and contribution licensing.
- [Support](SUPPORT.md): questions, maintenance policy, and supported environments.
- [Security](SECURITY.md): private vulnerability reporting.
- [Code of Conduct](CODE_OF_CONDUCT.md): participation and private conduct reports.

User-facing guides default to English and provide a Korean version through the
language link at the top of each page. Design specifications and historical
verification records remain in Korean. Issues and pull requests are welcome in
English or Korean.

## License

Viewstem-authored code, examples, and documentation are available under the
[MIT License](LICENSE), copyright (c) 2026 miinhlym, except where otherwise noted.
Third-party material retains its original license and notices, including
[CEL](packages/core/vendor/cel-js/LICENSE) and
[shadcn, Tailwind, and related UI sources](packages/svelte-ui/upstream/NOTICE.txt).
