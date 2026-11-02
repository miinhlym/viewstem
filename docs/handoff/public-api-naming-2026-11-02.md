# U42 공개 API 네이밍 적용 · 2026-11-02

사용자가 [네이밍 검토](public-api-naming-review-2026-11-02.md)의 권고 전체를 채택하고 공개 타입·예제·플레이그라운드·테스트·문서와 검증을 함께 변경하도록 요청했다. D98은 P1/P2 이름 변경을 적용하며, U41의 공개 경계와 단일 런타임을 유지한다. 현재 사용법은 [core README](../../packages/core/README.md), [Svelte README](../../packages/svelte/README.md), [호스트 계약](../spec/07-host-integration.md)을 따른다.

## 완료 기준과 범위

- 실제 패키지의 실행 export·반환 핸들·타입 선언에 채택한 이름을 적용하고 이전 별칭을 제거한다.
- Svelte 단일 import 예제와 바닐라 playground가 같은 core를 실행한다. JSON DSL·수명·취소·초기 완료의 의미를 보존한다.
- Node 22/24의 core 인수 대응, 실제 Chromium, 엄격한 타입 검사와 독립 tarball 소비자 검증을 통과한다. 두 Node 빌드 산출물의 동일성을 비교한다.
- 기존 실험·이전 검증 기록은 보존하고 새 결과·소스/산출물 해시를 별도 기록한다. 커밋·push·발행은 수행하지 않는다.

## 실행 API 이행표

| 적용 대상 | 이전 이름 | 현재 이름 |
|---|---|---|
| Registry | `registerComponent` | `registerComponentContract` |
| Runtime | `mount` | `createView` |
| createView/update/replace 결과, Svelte mount 결과 | `initial` | `initialComplete` |
| Svelte RenderAttachment/MountedView, ViewstemView instance | `settled()` | `whenRendered()` |
| core/cel | `celLimits` | `defaultCelLimits` |
| View/StateHandle/QueryHandle | `snapshot()` | `getSnapshot()` |
| StateStore/UrlConnection | `diagnostics()` | `getDiagnostics()` |
| core Grid 계산 함수 | `gridLayout` | `computeGridLayout` |
| Registry | `export` | `exportResource` |
| Runtime | `describeResource` | `exportResource` |
| StateStore | `batch` | `writeBatch` |
| StateStore | `reaction` | `registerReaction` |

Svelte `renderer.mount`와 `renderer.registerComponent`는 유지한다. 전자는 DOM에 View를 생성·연결하고 후자는 실제 Svelte 구현을 등록한다. Registry에는 공개 계약만 등록한다. State 선언의 JSON 필드 `initial`도 유지한다.

## 공개 타입 이행표

| 이전 이름 | 현재 이름 |
|---|---|
| `ActionObservation` | `ActionSnapshot` |
| `NativeAction` | `ActionHandler` |
| `NativeContext` | `ActionContext` |
| `NativeActionSpec` | `CodeActionSpec` |
| `NativeActionDefinition` | `CodeActionDefinition` |
| `Scope` | `StateScope` |
| `ViewHandle` | `View`로 통일, 중복 별칭 제거 |
| Svelte `Adapter` | `ComponentAdapter` |
| Svelte `AdapterProps` | `ComponentAdapterProps` |
| Svelte `RenderedView` | `MountedView` |
| Svelte `ErrorListener` | `RendererErrorListener` |
| Svelte `Fallback` | `RenderFallback` |

다른 타입 이름과 DSL 필드는 유지한다. core 루트 실행 export는 5개, HTTP는 1개, CEL은 3개, Svelte는 3개다. 공개 타입은 core 71개, HTTP/CEL 각 4개, Svelte 81개이며 재노출 중복을 제외한 고유 타입은 85개다. 정확한 선언은 각 패키지의 공개 진입점이 소유한다.

## 유지하는 동작

`initialComplete`는 적용 세대에 묶인 Promise다. core에서는 실행 가능한 첫 Query들의 성공/개별 오류가 확정되면 완료하며 입력 미준비·닫힌 gate는 완료를 막지 않는다. Query 오류는 `(await initialComplete).queryErrors`에 들어간다. 다음 적용·폐기로 이전 세대가 완료할 수 없으면 CANCELLED다. Svelte는 해당 projection의 DOM 반영까지 포함한다.

`whenRendered()`는 현재 projection의 DOM 반영만 기다린다. 새 Query나 모든 비동기 작업, 브라우저 paint 완료 신호가 아니다. `attach`는 빌린 View를 보존하고 `mount`는 소유 View를 정리한다. 외부 Store·Runtime 소유권과 부모 Action의 하위 취소 계약을 유지한다.

`writeBatch`는 State 쓰기 배열, `transaction`은 동기 원자 callback이다. `registerReaction`은 고정 watch/target/value를 등록하고 해제 함수를 반환한다. `exportResource`는 리소스 정의의 분리된 복사본이며 View의 `exportDefinition`은 ViewSpec을 반환한다. `defaultCelLimits`는 변경 불가능한 기본값이고 평가기별 limits 설정은 별도로 적용된다.

## 검증과 증거

최종 실행 수·환경·해시·명령은 [U42 검증 JSON](public-api-naming-verification-results.json)이 소유한다. core 인수 216개와 선택 차트 후속 8개의 구분은 [인수 대응표](core-acceptance-coverage.json)를 유지한다. 기존 테스트 이름·기대 의미는 보존하고 실제 제품 API 호출을 새 이름으로 이행했다.

공개 경계 테스트는 이전 값 export/타입 import/메서드/완료 필드를 거절하고 새 이름을 허용한다. createView/update/replace의 정확한 반환 키, State `initial` 유지, Query/State/URL 핸들 표면, 복사된 리소스의 격리도 검사한다. 기존 완료·Query 실패·입력 대기·세대 교체·취소 테스트를 같은 제품에 재실행한다.

로컬 원시 증거는 `packages/core/test/results/api-naming/` 및 `packages/svelte/test/results/api-naming/`에 있다. 수정 전 U41 결과·소스 해시는 `packages/core/test/results/before-api-naming/`에 별도 보존했다. 이행 중 실패도 보존한다. 첫 playground 검사에서 잘못 바뀐 내부 DOM ID를 발견해 원래 ID로 복구했고, 같은 전체 41개 브라우저 흐름을 다시 검증했다. 이전 실험 코드와 원래 인수 목록은 수정하지 않았다.

## 호환성과 남은 제한

이전 SDK 이름을 쓰는 로컬 소비자는 위 이행표대로 수정해야 한다. 현재 저장소의 0.1.0은 공개 발행 기록이 아니며 호환 별칭을 추가하지 않았다. JSON 리소스는 이름 변경 대상이 아니다. HTTP/CEL 공유 chunk와 하나의 값/State 엔진을 유지한다.

SSR/hydration, 기본 UI kit·테마 자동 등록, React/Dart/Flutter, 선택 차트는 이번 범위가 아니다. Svelte는 클라이언트 렌더러이며 실제 서비스의 인증·저장·배포는 호스트 책임이다. API 이름 변경은 기능 지원 범위를 늘리거나 검증된 환경 밖의 보장을 추가하지 않는다.
