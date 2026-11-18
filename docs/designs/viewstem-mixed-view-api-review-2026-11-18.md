# Viewstem 혼합 View 공개 API EGM 리뷰

2026-11-18 · 기본 UI 버튼과 직접 작성한 Svelte 컴포넌트가 한 View에 있고, 버튼이 등록된 코드 Action을 실행해 View State를 갱신하는 흐름을 검토했다. [이전 공개 API 리뷰](viewstem-public-api-review-2026-11-16.md) 이후의 구현을 기준으로 삼았다.

## 판단

기본 UI와 사용자 구현을 리소스 셋으로 함께 등록하고, View가 ID로 참조하는 구조는 적절하다. 두 컴포넌트가 사용하는 State의 소유자가 View 한 곳에 있고, Action도 Svelte 수명에 묶이지 않는다. 첫 소비자가 겪는 주요 마찰은 **문제가 생긴 연결을 찾기 어렵고, 이미 선언한 Svelte 입력 타입을 다시 확인해야 한다는 점**이다.

**먼저 혼합 실행 예제와 오류 위치를 개선하고, 다음 공개 API 변경은 계약에서 Svelte 입력 타입을 추론하는 데 쓰는 것을 권한다.** 루트 배열과 TypeScript 전용 View 작성 도구는 각각의 필요성을 따로 확인할 수 있다.

## 1. 오타가 난 위치를 찾기 어렵다 · 우선 개선

브라우저에서 정상 예제의 선언을 한 곳씩 변경했다. `ViewSpec`을 사용하는 TypeScript에서도 Action ID, Component ID, 이벤트 이름, State 경로 오타를 허용했다. 등록된 셋과 외부 JSON을 런타임에 조합할 수 있으므로 실행 시 검증에서도 작성 위치를 알려주는 것이 중요하다. 아래 표는 D163 구현 전 검증 결과다.

| 변경 | `ready` / `whenRendered()` | 소비자가 받는 진단 |
| --- | --- | --- |
| `actionRef: 'incremnt'` | 둘 다 거절 | `prepare / REFERENCE_NOT_FOUND`. 참조 종류, ID, 선언 위치 없음 |
| `componentRef: 'demo.Countr'` | 둘 다 거절 | 위와 같은 오류 |
| `on.clik` | 둘 다 거절 | `prepare / INVALID_DEFINITION`. 이벤트 이름과 선언 위치 없음 |
| Action의 State 경로 `/states/coutn` | 둘 다 거절 | `prepare / INVALID_DEFINITION`. 입력 이름과 선언 위치 없음 |
| 카운터의 Value 경로 `/states/coutn` | 둘 다 완료. 화면에 `현재 값 …`와 버튼 표시 | `node / REFERENCE_NOT_FOUND`. `nodeId: 'counter'`와 `input: 'count'` 제공 |
| 카운터의 Value가 문자열 State를 참조 | 둘 다 완료. 화면에 `현재 값 …`와 버튼 표시 | `node / TYPE_MISMATCH`. 노드와 입력 이름 제공 |
| 카운터의 Value에 문자열 리터럴 제공 | 둘 다 거절 | `prepare / INVALID_DEFINITION`. 컴포넌트 ID와 입력 이름 제공 |

