# Verifying Viewstem

The [CI workflow](../.github/workflows/ci.yml) runs on pushes to `main`, pull
requests, and manual dispatch. A newer run cancels an older run for the same PR.
Pushes are grouped by commit and manual CI runs have a separate group. Required
checks use **CI complete**. Manual dispatch reports **Manual CI complete**.
Pushes to other branches without a pull request do not run CI automatically;
use a pull request or manual dispatch to check them.

## Checks and environments

- Node 22 and 24 build Core, DOM, Svelte, and UI. The compatibility jobs check Core, DOM, and Svelte types and installed-package consumers, including the independent DOM and mixed-rendering fixtures.
- Chromium runs the Core, DOM, and Svelte browser tests and the UI tarball consumer tests. The UI suite covers plain JS, React, Vue and Svelte hosts, the original JSON for all 66 families, and date and table State and events.
- Node 24 also runs the release and deployment automation tests.
- **CI complete** requires both compatibility and browser jobs to pass.

CI uses Playwright Chromium’s headless shell.

## Choose checks by change

| Change | Checks |
|---|---|
| Core behavior or contracts | `npm run check`; add `npm run test:browser` for browser behavior |
| Core package contents, declarations, or package README | `npm run build` then `npm run test:package` |
| DOM renderer, connectors, or CSS scoping | `npm run check:dom`. For package exports or independent consumers, build all four packages and run `npm run test:dom:package`. |
| Svelte renderer or its example | `npm run check:svelte` |
| Browser UI catalog, generated contracts, styles, or fixtures | `npm run check:ui` |
| Website UI, content, navigation, or examples | Follow the [website maintenance guide](../apps/docs/README.md#choose-checks-by-the-changed-boundary) for source owners and targeted checks |
| CI configuration | `npm run test:ci`; validate workflow syntax and run the affected browser checks described above |
| Package metadata or license files only | Build the affected package and run its installed-package check. Use `npm run test:package` for Core, `npm run test:dom:package` for DOM (after building all four packages), or `npm run test:svelte:package` for Svelte. For UI, run `npm run check:ui` and inspect `npm pack --dry-run -w @viewstem/ui`. |
| Community documentation or templates only | Check links, examples, JSON/YAML syntax where applicable, and `git diff --check` |

Tests that render Svelte or UI components consume built package exports. Rebuild
the affected packages before running a browser test directly. Report the commands
and results in your pull request, including any checks you could not run. Do not
describe a skipped check or a written scenario as a passing test.

## Contract boundaries

Use the applicable product contract when changing behavior. The Korean table
below pairs major boundaries with the outcomes to verify.

| 변경 경계 | 기준 계약 | 검증할 관찰 결과 |
|---|---|---|
| 등록·스키마·포트 | [공통 계약](VIEWSTEM-SPEC.md), [스키마 프로필](spec/03-variable-type.md) | 종류별 참조·인라인/XOR·타입·원자 등록, 값 전달과 capability 연결의 구분 |
| HTTP·인증 | [요청·인증 계약](spec/01-datasource-auth.md) | 현재 정의 기반 실행, secret 비노출·목적지 권한·취소·오류 위치. 실제 서비스 정책은 서비스에서 검증 |
| 값·날짜·CEL | [값 계약](spec/10-value-contracts.md), [JS CEL 지원 범위](core-cel.md) | missing·정규화·원본 격리·snapshot·native 정체성·명시 시간대·실제 비용 제한 |
| Query·Action | [Query](spec/02-query.md), [Action](spec/04-action.md) | 입력/세대 경합·결과 보존·무관한 실행 유지, 하위 호출/독립 호출·취소·완료 효과 비롤백 |
| Store·URL·화면 수명 | [Store·URL](spec/09-state-store-and-url.md), [화면 계약](spec/05-component-view.md) | reaction·URL 복원·commit 직전 유효성, 부분 변경과 전체 교체, 반복·제거·늦은 결과 |
| 공개 SDK·렌더러 | [호스트 계약](spec/07-host-integration.md), [공개 타입](../packages/core/src/index.d.ts) | 타입 소비자·정의 등록과 인스턴스 생성의 구분·권한·초기 완료, core projection과 렌더러 반영의 구분 |

## Time budget

The target is **at most five minutes**, with **three minutes** as a stretch goal,
for the complete required CI path including setup, build, verification and
report aggregation. GitHub runner allocation delay is tracked separately.
Also inspect total runner time: distributing identical tests twice is not a
speed improvement. Job timeouts are safety limits, not the performance target.

Compare repeated runs of the same revision, retain cold/warm cache and failure
evidence, and keep the full acceptance scope. Record actual observations and
limitations in the [optimization handoff](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/docs/handoff/ci-optimization-2026-11-03.md)
(Korean). Do not treat local harness timings as remote CI measurements.

## Acceptance and historical evidence

The [Core acceptance input](core-acceptance-coverage.json) maps contract IDs to product tests. The [coverage check](../packages/core/scripts/check-coverage.mjs) requires executed results for those tests. Keep the mapping and the source contract links when updating a product test. The [acceptance table](acceptance.md) explains each expected result. Run `npm run test:report` and
`npm run check:coverage` for the current result in
`packages/core/test/results/current.json`. Use the
[November 2 product report](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/docs/handoff/core-verification-results.json)
as a result from its recorded revision. Separate Node/Core checks, browser
consumer checks, and the published-package website checks in the
[release procedure](releasing.md#deploy-the-site).

Reproduce a historical experiment with its source files, scripts, and results at the recorded revision. The experiment audit checks the original Markdown row locations and report source hashes. The [historical audit instructions](../experiments/verification/README.md) identify the pinned source and the dependency installs required to reproduce it.

The [support policy](../SUPPORT.md#supported-behavior-and-environments) owns support commitments. The published [package manifests](README.md#use-a-released-package) and CI report identify the package versions and environments checked. Keep benchmark observations with their revisions and inputs. The CI time target above concerns the verification pipeline.
