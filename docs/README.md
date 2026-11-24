# Viewstem documentation

English | [한국어](README.ko.md)

## Use a released package

Start with the [public documentation](https://viewstem.miinhlym.workers.dev/docs/) for installation, examples and API lookup. The production site reflects its own build of the pinned npm packages. When you reached this page from a package README, the following paths stay on the Git revision linked from that package.

| Package | Guide | Public API definition |
| --- | --- | --- |
| Core | [Package guide](../packages/core/README.md) | [Core types](../packages/core/src/index.d.ts), [HTTP types](../packages/core/src/http.d.ts), [CEL types](../packages/core/src/cel.d.ts) |
| DOM | [Package guide](../packages/dom/README.md) | [DOM exports](../packages/dom/src/index.ts) |
| Svelte | [Package guide](../packages/svelte/README.md) | [Svelte exports](../packages/svelte/src/lib/index.ts) |
| UI | [Package guide](../packages/ui/README.md) | [UI exports](../packages/ui/src/index.ts), [support catalog entry](../packages/ui/package.json#L22) |

The [release documentation sources](../apps/docs/src/content/docs/docs/) and [product contracts (Korean)](VIEWSTEM-SPEC.md) are also available at this revision. The [consumer skill](../skills/viewstem/SKILL.md) has separate [Codex installation and support guidance](../skills/viewstem/integrations/codex.md).

## Maintain the repository

| Task | Starting point |
| --- | --- |
| Change runtime, browser rendering or host integration | [Implementation architecture (Korean)](architecture.md) and the [product contracts (Korean)](VIEWSTEM-SPEC.md) |
| Trace a design decision | [Design decisions (Korean)](decisions.md) |
| Maintain or evaluate the consumer skill | [Skill design and verification (Korean)](../skills/README.md) |
| Choose checks or reproduce evidence | [Verification](verification.md) |
| Publish a package or deploy or roll back the site | [Release procedure](releasing.md) |
| Edit site content, routes, examples or Playground | [Website maintenance](../apps/docs/README.md) |
| Contribute, get support or report a vulnerability | [Contributing](../CONTRIBUTING.md), [Support](../SUPPORT.md), [Security](../SECURITY.md) |

The [product specification](VIEWSTEM-SPEC.md) links to the detailed, language-independent contracts. Use [follow-up scope (Korean)](follow-up.md#실제-남은-작업) for work outside the published packages. Historical experiments and decisions are linked where they support a current contract or a reproducible result.