**제안.** 기존 `PublicError.location`을 활용해 선언의 JSON Pointer를 전달하고, 누락된 참조의 종류나 지원되지 않는 이벤트 이름을 메시지로 알려준다. 예를 들어 위 Action 오타는 `/render/slots/default/1/on/click/actionRef`를 가리킬 수 있다. 노드 진단은 선언에서 결정할 수 있는 위치에 노드 ID와 포트 이름을 함께 전달한다. 재사용 Component 내부라면 오류의 경로 기준이 해당 정의라는 점도 식별할 수 있어야 한다. 구조와 참조를 검사하는 코드에서 작성 위치를 전달하면, 진단 스키마 추가 없이 TS와 JSON 모두 개선된다. [공개 오류 계약](../spec/07-host-integration.md#공통-오류와-진단) · [참조 검사](../../packages/core/src/registry.mjs#L320) · [노드 및 이벤트 검사](../../packages/core/src/registry.mjs#L542)

렌더러는 잘못된 입력의 오류 상태도 화면으로 그릴 수 있다. 위 Value 경로 오류에서 두 대기가 완료된 것은 당시 동작과 일치한다. 후속 논의에서는 선언에 없는 참조를 준비 단계에서 위치와 함께 거절하고, 열린 View의 화면과 State를 보존하기로 결정했다. 선언된 State의 값이 아직 없으면 해당 노드가 대기한다. 혼합 예제의 가이드에는 초기 View 준비 오류, 노드 입력 진단, 연결자 렌더 실패, 클릭 후 Action 실패의 관찰 방법을 보여준다. [확정된 D163](../spec/12-resource-sets-browser.md#실패-경계) · [렌더러 진단](../../apps/docs/src/content/docs/ko/docs/svelte/errors.md) · [노드 투영](../../packages/core/src/runtime.mjs#L469)

## 2. Svelte 입력을 계약에서 추론할 수 없다 · 공개 타입 개선

후속 논의에서 같은 Component 계약으로 Svelte 입력 타입을 추론하고 등록 시 검사하기로 결정했다. 준비된 필수 Value는 존재하며, 대기 중에는 값이 없거나 이전에 표시한 값이 남을 수 있다. [확정된 D162](../spec/12-resource-sets-browser.md#svelte-어댑터-입력-타입)

카운터와 Action은 모두 `{ '@path': '/states/count' }`를 받는다. 참조의 해석은 받는 쪽의 포트가 정한다.

| 받는 포트 | 전달되는 것 | 소비자 코드 |
| --- | --- | --- |
| 카운터의 `Value` | 평가된 현재 값. 실행 시 정수 스키마로 검증 | `ComponentAdapterProps.inputs.count`는 TS에서 `unknown`. `typeof` 검사 후 사용 |
| Action의 `State` | 쓰기 대상을 나타내는 `StateHandle<number>` | `defineCodeAction()`이 핸들 타입을 추론. `read()`는 값이 없을 수 있어 `number \| undefined` |

`required: true`인 State 입력은 핸들이 필요하다는 뜻이다. 검증용으로 `initial`을 생략하자, 카운터의 Value 입력은 준비를 기다렸고 Action은 존재하는 State 핸들에 `1`을 쓸 수 있었다. 원래 초기값이 `0`인 예제에서 `read() ?? 0`은 값이 비어 있을 때의 Action 정책을 표현한다. 타입에서 모든 필수 State를 값이 있는 State로 좁히면 이 동작을 표현할 수 없다. [포트 연결](../../packages/core/src/runtime.mjs#L332) · [StateHandle과 스키마 추론](../../packages/core/src/index.d.ts#L24)

**제안.** 코드형 Component 계약 객체를 파일에서 한 번 정의하고, `svelteComponent()`에 등록할 때와 어댑터의 타입을 선언할 때 그 객체를 공유할 수 있게 한다. 먼저 현재 Action에서 쓰는 포트 추론을 재사용할 수 있는 범위를 확인한다. 아래 타입 형태는 논의용이다.

```ts
// 리소스 등록 코드에서 공유한 계약으로 컴포넌트를 연결
const counter = svelteComponent(counterContract, Counter);

// Counter.svelte에서 같은 계약의 타입을 import해 사용
let { node }: ComponentAdapterProps<typeof counterContract> = $props();

if (node.status === 'ready') {
  node.inputs.count.toFixed(); // number로 추론
}
```

타입 인자를 생략하는 기존 어댑터도 계속 사용할 수 있어야 한다. 새 방식은 등록 계약과 어댑터 타입이 어긋날 때 컴파일 단계에서 잡고, 준비된 필수 Value를 좁힌다. 선택 포트와 준비 중 값은 없을 수 있으며, State 포트는 그대로 핸들을 전달한다. `typeRef`에 연결된 스키마는 Registry에서 해석하므로 명시 타입이나 `unknown`으로 처리할 규칙이 필요하다. 검증 사례에는 외부 패키지의 선언 파일 생성, 문자열 포트를 숫자로 받는 어댑터의 거절, 동일 노드가 `ready → pending → ready`에서 유지되는 경우를 넣는다. [현재 어댑터 타입](../../packages/svelte/src/lib/types.ts#L5) · [Svelte 컴포넌트 등록](../../packages/svelte/src/lib/renderer.ts#L12) · [Svelte 공식 TypeScript 안내](https://svelte.dev/docs/svelte/typescript)

예제는 정수 스키마 객체 하나를 세 곳에서 재사용한다. 각 위치의 선언은 View의 저장 값, 카운터의 읽을 값, Action의 쓰기 대상이라는 별도 계약이다. 여러 리소스 셋이 타입을 공유할 때는 기존 `typeRef`도 선택지다. 작은 예제에서 같은 스키마를 쓴다는 이유로 세 계약을 하나의 View 내부 타입에 결합하면, 카운터와 Action의 독립 등록에 제약이 생긴다. [포트 계약](../VIEWSTEM-SPEC.md) · [코드 Action 계약](../spec/04-action.md)

TS 객체에 작성한 `actionRef`까지 자동완성하려면 기본 UI 카탈로그와 의존 셋을 포함해 리소스 ID가 리터럴 타입으로 보존되어야 한다. 직접 작성하는 팀에서 이 요구가 반복되면 선택형 TS 검사도 검토할 수 있다. 외부에서 받은 JSON은 1번의 런타임 진단을 활용할 수 있다.

## 3. 첫 예제에서 보여줄 경로를 줄인다 · 가이드 개선

첫 사용자는 **어디에 등록하는지, 어디에 화면을 쓰는지, 무엇을 기다리는지**를 먼저 알아야 한다. 세 가지를 한 실행 예제로 보여주면 기존 메서드만으로 설명할 수 있다.

- 혼합 예제에 `src/main.ts`, `src/Counter.svelte`, `index.html`의 위치와 `.svelte`를 컴파일하는 클라이언트 환경을 적는다. Node와 Svelte 버전, Core·DOM·Svelte·UI 로컬 패키지 설치는 설치 문서로 연결한다. `dependencies: [ui]`로 기본 UI도 함께 등록되며, 스타일을 적용하려면 CSS import와 `data-viewstem-ui` 스코프를 사용한다고 설명한다. [설치](../../apps/docs/src/content/docs/ko/docs/installation/index.md) · [기본 UI 마운트](../../apps/docs/src/content/docs/ko/docs/ui/guides/mount-in-browser.md)
- `shadcn.Button`이 `click`을 제공하고, `on.click.inputs.count`가 View State에 명시적으로 연결된다는 점을 코드 옆에 적는다. 실행 검증에서는 클릭 이후 바뀐 화면 문구나 State를 기다려 결과를 확인한다. 클릭 직후 `whenRendered()`를 호출하면 그때에는 Action의 새 투영이 아직 없을 수 있다. [기본 UI 이벤트 전달](../../packages/ui/src/components.ts#L183) · [독립 소비자 검증 사례](../../packages/dom/test/fixtures/public-consumer/main.ts#L48)
- DOM 컨테이너에 붙이는 예제는 `await screen.whenRendered()` 하나로 첫 표시를 기다린다. 이 메서드는 준비를 내부에서 기다린다. View를 코드로 조회하거나 조작할 때 `await screen.ready`를 추가한다. 화면을 닫을 때 `screen.unmount()`, 앱이 만든 렌더러를 더 이상 사용하지 않을 때 `renderer.dispose()`를 호출한다. 기존 Svelte 앱 내부에서는 `<ViewstemView {renderer} {source} />`를 사용해 마운트 요소를 직접 찾는 단계를 줄일 수 있다. [공통 표시 핸들](../../packages/core/src/renderer.mjs#L202) · [Svelte 앱 진입점](../../apps/docs/src/content/docs/ko/docs/svelte/guides/mount-in-svelte.md)

## 4. 단일 루트는 실제 배치 제약이다 · 후속 검토

카운터와 버튼을 형제로 두려면 현재 `render`에 단일 부모 노드를 써야 한다. 예제의 `shadcn.Card.Root`는 스타일 있는 실제 `div`를 추가한다. 카드가 의도된 화면이면 자연스러운 선택이다. 원하는 의미의 부모 요소가 따로 있는 화면에서는 그 요소를 만드는 컴포넌트를 등록해 슬롯을 제공할 수 있다. Svelte 어댑터의 `renderSlot()`도 실제 `display: contents` 요소를 추가하므로 직접 자식 선택자나 HTML 구조 제약이 있는 슬롯은 해당 요소에 `provideSlot()`을 사용할 수 있다. [루트와 슬롯 계약](../spec/05-component-view.md#106-view-화면-구성과-인스턴스) · [기본 카드 정의](../../packages/ui/src/static-catalog.ts#L25) · [Svelte 슬롯 구현](../../packages/svelte/src/lib/SlotOutlet.svelte#L6)

후속 논의에서 첫 버전은 단일 루트를 유지하기로 결정했다. 여러 컴포넌트를 호스트 요소의 직접 자식으로 배치해야 하는 사용 사례가 생기면 `ViewSpec.render`에 배열을 허용하는 안을 검토한다. 그때 작성 순서, 노드 ID와 수명, 한 루트가 실패했을 때 형제 표시, 헤드리스 스냅샷을 검증한다. [확정된 D164](../spec/05-component-view.md#106-view-화면-구성과-인스턴스) · [Puck 루트 구성](https://puckeditor.com/docs/integrating-puck/root-configuration) · [React Fragment](https://react.dev/reference/react/Fragment)

## 공식 레퍼런스에서 확인한 설계

| 레퍼런스 | 실제 API | Viewstem에 적용할 판단 |
| --- | --- | --- |
| [Puck Component 설정](https://puckeditor.com/docs/integrating-puck/component-configuration) · [Slot](https://puckeditor.com/docs/api-reference/fields/slot) | 구현은 이름이 있는 `Config`에 제공하고 저장되는 데이터는 이름으로 참조한다. `Config<Props>`와 `Slot`이 작성 시점의 타입을 제공한다. | 데이터와 구현의 경계는 합리적이다. 어댑터 입력을 등록 계약과 연결하는 방향이 적합하다. Puck은 React 편집기라 Viewstem의 런타임 Action 권한과 수명에 대한 비교 근거는 제한적이다. |
| [JSON Forms Controls](https://jsonforms.io/docs/uischema/controls) · [Custom Renderers](https://jsonforms.io/docs/tutorial/custom-renderers/) | 기본 렌더러와 커스텀 렌더러를 함께 전달한다. `scope`로 데이터를 가리키고 커스텀 컨트롤에는 값과 `handleChange`가 제공된다. | 명시 등록과 경로 바인딩은 익숙한 형태다. Viewstem은 읽기 값과 쓰기 핸들이 받을 포트에 따라 달라지므로 예제가 그 차이를 가르쳐야 한다. |
| [XState v5 setup](https://stately.ai/docs/xstate/v5/setup) | `setup()`에서 이름 있는 Action과 context·event 타입을 제공하고, 머신은 이름으로 사용한다. | Action을 독립 계약으로 선언하고 재사용하는 방향에 근거가 있다. 타입 지원이 코드 Action의 구현에 그치지 않고 이를 연결하는 작성 단계에도 이어질 때 오류를 더 빨리 발견할 수 있다. |
| [Svelte TypeScript](https://svelte.dev/docs/svelte/typescript) · [tRPC Validators](https://trpc.io/docs/server/validators) | Svelte는 일반 props를 정적 타입으로 선언할 수 있고 tRPC는 런타임 검증 계약으로부터 타입을 추론한다. | Svelte 화면 상태를 고려해 스키마에서 타입을 한 번 파생시키는 방향이 적합하다. 타입 추론은 Viewstem의 실행 시 검증과 함께 작동해야 한다. |

## 검증과 리뷰 근거

- **실행 확인.** 작업 트리의 빌드 산출물과 공개 import로 세 파일을 임시 소비자 환경에 구성했다. Svelte 5.57.3의 `svelte-check`는 원본 예제에서 오류와 경고가 각각 0개였다. 오타 변형 네 종을 검사했을 때 `read()`에 바로 `1`을 더한 별도 변형만 의도한 타입 오류를 냈다. Node 24.19.0에서 실행한 Chromium 검증은 첫 표시가 `0`이고 기본 버튼의 클릭과 Enter로 각각 `1`, `2`가 되는 것을 확인했다. View의 State도 `2`였고 화면을 닫은 뒤 표시가 정리됐다. 위 오류 사례에는 초기 대기와 `onError`를 함께 기록했다.
- **독립 이해도 리뷰.** 예제만 읽은 Goldfish는 상태 갱신 흐름을 설명할 수 있었다. 같은 참조의 Value·State 차이, 버튼 이벤트의 출처, 필요한 패키지와 빌드 환경, `ready`와 `whenRendered()` 차이는 코드만으로 판단하기 어려웠다.
- **독립 설계 리뷰.** 명세와 코드를 대조한 Goldfish는 타입 추론의 비대칭, 단일 루트와 슬롯의 실제 DOM 비용, 불필요한 초기 대기 중복을 확인했다. 한 State 갱신에서 큰 혼합 트리에 드는 비용은 이번에 측정하지 않았다.
- **독립 구현 검증.** 공개 Core·UI API와 Svelte 바인딩 대역으로 클릭이 카운터의 값 투영을 갱신하는 것을 별도로 확인했다. 초기값이 없을 때 State 핸들과 Value의 차이 및 State 스키마 불일치에 따른 준비 실패도 재현했다. 이 확인은 위의 Chromium 실행과 별개의 프로브다.

이 보고서는 실행된 카운터와 그 오류 변형에 대한 검증이다. 제안한 입력 타입과 진단 개선은 설계안이다.
