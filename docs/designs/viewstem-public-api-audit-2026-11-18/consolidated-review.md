# Viewstem 공개 API EGM 재리뷰

**현재 API는 확장 지점이 분명하지만, Svelte에서 화면 하나를 여는 데 필요한 소유권 지식이 과하다.** `ViewstemView`가 이미 View를 만들고 정리하는데, 소비자는 렌더러와 Runtime의 소유권을 별도로 판단하고, Registry를 찾아 셋을 등록하고, Svelte 종료 훅에서 비동기 정리 오류를 다뤄야 한다. 공유 Runtime이나 여러 렌더러를 운용할 때는 이 제어권이 필요하다. 첫 화면에도 같은 단계가 필수인 구성이 문제다.

또한 API를 그대로 사용해도 입력 타입, 필수 호스트 기능과 오류 관찰이 등록·표시 경로에 따라 달라졌다. 이런 문제는 사용 예제를 간결하게 만드는 것과 별개로 먼저 바로잡아야 한다.

[함수별 판정](callable-review.md) · [검토 기준 인터페이스](reviewed-interface.md) · [독립 검토와 실행 근거](review-evidence.md)

## 우선 수정할 계약 문제

| 우선순위 | 공개 호출 | 확인한 동작 | 제안 |
| --- | --- | --- | --- |
| 높음 | `Registry.updateResource`, `svelteComponent` | 필수 문자열 포트의 계약을 숫자로 갱신하면 새 View가 숫자 입력을 준비하면서 여전히 이전 구현을 쓴다. 열린 View는 이전 계약을 유지한다. 공개 Core API로 이전·신규 계약과 구현 동일성을 확인했다. | 구현을 보존하는 변경은 포트·슬롯·이벤트 및 참조 Type 계약의 호환성을 검사한다. 비호환이면 계약과 구현을 함께 명시적으로 제출하는 경로를 안내한다. [Registry](../../../packages/core/src/registry.mjs#L265) |
| 높음 | `defineCodeAction().implement`, `Registry.registerAction` | `requires: ['storage']`인 엔트리를 셋에 넣으면 기능 누락으로 거절된다. 공개 직접 등록 함수에 엔트리의 정의와 구현을 나눠 넘기면 같은 호출이 성공한다. Node에서 재현했다. | 작성된 엔트리의 기본 등록 경로를 셋으로 명확히 한다. 직접 등록도 작성 엔트리를 지원하려면 세 필드를 함께 받는 `registerAction(entry)`로 같은 검사 경로를 사용한다. 독립 등록 요구가 없다면 새 오버로드 없이 문서와 예제부터 정리할 수 있다. [등록 구현](../../../packages/core/src/registry.mjs#L206) |
| 높음 | `ViewstemView.onError`, `Renderer.dispose` | 동일 콜백을 렌더러와 화면에 넣으면 한 Query 실패를 두 번 받고, 콜백의 Promise 거절이 브라우저에 노출된다. 별도 사례에서 화면을 내릴 때 연결자의 정리 거절이 `onError`나 후속 렌더러 `dispose()`에 나타나지 않았다. Chromium에서 재현했다. | 동일 관찰자의 원래 참조와 반환 Promise를 진단 계층에 전달한다. 자동 정리 오류의 관찰 경로를 정하고, Renderer가 소유 Runtime의 정리도 끝까지 기다리는지 검사한다. [화면 연결](../../../packages/svelte/src/lib/Display.svelte#L23) · [Svelte 렌더러](../../../packages/svelte/src/lib/renderer.ts#L97) · [진단 전달](../../../packages/core/src/diagnostics.mjs#L13) |
| 높음 | `StateStore.transaction`, `UrlConnection.removeOwned` | 한 트랜잭션에서 셀을 교체하고 새 핸들에 쓰면 구독 결과가 `updated`가 된다. reaction 대상의 명시적 쓰기가 호출 순서에 따라 덮이고, 병합된 추가 이벤트는 수정 가능하다. URL 키 `a`만 제거할 때 비동기 어댑터의 대기 중 `b` 쓰기도 유실됐다. Node에서 재현했다. | 트랜잭션 단위로 교체·명시 쓰기·관찰 불변성을 보존한다. 선택 제거의 대상 밖에 있는 대기 키는 새 유효성 검사 아래 전달한다. [State 병합](../../../packages/core/src/state.mjs#L104) · [URL 제거](../../../packages/core/src/url.mjs#L300) · [명세](../../spec/09-preserved-contracts.md) |
| 높음 | `Runtime.createView` 시작 예제 | 한·영 headless 가이드 2종의 최초 실행 블록 4개가 모두 `REFERENCE_NOT_FOUND`로 중단된다. `Label` 또는 `Empty`의 Component 계약만 등록해 prepared View가 요구하는 바인딩이 없다. | Core README처럼 투영용 구현을 명시해 예제를 실행 가능하게 한다. headless에서도 바인딩을 요구하는 현재 준비 규칙은 별도로 설명한다. [Runtime 가이드](../../../apps/docs/src/content/docs/docs/core/guides/runtime.md) · [HTTP·Action 가이드](../../../apps/docs/src/content/docs/docs/core/guides/http-and-actions.md) · [실행 가능한 Core 예제](../../../packages/core/README.md) |
| 중간 | `View.subscribe`, `subscribeRenderProjection` | 최초 콜백이 던지면 해제 함수를 받지 못해도 구독이 살아 있다. 투영 구독은 전달 중 재진입에 같은 투영을 두 번 받을 수 있으며 닫힌 View에서도 한 번 재생한다. 공개 Core 호출로 재현했다. | 최초 호출 실패 시 등록을 되돌리고, 전달 중 등록과 폐기 후 등록의 규칙을 정의한다. [최초 투영 구독](../../../packages/core/src/runtime.mjs#L284) · [투영 게시](../../../packages/core/src/runtime.mjs#L617) · [View 구독](../../../packages/core/src/runtime.mjs#L900) |
| 중간 | `RuntimeSettings.resourceResolver` | JS에서 `undefined`는 누락 결과로 처리되지만 선언상 TS에서 반환할 수 없다. `createView`·`replace`는 누락 정의를 탐색하고, `updateDefinition`·`applyResourceSets`·독립 Action 호출은 각 저장소에서 찾는다. | 누락 반환값을 타입과 예제에 명시하고 실제 적용 범위를 일치시킨다. 다른 호출에 I/O를 도입할 때는 취소와 게시 의미를 따로 다룬다. [공개 타입](../../../packages/core/src/index.d.ts#L269) · [조회 실행](../../../packages/core/src/runtime.mjs#L86) · [호스트 명세](../../spec/07-host-integration.md#L99) |
| 중간 | `defineResourceSet`, `Registry.registerResourceSet` | 같은 선언 객체를 재등록하는 것은 허용된다. 같은 ID의 새 선언은 버전이 같아도 충돌한다. 다른 물리적 Core 모듈로 정의한 셋은 ID가 달라도 일반 `INVALID_DEFINITION`을 낸다. 두 모듈 복사본으로 확인했다. | 독립 셋 작성자가 앱과 Core를 공유하도록 peer dependency와 번들 외부화 방법을 설명한다. 진단에서 선언 충돌과 셋 출처 불일치 가능성을 구분한다. 별도로 설치한 소비자와 작성자 패키지로 검증한다. [셋 검증](../../../packages/core/src/resource-set.mjs#L4) · [등록 충돌](../../../packages/core/src/registry.mjs#L234) · [npm peerDependencies](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#peerdependencies) |

그 밖에 Action 포트의 `QueryHandle.refresh/retry`가 취소 이후 Promise를 반환하기 전에 던지는 문제, `connectClock`의 오래된 핸들 구독, HTTP 시계 정리가 확정 결과를 덮는 문제를 소스로 확인했다. URL 준비 실패 관찰, Grid 중복 주소, CEL 예약 이름도 공개 계약을 구체화할 대상이다. 각 호출의 근거와 검증 수준을 별도로 기록했다. [함수별 판정](callable-review.md) · [검증 근거](review-evidence.md)

## Svelte 기본 경로 추천

**독립 화면의 권장안은 기존 `ViewstemView`에 소유 모드를 더하는 것이다.** 아래는 동작을 바꾼다는 전제의 제안이다. 명시적으로 가져온 셋을 등록하고 CSS 범위는 앱이 선택한다.

```svelte
<script lang="ts">
  import { ViewstemView, type ViewSpec } from '@viewstem/svelte';
  import { ui } from '@viewstem/ui';
  import '@viewstem/ui/styles.css';

  const source = {
    render: {
      id: 'save',
      componentRef: 'shadcn.Button',
      inputs: { text: '저장' },
    },
  } satisfies ViewSpec;
</script>

<div data-viewstem-ui>
  <ViewstemView {source} resourceSets={[ui]} />
</div>
```

| 대안 | 편의성 | 예측 가능성과 확장 비용 |
| --- | --- | --- |
| 현재 API를 유지하고 공유 렌더러 가이드 개선 | 화면이 여러 개인 앱에서는 렌더러 생성과 정리를 앱 경계에 한 번 둘 수 있다. | 새 API 비용이 없다. 단독 화면에서도 소비자가 네 개의 객체와 정리 시점을 이해해야 한다. |
| 새 Runtime을 생성할 때 초기 셋을 팩토리 옵션으로 등록 | `createRuntime({ resourceSets })` 또는 해당 Svelte 렌더러 옵션으로 설정이 한 곳에 모인다. Core·DOM 통합에도 적용할 수 있다. | 독립 화면의 렌더러 생성과 정리 단계는 그대로다. Registry가 주입된 경우의 변경 의미도 추가로 정의해야 한다. |
| `ViewstemView {source} resourceSets={…}`의 화면 소유 모드 | 셋과 source만으로 등록·렌더·정리를 각 컴포넌트 수명에 연결한다. | 형제 화면마다 Runtime이 생긴다. 공유 서비스, URL 예약 또는 화면 단위 이상의 제어가 필요하면 앱 소유 렌더러를 전달하는 경로가 적합하다. 초기·종료 오류가 흩어지면 사용성이 오히려 나빠진다. |

출시 조건은 브라우저 마운트 시점에 셋을 등록하고 준비가 시작되는 것, 준비 중 화면을 내리면 후보를 취소하고 정리를 한 번만 하는 것, 셋 등록 충돌과 준비·표시·정리 오류를 일관된 경로에서 관찰할 수 있는 것이다. Svelte에서는 props 변경이 보통 화면에 반영된다. 이 모드의 `source`, `inputs`, `resourceSets`는 기존 `source` 모드처럼 최초 설정이다. 렌더마다 새 배열이 넘어와도 셋을 다시 등록하지 않는다. 새 설정으로 화면을 다시 만들려면 `{#key}`를 사용하고, 현재 View의 수명을 유지하며 변경하려면 View를 명시적으로 소유해 적용 메서드를 쓴다. 공식 혼합 예제에서 독립 화면과 공유 렌더러를 각각 실행해 이 경계를 확인하는 조건으로 추천한다. 광범위한 팩토리 옵션과 별도 provider API까지 동시에 추가할 근거는 현재 확인하지 못했다. [현재 소유 설정](../../../packages/svelte/src/lib/ViewstemView.svelte#L12) · [Svelte 수명 훅](https://svelte.dev/docs/svelte/lifecycle-hooks) · [Svelte props](https://svelte.dev/docs/svelte/$props) · [Vue app.use와 app.unmount](https://vuejs.org/api/application.html#app-use) · [Redux Toolkit configureStore](https://redux-toolkit.js.org/api/configurestore/)

## 유지할 구분과 뒤로 미룰 제안

- **Registry 등록과 열린 View 적용.** `registerResourceSet`은 이후 구성에 발행하고 `view.applyResourceSets`는 열린 화면에 영향을 준다. 동작이 다른 공개 호출이다. `updateDefinition`, `applyResourceSets`, `replace`, `setInputs`가 커밋 전 같은 최신 요청 우선 큐를 타는 사실은 현재 문서에서 찾기 어렵다. 특히 `setInputs`가 resolver 대기 중 `replace`를 대체할 수 있는 순서와 취소 신호를 표로 제공한다. [변경 큐](../../../packages/core/src/runtime.mjs#L800)
- **준비, 렌더, Query 완료.** `mount().ready`는 View를 얻는 시점이고, `whenRendered()`는 표시 연결의 렌더 결과를 기다린다. `view.whenSettled(application)`은 해당 적용의 Query 보고를 기다리고 표시 핸들의 `whenSettled(application)`은 표시 반영도 기다린다. 현재 Svelte `source` 모드는 적용 토큰을 얻는 공개 경로가 없다. 토큰이 필요한 예제는 명시적으로 View를 만들고 대여하는 흐름을 보여준다. [Core 렌더러 선언](../../../packages/core/src/renderer.d.ts) · [Svelte 공개 타입](../../../packages/svelte/src/lib/index.ts)
- **코드 작성 타입과 동적 호출.** `defineCodeAction().implement`와 `ComponentAdapterProps<typeof contract>`는 구현 단계에 유효하다. 문자열 `actionRef` 호출은 ID 오타와 잘못된 입력을 컴파일 단계에서 잡지 못하고 결과가 `unknown`이다. 계약 토큰을 받는 선택형 호출은 검토할 가치가 있지만, 먼저 그 토큰이 실제 Runtime·View 스냅샷의 정의와 맞는지 검증할 방법이 필요하다. 등록되지 않은 토큰이나 다른 Registry의 같은 ID를 그대로 신뢰하면 타입만 맞는 코드를 만들 수 있다. tRPC의 공유 타입 패턴은 타입을 전달할 수 있다는 근거이며 Viewstem의 교체·스냅샷 호환성까지 보장하지 않는다. [Core 선언](../../../packages/core/src/index.d.ts) · [tRPC 타입 추론](https://trpc.io/docs/client/vanilla/infer-types) · [tRPC 실행 시 검증](https://trpc.io/docs/server/validators)
- **연결자 확장.** `mount`, `update`, `setPending`, `dispose` 및 선택적 `whenRendered`에는 각각 실제 용도가 있다. 먼저 연결자가 없을 때 요구 ID를 오류에 싣고, DOM 구현의 슬롯·정리 및 제3자 연결자와 기본 연결자를 함께 쓰는 예제를 제공한다. `createRendererHost`와 투영 구독은 독립 호스트 사용 근거가 있다. `createRenderWaiter` 등 세부 도우미에도 동일한 안정성을 약속할지는 호환성 검토가 필요하다. Svelte의 `display: contents` wrapper는 실제 DOM에는 남으므로 README의 wrapper 보장도 수정한다. [DOM 연결자 선언](../../../packages/dom/src/connector.ts) · [Svelte 슬롯 구현](../../../packages/svelte/src/lib/SlotOutlet.svelte) · [Svelte README](../../../packages/svelte/README.ko.md#L66)

## 검토 범위

기준 커밋은 `f5c0785`다. EGM의 초기 관점, 문서 단독 이해도, 설계 비판, 실행 준비성과 대안 반증을 현재 코드와 공개 선언 감사에 맞춰 진행했다. 공개 패키지 진입점의 함수, 반환 핸들 메서드 및 소비자가 넘기는 콜백을 88개 판정 행으로 대조했다. 한 행에 같은 계약이나 함께 쓰는 호출을 묶었다. 실행 검증은 발견 사항과 대표 경로를 대상으로 수행했다. 검토 결과는 설계 제안이며 제품 코드는 변경하지 않았다. [공개 호출 목록](callable-review.md) · [재현 수준과 근거](review-evidence.md)
