# Viewstem 리소스 셋과 혼합 렌더링 상세 구현 계획

기준은 작업 트리의 확정 명세와 결정 이력, 코드 기준 `f367ad42a5b80e56c4168f38bd53a5c73733a7ea`다. API 이름·자료구조·오류 형식은 이 계획에서 선택한 구현안이다. 독립 소비자의 공개 확장 검증은 확정된 수락 조건이다. 코드·패키지·CI 수정과 제품 검증 실행은 구현 단계에서 한다. [확정 명세](../spec/12-resource-sets-browser.md) · [결정 이력](../history/resource-sets-browser-2026-11-16.md) · [구현 인계](../handoff/resource-sets-browser-2026-11-16.md) · [EGM 리뷰](viewstem-resource-sets-review-2026-11-16/consolidated_review_report.md) · [9단계 재리뷰](viewstem-resource-sets-implementation-review-2026-11-16/implementation_readiness_report.md)

2026-11-18 공개 API 후속 변경은 리소스 셋과 혼합 렌더링이 구현된 작업 트리를 기준으로 한다. 코드 Action 작성은 1절, 권한과 호출 취소는 3절, 연결자 완료 대기는 4절에 반영했다. 후속 변경은 [공개 API 후속 구현 순서](#공개-api-후속-구현-순서)의 검증을 단계마다 통과시킨다. [공개 API 리뷰](viewstem-public-api-review-2026-11-16.md#후속-정리)

혼합 카운터 리뷰에서 확정한 D162–D164는 2절의 참조 검증, 5절의 Svelte 입력 타입, 6절의 혼합 예제와 [혼합 View 리뷰 후속 구현 순서](#혼합-view-리뷰-후속-구현-순서)에 반영한다. 이 항목은 후속 구현과 수락 검증의 계획이다. [혼합 View 공개 API 리뷰](viewstem-mixed-view-api-review-2026-11-18.md) · [결정 등록부](../history/decision-register.md)

## 범위와 종료 조건

첫 버전은 Runtime별 저장소와 명시적 공유, 실행 중 셋 원자 등록과 개별 리소스의 명시적 교체, 살아 있는 View에 대한 대상별 추가·교체 및 설정·정의 일괄 확정을 제공한다. DOM과 Svelte 연결자가 하나의 브라우저 노드 조정 경로를 사용한다. 기본 UI는 해당 경로를 이용하는 일반 DOM 셋이다. Patchview는 제품 코드의 의존성 없이 같은 공개 계약으로 작성할 수 있음을 독립 소비자로 검증한다.

첫 검증은 두 방향의 일반 콘텐츠 슬롯, 같은 슬롯의 keyed 이동과 슬롯 교체, 공개 API만 쓰는 외부 연결자, headless Action과 패키지 의존성으로 한정한다. React 제공 연결자, 여러 저장소를 쓰는 단일 Runtime, 기존 저장소 전체의 셋 버전 자동 이행, 범용 hot-swap, 교차 프레임워크 native context, 임의 혼합 compound 구조, portal, SSR·hydration 및 transition은 후속 범위다. 기존 DOM 카탈로그의 단일 DOM 사용은 별도 회귀 기준으로 유지한다.

**D164.** 첫 버전의 View 정의는 `ViewSpec.render`에 단일 `ComponentNode`를 받는다. 혼합 카운터의 공통 부모는 기존 `shadcn.Card.Root`의 `default` 슬롯을 쓴다. 여러 노드를 호스트의 직접 자식으로 배치해야 하는 실제 사용 사례가 생기면 View의 `render` 배열을 검토한다. [View 명세](../spec/05-component-view.md#106-view-화면-구성과-인스턴스)

## 소유권과 데이터 흐름

| 소유자 | 처리하는 결정 | 전달하는 값 |
|---|---|---|
| Core Registry | 공개된 셋과 정의·구현 연결, 사용한 저장소 리비전, 원자 등록과 교체 | 검증된 저장소 상태. 컴포넌트 구현과 연결자 ID는 프레임워크에 독립적인 불투명 값이다. |
| Core Runtime | 기본 Registry 생성 또는 주입, 호스트 기능, resolver·권한·HTTP 실행기, 소유 실행 종료 | View 생성 또는 독립 실행에 필요한 설정. Runtime 종료는 주입한 Registry를 비우지 않는다. |
| Core View | 사용할 리소스 구성, 적용 대기열, View·노드 수명, 변경의 원자 확정 | 한 적용에서 나온 `ViewApplication`과 `NodeSnapshot`. 표시용 내부 읽기 경로가 같은 투영의 구현 연결을 함께 제공한다. |
| Core Query·Action 실행기 | 시작한 실행의 정의·구현, 입력, 캐시·취소 경계 | 해당 실행 수명의 결과와 오류. 같은 수명의 기존 소유자와 Query 사용 인스턴스를 재사용한다. |
| `dom`의 공통 브라우저 기반 | 한 표시 연결의 노드 순서, 슬롯별 배치·이동·교체, 렌더 완료와 진단 | 노드당 배치 위치, 슬롯 등록 콜백, 수명에 묶인 이벤트 함수. |
| DOM·Svelte·외부 연결자 | 자기 구현의 검사, 마운트·입력 갱신·정리, 부모 슬롯 노출 | 마운트 핸들, 슬롯 호스트, 표시 반영 완료 여부. |
| `ui` 및 서비스 셋 | 정의와 구현을 셋으로 제공, 필요한 서비스 기능 선언 | 일반 등록 입력. UI 패키지의 스타일과 지원표는 카탈로그에 남긴다. |

`core`의 `createRendererHost`는 표시 연결 예약·수명, 적용 완료·진단을 맡는 공통 도구로 재사용한다. 타입 선언의 대상 요소를 제네릭 객체로 만들고 실제 `HTMLElement` 유효성 검사는 `dom`에 둔다. 브라우저 전용 형식은 `@viewstem/dom`에서 공개한다. 브라우저 기반은 `NodeSnapshot.slots`를 이름별 콘텐츠로, `children`을 선언형 노드의 투영으로 소비한다. 같은 자식을 두 경로에서 중복 배치하지 않는다. [현행 공통 호스트](../../packages/core/src/renderer.mjs) · [호스트 계약](../spec/07-host-integration.md)

## Detailed Implementation Plan

### 1. Core 리소스 셋과 저장소 게시

주요 수정 경로는 `packages/core/src/registry.mjs`, `api.mjs`, `index.mjs`, `index.d.ts`다. 새 셋 선언 검증과 의존 순회는 `packages/core/src/resource-set.mjs`에 둔다. 기존 `createRegistry()`와 `RuntimeOptions.registry`를 저장소 생성·주입의 진입점으로 쓴다. Registry에 셋 등록 정보와 컴포넌트 구현 연결을 추가하고, 현재 분리된 정의·코드 Action·컴포넌트 연결 정보가 하나의 후보에 들어가게 한다. 저장소를 별도 전역 객체로 복제하지 않는다.

| 공개 표면 제안 | 용도 |
|---|---|
| `defineResourceSet(input): ResourceSet` | 문자열 `id`와 `version`, 선택적인 읽기 전용 `dependencies: ResourceSet[]`, `resources: AnyResource[]`, `actions: CodeActionEntry[]`, `components: ComponentBinding[]`를 받는다. 생략한 배열은 빈 배열로 정규화한다. |
| `defineCodeAction({ definition, requires? })` | 공개 Core 진입점에서 한 Action의 ID와 입출력·필수 기능 계약을 선언한다. 반환값의 `.implement(handler)`가 등록·교체용 엔트리를 만든다. |
| `CodeActionEntry` | `{ definition, implementation, requires? }`다. `definition`은 코드 Action 정의, `implementation`은 해당 입출력 계약의 `ActionHandler`, `requires`는 읽기 전용 문자열 배열이다. 셋 등록과 명시적 교체는 `.implement()`의 결과와 직접 작성한 기존 엔트리를 받는다. |
| `ComponentBinding<T = unknown>` | `{ contract: ComponentContract, connectorId: string, implementation: T }`다. Core는 구현의 참조와 연결자 ID를 보관한다. 브라우저 연결자가 실제 구현을 검사한다. |
| `registry.registerResourceSet(set: ResourceSet): this` | 이미 import된 의존성 폐쇄를 함께 검증하고 게시한다. |
| `registry.replaceResource(entry: ReplaceResourceInput): this` | `resource: AnyResource`, `action: CodeActionEntry`, `component: ComponentBinding` 중 하나만 담은 객체를 받는다. 기존 `(kind, id)`의 항목을 교체한다. |

1. 선언 시 ID와 버전은 비어 있지 않은 문자열로 받고, 배열과 정의 입력을 불변 복사한다. 연결자 ID는 문자열로 보유하고 구현은 신뢰된 실행 값의 참조를 보유한다. 등록은 전달된 선언의 정적 내용과 구조를 검증한다. 연결자 mount·사용자 Action·호스트 기능은 실행하지 않는다.
2. 의존 그래프에서 확인 중인 경로와 완료한 선언을 분리한다. 이미 같은 선언 객체를 처리했다면 재사용하고, 현재 경로에 다시 나타나면 셋 경로를 포함해 거절한다. 첫 버전에서 같은 불변 선언 객체를 동일 셋으로 본다. 다른 객체가 같은 셋 ID를 사용하면 두 버전을 포함해 `INVALID_DEFINITION`으로 진단한다. 정상 `defineResourceSet()` 경로는 이미 생성한 불변 셋만 의존하므로, 순환 방어는 내부 순회기에 잘못 만든 순환 입력을 전달해 검증한다.
3. 모든 셋의 정의와 바인딩을 후보에 먼저 적재한 뒤 Registry의 전체 참조·타입·순환 검증을 한 번 적용한다. `(kind, id)`가 다른 정의는 ID 문자열이 같아도 함께 등록된다. 동일 키 중복은 이번 요청을 전체 거절하고, 코드 Component의 정의와 구현·연결자 ID, 코드 Action의 정의와 함수가 함께 게시된다. 한 셋에서 UI 구현을 선언했다면 해당 구현 연결도 후보 검증 대상에 넣는다.
4. Registry 후보에 `셋 ID → { 선언 참조, 의존 셋 ID, 소유 리소스 키 }` 맵과 키별 정의·함수·구현 연결을 함께 둔다. 리소스 키는 현행 `(kind, id)` 키 함수를 사용한다. `fork()`와 `commitCandidate()`는 이 맵을 포함하고 변경하지 않은 값의 참조 동일성을 유지한다. 원래 셋을 다시 만나면 등록을 재사용한다. 적용할 셋의 엔트리는 소유 키로 현재 저장소에서 찾으므로 명시적 교체가 원래 선언으로 되돌아가지 않는다. 모르는 `setIds`나 교체 대상 키는 `REFERENCE_NOT_FOUND`다.
5. 낮은 수준의 직접 등록과 명시적 교체는 같은 후보 검증과 게시를 사용한다. `updateResource(definition)`는 정의 변경 요청으로서 기존 코드 분류·구현·필수 기능을 보존한다. `replaceResource()`는 기존 키의 현재 등록 유형에 맞는 엔트리를 요구하도록 계획한다. 선언형과 코드형을 전환하는 경우는 새 ID로 표현한다. 교체는 변경된 리소스의 의존성을 재검증하고 셋 소유 키를 유지한다. 같은 ID의 코드 Action은 D154의 입출력·해석된 Type 및 필수 기능 이름 집합이 같을 때 함수를 함께 교체한다. 달라진 계약은 `TYPE_CONTRACT_MISMATCH`와 함께 거절하고 새 ID로 등록한다. [현행 Registry](../../packages/core/src/registry.mjs) · [보완된 D154](../spec/04-action.md#코드-action-등록과-갱신)
6. headless와 브라우저 진입점이 같은 제품 계열에 속할 때, 예제는 공통 정의·Action 셋과 UI 확장 셋에 독립 등록 ID를 둔다. UI 확장은 같은 공통 셋 객체를 의존하고 공통 정의를 복제하지 않는다. Node의 공통 진입점은 Core와 공통 셋만 import한다. 별도 패키지와 한 패키지 내 여러 진입점 모두 이 선언 모델을 사용한다.

#### 코드 Action 계약과 구현 작성

1. `resource-set.mjs`에서 코드 Action 정의 복사·동결과 `requires` 검사를 재사용한다. `defineCodeAction()`은 정의와 필수 기능을 캡처하고 `.implement()`는 호출마다 같은 계약과 지정한 함수가 들어 있는 새 엔트리를 만든다. 엔트리 생성은 Registry를 읽거나 변경하지 않는다. `index.mjs`에서 내보내고, 셋 등록과 교체는 현행 엔트리 정규화 및 Registry 후보 검증을 거친다.
2. `index.d.ts`에서 리터럴 스키마는 현재 포트·출력 추론을 사용한다. `typeRef`의 입력·출력은 `defineCodeAction<Inputs, Output>()`으로 지정할 수 있게 한다. `.implement()`는 선언한 계약으로 함수 인자와 반환값을 검사한다. `defineResourceSet()`과 `replaceResource()`는 이때 확정한 타입을 수용하고, 가져온 엔트리의 정의만으로 핸들러 타입을 다시 추론하지 않는다. 기존 인라인 엔트리 추론과 직접 등록에 대한 타입 검증도 유지한다.
3. 소비 예제는 별도 파일에서 계약과 기본 엔트리를 내보내고, 셋에는 기본 엔트리를 넣는다. 교체 경로는 같은 계약을 import해 `.implement(nextHandler)`의 결과를 전달한다. 실제 `typeRef` 해석과 동일 ID 교체의 입출력·필수 기능 비교는 Registry에서 수행한다. [D154](../spec/04-action.md#코드-action-등록과-갱신)

**완료 조건** — Registry 단위 검증에서 셋 등록 도중 정의·함수·컴포넌트 바인딩 일부가 노출되는 시점이 없다. 다이아몬드 의존 재사용, 같은 ID의 다른 종류 공존, 동일 종류 충돌, 같은 코드 Component에 이중 바인딩 충돌, 버전·선언 충돌과 순환을 검증한다. 코드 Action은 같은 계약에서 함수 교체에 성공하고 입력·출력·필수 기능을 각각 바꾼 후보는 거절해 기존 상태를 보존하는지 확인한다. 별도로 생성한 두 Runtime과 같은 Registry를 주입한 두 Runtime을 모두 사용한다.

### 2. View 리소스 적용과 resolver 경합

`packages/core/src/runtime.mjs`, `api.mjs`, `registry.mjs`, `state.mjs`, `url.mjs`, `index.d.ts`를 수정한다. `View.replace()`, `View.update()` 및 StateStore 트랜잭션을 동원하는 `View.build()`·`apply()`가 기존 수명 규칙의 실행 지점이다. `view.applyResourceSets()`는 `Promise<ViewApplication>`을 반환한다. `setIds`는 비어 있지 않은 읽기 전용 문자열 배열이며 같은 셋 ID는 한 번 처리한다. `definition`은 `ViewSpec`, `inputs`와 `states`는 읽기 전용 값 맵, `signal`은 `AbortSignal`이다. 생략한 정의와 입력은 현재 View를 사용한다.

| 경로 | 적용할 구성 | 성공 시 수명의 의미 |
|---|---|---|
| `runtime.createView(source, options)` | 현재 저장소와 허용된 선언형 resolver 결과 | 신규 View 수명. 사용 가능한 정의·바인딩을 한 번 선택한다. |
| `view.applyResourceSets({ setIds, definition?, inputs?, states?, signal? })` 제안 | View가 고정한 구성을 바탕으로, 이미 등록한 대상 셋과 선언한 의존성의 항목을 더한다. | 기존 View 수명. `definition`이 있으면 기존 호환 갱신 규칙으로 새 정의를 함께 적용한다. |
| 현행 `view.replace(source, options)`의 확장 | 그 시점의 최신 저장소 구성과 선택한 새 View 정의 | 같은 공개 View 핸들 안에서 내부 수명을 새로 시작한다. 서비스 소유 State를 유지한다. |
| 현행 `view.updateDefinition()`·`setInputs()` | View가 이미 고정한 구성 | 기존 수명에서 정의·입력만 적용한다. |

1. View에 공개 저장소와 별도인 고정 구성을 둔다. 생성과 교체는 저장소의 한 리비전을 바탕으로 준비한다. 추가 적용은 `setIds`와 해당 의존 셋의 현재 항목만 가져와 기존 구성을 확장한다. 기존 정의·코드 Action 함수·컴포넌트 바인딩 중 하나라도 달라져야 하면 추가 적용을 거절한다. 대상 밖의 저장소 교체는 이 적용에 포함되지 않는다. 추가한 정의가 참조하는 항목은 합쳐진 구성에서 검증하고 빠졌다면 필요한 의존 셋을 진단한다.
2. 설정과 정의가 함께 오면 같은 View 적용 작업에서 구조·입력·State 연결을 검증한다. 준비 검사는 `build()`가 산출한 `status === 'ready'` 코드 Component 노드의 구현 바인딩을 확인한다. 아직 투영에 없거나 대기 중인 노드는 렌더에 필요한 시점에 검사한다. 실제 슬롯 제공, 연결자 가용성과 mount는 표시 연결에서 관찰한다. 기존 연결과 나중에 `attach()`한 연결은 View가 확정한 구성을 읽는다.
3. 후보 실행 구성을 `build()`와 입력·정의 검증에 인수로 넘긴다. `this.runtime`과 공개 호출이 읽는 구성·투영·소유자는 게시 시에만 갱신한다. 준비·검증 콜백을 호출하는 동기 범위를 `try/finally`로 표시하고, `Runtime.invokeAction()`과 `View.emit()`에서 이 범위를 검사한다. 해당 콜백에서 새 Action을 요청하면 `EXECUTION_BLOCKED`로 종료한다. 독립적인 사용자 클릭과 이미 실행 중인 Action은 확정 구성을 사용한다.
4. `Runtime.resolve()`는 한 작업에서 받아온 선언형 정의를 `(kind, id)`로 보관한다. 재시도할 때 같은 키의 선언형 정의가 내용상 같으면 기존 항목을 재사용한다. 같은 키의 내용이 다르거나 이미 코드형으로 등록됐다면 충돌이다. 셋 동일성의 객체 참조 비교를 resolver 결과에는 적용하지 않는다. 범위에 들어온 무관한 선행 변경은 최신 저장소를 바탕으로 다시 합친다.

#### 선언 참조 검증과 오류 위치

1. `packages/core/src/registry.mjs`의 표현식·입력 검증에서 대상 범위의 선언 이름을 전달한다. View와 재사용 Component는 각각 자기 `states`, `ports`, `queries`를 사용하고, 반복 별칭과 Action 조회 ID는 그 참조 위치의 유효 범위를 따른다. 직접 작성한 `@path` 및 기존 표현식 순회가 찾는 참조를 실제 값을 읽기 전에 검사한다. 선언 이름이 빠진 `/states/coutn`은 `when: false` 분기를 포함해 준비에서 거절한다. 선언 뒤의 데이터 속성이나 이벤트·Query 응답으로만 결정되는 경로는 평가하는 시점에 확인한다. 선언된 State의 값이 아직 없으면 기존 입력 준비 경로가 해당 필수 Value를 기다리는 노드만 대기시킨다. 문자열 리터럴과 이스케이프된 키는 현행 표현식 문법대로 처리한다. [D163](../spec/12-resource-sets-browser.md#실패-경계) · [Registry 검증](../../packages/core/src/registry.mjs)
2. 선언 순회 중 오류가 발생한 JSON Pointer를 유지한다. 인라인 `ViewSpec`은 spec의 루트를 기준으로 삼고, 이름 있는 리소스는 리소스 문서의 `/spec` 아래 위치와 소유 리소스를 전달한다. 슬롯의 배열 인덱스와 맵 키를 포함하고 키의 `~`와 `/`는 JSON Pointer 규칙에 따라 이스케이프한다. 참조 수집에도 출처 위치를 보존해 `Runtime.resolve()`가 먼저 미등록 `componentRef`나 `actionRef`를 발견하는 경우 같은 진단을 반환할 수 있게 한다. resolver가 정상 선언을 반환하면 해당 후보에 포함해 검증하고, 하위 정의의 오류는 그 하위 문서를 가리킨다.
3. 누락된 선언에는 `REFERENCE_NOT_FOUND`와 찾지 못한 선언 종류·이름을 담은 메시지를 반환한다. 미지원 이벤트는 기존 `INVALID_DEFINITION`에 이벤트 이름과 대상 Component를 추가한다. 예를 들어 `actionRef: 'incremnt'`는 `/render/slots/default/1/on/click/actionRef`와 `Unknown Action "incremnt".`를, `on.clik`은 `/render/slots/default/1/on/clik`과 Button에서 찾지 못한 이벤트 이름을 제공한다. 입력을 특정할 수 있으면 기존 `input` 필드를 함께 제공한다. 공개 오류는 현행의 정제된 형태를 사용하며 원본 예외나 State·이벤트 값 전체를 메시지에 넣지 않는다. [공개 오류 계약](../spec/07-host-integration.md#공통-오류와-진단) · [Core 오류 처리](../../packages/core/src/errors.mjs)
4. `runtime.mjs`의 생성·교체 준비, `view.updateDefinition()`, `view.applyResourceSets()`가 각자 선택한 Registry 후보에서 같은 검증을 수행한다. 새 `mount()`에서 참조가 누락되면 `ready`와 첫 `whenRendered()`가 오류를 반환하고 `onError`는 `prepare` 진단을 전달한다. 열린 View에서는 변경 요청이 거절되며 기존 정의·State·표시와 연결이 유지된다. 실패한 후보에서 새 리소스, 적용 알림, Query 실행 및 URL 쓰기가 시작되지 않는 것을 확인한다.

| 수락 사례 | 재현과 단언 |
|---|---|
| 첫 화면의 잘못된 State 참조 | `count`를 선언하고 카운터의 필수 Value 또는 버튼 Action의 State 입력에 `/states/coutn`을 사용한다. 두 변형 모두 브라우저 마운트 준비가 실패한다. 각각 `/render/slots/default/0/inputs/count/@path`, `/render/slots/default/1/on/click/inputs/count/@path` 위치와 찾지 못한 이름을 반환한다. `when: false`인 분기의 오타도 구조 검증에서 잡는다. |
| 미등록 리소스·잘못된 이벤트 | `componentRef`, `actionRef`, `on.clik`을 한 번씩 잘못 쓴다. 각 오류 코드·메시지·정확한 위치를 확인한다. resolver가 정상 선언을 반환하는 성공 경로도 실행하고, 가져온 리소스 내부의 잘못된 참조는 그 리소스 기준 위치로 보고하는지 확인한다. |
| 열린 화면에서 적용 실패 | 카운터가 한 번 증가한 뒤 오타가 있는 정의를 `updateDefinition()`, `replace()`, `applyResourceSets()`로 각각 적용한다. 기존 State 값과 핸들, DOM 노드, View 정의, 표시 구성이 유지되고 기존 버튼은 계속 클릭할 수 있다. 셋 추가와 State 쓰기를 함께 요청한 변형에서도 이전 값이 남고 후보 셋의 정의는 해당 View에서 사용 가능해지지 않는다. `replace()`가 resolver로 받아온 새 정의는 실패 뒤 공유 Registry에 나타나지 않는다. |
| 선언된 값 대기와 실행 시 입력 오류 | `count`는 선언하고 초기값을 생략한다. 준비는 성립하고 카운터만 대기하며 형제 버튼은 표시된다. State를 쓰면 같은 노드가 숫자를 표시한다. 별도로 존재하는 문자열 State를 정수 Value에 연결하면 준비가 성립하고 해당 노드의 `TYPE_MISMATCH` 진단이 발생한다. |

#### URL 예약과 Registry·View 게시 순서

`View.enqueue()`의 작업은 실제 게시 직전까지 `prepare` 상태다. `StateStore.transaction()`의 `beforeNotify` 안에서 아래 순서를 적용한다. Registry 변경과 State 알림 사이에도 D158의 URL 관찰 순서를 유지한다. [View의 현재 게시 순서](../../packages/core/src/runtime.mjs) · [StateStore 트랜잭션](../../packages/core/src/state.mjs) · [URL 예약과 활성화](../../packages/core/src/url.mjs) · [State·URL의 소유 계약](../spec/09-preserved-contracts.md)

| 순서 | 처리 | 실패 또는 취소 |
|---|---|---|
| 1. 후보 구축 | resolver를 기다린 뒤 최신 Registry 리비전과 대상 정의를 읽는다. StateStore 트랜잭션 안에서 View 루트·State·이벤트 연결을 준비하고, URL 어댑터 접근과 바인딩 대상 확인을 끝낸다. `beforeCommit` 같은 마지막 호스트 콜백도 여기서 실행한다. | 기존 View 구성과 URL 소유를 유지한다. 잠정 State·owner는 트랜잭션의 롤백 대상으로 남긴다. |
| 2. 취소·리비전 확인 | 작업·소유 View·외부 신호의 현재성을 먼저 확인한다. 생성·교체·셋 추가 적용이 읽은 Registry 리비전을 다시 비교한다. 현재 View 구성에서만 실행하는 `updateDefinition()`·`setInputs()`에는 공유 저장소 재확인이 필요 없다. | 취소가 우선이며 `CANCELLED`다. 리비전 불일치는 아래의 재시도 경로로 보낸다. |
| 3. URL 예약 검증 | 현재 `urlConnection.commit()`을 검증과 게시로 나눈다. 검증에서 staged State의 baseline을 읽고, StateStore의 URL 소유자가 준비 시 예상한 이전 연결과 같은지 확인한다. 현재 어댑터 키를 읽어 빈 키 또는 정당한 이전 토큰의 키만 대상으로 예약 정보를 만든다. 기존 키의 정리용 인계 정보와 새 관찰 대상도 여기서 계산한다. | URL 소유 충돌은 기존 오류 경로로 거절한다. Registry나 View를 게시하기 전에 종료한다. |
| 4. 동기 확정 | 검증이 끝나면 작업을 `commit`으로 전환한다. 먼저 준비된 URL 예약을 설치하고 이전 URL 연결을 일시 정지한다. 새 연결의 Store 내부 변경 관찰을 같은 구간에서 켠다. resolver가 추가한 정의가 있으면 Registry 후보를 게시하고, View의 실행 구성·정의·루트·인스턴스·이벤트 연결·적용 핸들을 함께 확정한다. 이 구간은 동기 내부 대입과 등록으로 구성한다. | 모든 사용자 콜백, 키 재검사 및 오류를 낼 수 있는 준비는 앞 단계에서 끝낸다. |
| 5. 확정 이후 통지와 외부 작업 | StateStore가 기존 소유 범위 정리와 관찰자 통지를 처리한다. 이후 이전 URL의 소유 키 정리, 새 어댑터 `subscribe`·복원·쓰기를 현행 순서로 실행한다. 첫 Query와 표시 투영은 현행 URL 준비 조건을 따른다. | 이 단계의 URL I/O 오류는 확정된 적용의 진단이다. |

`StateStore.reserveUrl()`의 현재 소유자 비교는 검증 단계로 옮기고 내부 게시 함수는 검증한 예약만 설치한다. 기존 `StateStore.connectUrl()`도 같은 검증과 설치를 동기로 연속 실행한다. URL 변경 감지용 `observeUrlChanges`는 내부 구독이므로 첫 State 알림 전에 연결한다. 외부 `adapter.subscribe()`는 확정 뒤에 실행한다. 검증과 설치 사이에는 `await`와 호스트 호출이 없다.

`build()`의 `beforeNotify`는 최상위 StateStore 트랜잭션에서 실행한다. 공개 View 작업의 대기열에서 이 조건을 맞춘다. 내부에서 중첩 호출을 감지하면 준비 단계 오류를 반환한다. 적용 핸들·URL 바인딩 목록·정리 계획은 확정 전에 구성한다. 기존 적용 대기를 깨우거나 콜백을 실행할 수 있는 정리는 확정 이후로 옮긴다. 첫 State 구독자가 Registry와 View를 동기로 읽으면 둘 다 이번 적용을 반영한다.

리비전 불일치 시 내부 재시도 표식을 `beforeNotify` 경계 밖까지 전달해 StateStore가 staged 변경을 복원하게 한다. 실패 처리는 `build()`가 만든 임시 이벤트 연결·owner를 정리하고, 게시 전 URL 후보를 폐기한다. 기존 예약·구성은 그대로 사용한다. resolver 조회 중 리비전이 바뀌어도 같은 재시도 경로를 사용한다. `job.phase`는 `prepare` 상태에서 유지한다. 정리한 뒤 타이머와 사용자 입력을 처리할 수 있는 호스트 작업을 한 차례 양보하고 취소를 확인한다. 같은 작업과 이미 얻은 resolver 정의는 재사용한다. 새 시도는 최신 Registry를 기준으로 권한·View·URL 후보를 다시 준비한다. 재시도 표식은 공개 오류로 변환하기 전에 처리한다. 빈 일괄 등록은 리비전을 바꾸지 않는다.

#### 게시 경합의 수락 검증

| 사례 | 재현과 단언 |
|---|---|
| 마지막 준비 콜백의 URL 키 선점 | 열려 있는 A를 교체해 키 `next`를 쓰려 한다. `beforeCommit`에서 별도 StateStore의 연결이 같은 어댑터의 `next`를 선점한다. A의 준비는 거절된다. resolver로 준비한 정의·후보 State·View 핸들이 게시되지 않고, A의 이전 URL 키와 선점 연결의 키가 각자 유지된다. A 후보의 외부 URL 구독·쓰기는 0회다. |
| Registry 재시도 도중 취소 | A의 resolver가 찾아온 새 정의와 URL 후보를 준비한다. 첫 `beforeCommit`에서 별도 무충돌 셋을 원자 등록해 리비전을 올리고 `queueMicrotask`에서 A의 `AbortController`를 중단한다. 선행 셋 등록은 남는다. A는 첫 시도를 롤백한 뒤 `prepare` 상태에서 `CANCELLED`로 끝난다. 둘째 `beforeCommit` 호출, A의 resolver 정의 게시, 새 적용 통지·실행 시작·URL 구독·쓰기는 모두 0회다. A의 기존 State·View·URL을 확인한다. |
| 취소 없는 재시도와 양방향 충돌 | 앞 사례에서 중단을 빼면 resolver 재호출 없이 무충돌 등록과 A가 가져온 정의가 모두 남는다. 적용 후 첫 State 통지에서 Registry의 새 정의와 A의 새 설정·정의·State를 함께 조회한다. 다른 정의가 같은 `(kind, id)`를 두고 경쟁할 때는 셋이 먼저 게시하는 순서와 resolver가 먼저 게시하는 순서를 모두 실행해 먼저 확정한 정의가 유지되는지 확인한다. |

**완료 조건** — A/B/새 View에서 셋 등록, 대상 지정 추가, 명시적 교체, 일괄 적용 실패를 각각 확인한다. 기존 편집값과 인스턴스는 추가 적용에서 유지되고, 교체는 새 내부 수명과 서비스 소유 State 보존을 보인다. 셋과 resolver 각각이 먼저 게시하는 경합, 충돌 없는 동시 게시, 재진입 시 후보 무효화와 취소를 지연 제어 가능한 테스트로 검증한다. 검증 콜백이 요청한 Action의 본문은 0회이고, 준비 중 별도로 발생한 기존 화면 클릭은 확정 구성에서 Action을 시작한다.

### 3. Query·Action 실행의 구성과 호스트 기능

주요 수정 경로는 `packages/core/src/action.mjs`, `query/index.mjs`, `query/usage.mjs`, `runtime.mjs`, `api.mjs`, `index.d.ts`다. 현재 View 실행 객체가 실행 엔진과 Registry를 함께 만들기 때문에 추가 적용에서 통째로 바꾸면 기존 `ActionEngine`의 소유자나 `QueryUsage`의 실행·캐시가 끊길 수 있다. 소유자와 사용 인스턴스는 수명에 남기고, 리소스 해석에 필요한 Registry 구성은 독립 실행을 시작할 때 고정한다.

1. `Runtime.execution()`에서 View 수명 내내 유지할 Action·Query 엔진과 실행별 Registry 스냅샷을 분리한다. `ActionEngine`의 owner·connection 맵은 유지한다. 이벤트 연결은 `actionRef` 또는 인라인 정의를 보관하고, 이벤트가 실제 실행될 때 `connect().invoke`에 확정 구성을 전달한다. 독립 `invoke()`도 호출별 구성으로 시작한다. `#invoke()`와 하위 `invokeAction()`은 같은 구성에서 정의·Type·함수를 해석한다. Action의 `Query` 단계도 그 구성으로 조회한다. `RefreshQuery`와 Query 포트의 `refresh/retry`는 전달받은 기존 Query 사용 인스턴스에 요청하므로 해당 사용의 소유 View 구성을 따른다. 실행 정의 캐시는 스냅샷과 정의별로 나눠 같은 ID의 함수 교체 뒤에도 올바른 함수를 읽는다. 교체 적용으로 실제 owner가 제거되면 현행 수명 취소가 적용된다.
2. `QueryUsage`는 기존 owner, 엔진 캐시, 티켓, 타이머를 유지한다. `drain()`은 `running` 통지 전에 당시 `use`, 준비된 입력, 세대와 구성 스냅샷을 run에 함께 저장한다. 그 run에서 `execute()`의 `use`와 Registry를 꺼낸다. 정의·Type·Datasource·변환을 해석하는 Query 엔진의 모든 경로는 그 Registry를 사용한다. `running` 구독자가 다음 입력·정의를 반영하더라도 이미 시작한 실행이 캡처한 값으로 진행하는지 확인한다.
3. `RuntimeOptions.hostCapabilities`와 `ActionContext.capabilities`는 `Readonly<Record<string, unknown>>`으로 둔다. Runtime 생성 시 자체 열거 키를 복사한다. `CodeActionEntry.requires`의 이름은 정규화해 비교하며 빈 이름과 중복을 거절한다. 호출 권한·입력·수명 검사 뒤와 Action 본문 전에 선언한 이름의 자체 키가 존재하고 값이 `undefined`가 아닌지 검사한다. 누락 시 `REFERENCE_NOT_FOUND`와 `location: '/capabilities/<JSON Pointer 토큰>'`, 등록 Action의 `resource`를 담아 반환한다. 핸들러에는 선언한 키만 담은 읽기 전용 맵을 넘긴다. 등록과 View 준비는 호출 시점의 기능 유무와 독립적이다.
4. `Runtime.invokeAction(request: ActionRequest): Promise<unknown>`은 View 없이 같은 실행기를 쓴다. Runtime별로 독립 호출 owner를 두고, 호출 시작마다 저장소 스냅샷을 잡는다. 공개 권한 콜백에는 기존의 불투명 owner를 사용하며, 포트는 기존 검증을 따른다. Runtime A를 종료해도 같은 Registry를 쓰는 B의 호출과 Registry는 유지된다. [현재 Action 실행기](../../packages/core/src/action.mjs) · [Query 엔진과 캐시](../../packages/core/src/query/index.mjs) · [QueryUsage](../../packages/core/src/query/usage.mjs)

#### 권한 콜백의 Action 식별자

1. `action.mjs`에서 Action 참조를 실제 실행 구성으로 해석할 때 해당 리소스의 `{ kind: 'Action', id }`를 실행 정의에 대응시켜 보관한다. 현재 스냅샷과 등록 정의에 묶인 캐시를 사용하고, 메타데이터는 Action spec과 별도로 보관한다. 코드형과 선언형 등록 Action 모두 적용한다. 인라인 정의에는 `null`을 사용한다.
2. 공통 `#invoke()`의 권한 검사에서 지금 실행할 대상의 식별자를 넘긴다. View 이벤트, Runtime·View의 직접 호출, 코드와 선언형 Action의 하위 호출이 이 경로를 사용한다. 하위 호출의 식별자는 그 하위 실행의 정의에서 가져온다. `runtime.mjs`와 `api.mjs`가 이를 공개 콜백까지 전달하고, `index.d.ts`의 `operation: 'invoke'` 컨텍스트에 읽기 전용 `resource` 필드를 추가한다. 권한 콜백에 제공하는 정의는 spec이고, 구현 함수는 실행기 내부에 둔다. [D159](../spec/07-host-integration.md#action-실행-권한)

#### 독립 Action 호출의 취소

1. `index.d.ts`의 `ActionRequest`에 선택적 `signal: AbortSignal`을 추가하고, `api.mjs`의 Runtime·View 진입점에서 구조를 검증해 `runtime.mjs`를 거쳐 실행기에 전달한다. 이미 취소된 정상 요청은 권한 검사와 본문 실행 전에 `CANCELLED`로 거절한다. 권한 검사 중에 신호가 취소되는 경우는 검사 직후의 기존 실행 자격 확인에서 감지한다. `ChildActionRequest`는 부모 실행의 취소를 상속한다.
2. 실행기에서 외부 신호를 해당 호출의 취소 컨트롤러와 owner 수명 신호에 연결한다. 핸들러와 하위 호출은 합성된 취소를 관찰한다. 기존 결과 대기와 호출 한정 State·Query 핸들의 수명 검사를 사용해 취소 뒤 새 작업과 늦은 결과를 차단한다. 완료·실패·취소 시 호출의 신호 구독과 owner의 실행 기록을 정리한다. 별도 호출과 공유 원본 State·Query의 수명은 각각의 소유 범위를 따른다. [D160](../spec/07-host-integration.md#독립-action-호출의-취소)

**완료 조건** — 조회와 저장을 지연시킨 상태에서 셋을 추가 적용해 요청 수·실행 참조·응답 반영을 검증한다. Query의 첫 `running` 통지 구독자가 새 입력으로 다시 실행을 요청해도 첫 실행은 이전 입력과 정의를 사용한다. 적용 후 새 독립 실행은 새 리소스를 찾는다. 같은 ID의 코드 Action 함수 교체를 게시할 때 진행 중 호출과 기존 View, 새 View, 명시 적용한 View가 각자 기대하는 함수를 쓰는지 확인한다. Node 소비자에 DOM/Svelte 없이 셋을 등록하고 일반 Action을 실행한다. routing 누락 오류와 기능 공급 시 호출, Action 본문 이전의 실패, 기존 권한·취소를 재검증한다. 같은 Registry를 주입한 A와 B에 지연 Action을 시작하고 A만 종료해 A의 취소와 B의 정상 완료를 확인한다.

### 4. 공통 브라우저 기반과 공개 연결 계약

새 패키지의 주요 경로는 `packages/dom/package.json`, `tsconfig.json`, `src/index.ts`, `src/connector.ts`, `src/renderer.ts`, `src/connection.ts`, `src/dom-connector.ts`다. Core와 브라우저의 경계는 `packages/core/src/renderer.mjs`와 `renderer.d.ts`에서 조정한다. 대상 예약, `mount`·`attach`·`detach`·`unmount`, 적용 대기와 진단 전달은 공통 호스트를 사용한다.

#### 공개 연결자와 표시 투영의 호출 규칙

`@viewstem/dom`은 `createRenderer({ runtime, connectors? })`와 아래 연결자 타입을 공개한다. 기본 DOM 연결자 ID는 `dom`, 공식 Svelte 연결자 ID는 `svelte`다. `connectors`는 추가 공개 연결자 배열이며 ID가 중복되면 렌더러 구성을 거절한다.

| 호출 표면 | 타입과 책임 |
|---|---|
| `ComponentConnector.id`, `accepts(implementation)` | `id: string`, `accepts(implementation: unknown): boolean`. 확인은 동기이며 DOM을 생성하기 전에 수행한다. |
| `mount(implementation, context): MountedComponent` | 동기로 생명주기 핸들을 반환한다. `context`는 `parent: HTMLElement`, `anchor: Node`, `node: NodeSnapshot`, 인스턴스 수명의 `signal: AbortSignal`, `emit(event, payload): Promise<unknown>`, `provideSlot(name, host): () => void`를 갖는다. 구현은 자신만 소유한 DOM을 `anchor` 앞에 둔다. 반환 전에 예외가 나면 구현이 그 호출의 부분 자원을 정리한다. |
| `update(node, signal): void` · `setPending(pending): void` | 둘 다 필수다. `update`에는 현재 NodeSnapshot과 갱신 작업의 신호를 넘긴다. 대기 표시는 마운트한 인스턴스에서 갱신하고, 유효한 입력이 돌아오면 같은 핸들에 전달한다. |
| `whenRendered?(signal): void \| Promise<void>` | 비동기 DOM 반영의 완료·실패를 알린다. 생략하면 연결자 메서드 반환 때 자체 DOM 반영이 완료된 것으로 처리한다. Viewstem 슬롯 자식의 반영은 공통 기반이 기다린다. |
| `afterChildren?(node): void` · `dispose(): void \| Promise<void>` | `afterChildren`은 현재 제공 슬롯의 자식 배치 뒤 실행한다. 필수 `dispose`는 인스턴스마다 한 번 호출하고 완료를 기다린다. |

`@viewstem/core/renderer`에 `subscribeRenderProjection(view, listener): () => void`를 추가한다. listener는 `{ generation, sequence, snapshot, componentBinding(id) }`을 받는다. `generation`과 `sequence`는 해당 View 적용과 그 안의 게시 순번이며 노드 `generation`과 별개다. `componentBinding`은 같은 투영에서 확정한 구성의 읽기 전용 바인딩을 조회한다. 리스너 호출 전에 이 네 값을 한 레코드로 잡는다. 일반 `NodeSnapshot`에는 함수나 DOM을 넣지 않는다. 호스트의 내부 대기 인터페이스는 `whenRendered(generation, sequence)`로 이 값을 받아 표시 연결이 어떤 작업을 기다릴지 식별한다. `dom`이 바인딩의 연결자 ID를 찾지 못하거나 `accepts()`가 거짓이면 그 표시 연결의 오류로 보고한다.

1. 마운트를 시작하기 전에 해당 인스턴스에 대한 취소 신호와 현재성 검사를 만든다. 그 뒤 구현을 검사하고 `mount()`한다. 구현의 DOM 반영이 끝나면 그때 제공된 슬롯의 자식을 조정하고 `afterChildren()`을 실행한다. 입력 갱신도 `update()` → 구현 반영 → 슬롯 조정 → `afterChildren()` 순서다. `connector.ts`의 `MountedComponent.whenRendered`를 선택으로 바꾸고 `connection.ts`의 일반 렌더 및 마운트 후 대기 상태 경로 모두에서 제공된 메서드의 결과를 현재 작업의 신호로 기다린다. 동기 구현은 슬롯 조정이나 대기 표시 완료로 바로 이어간다. [D161](../spec/12-resource-sets-browser.md#연결자-자체의-렌더-완료)
2. `provideSlot(name, host)`는 노드가 선언한 슬롯 이름과 현재 대상 문서의 호스트를 확인한다. 각 호출의 반환 함수는 그 호출이 만든 슬롯 등록만 철회한다. 같은 이름에 새 호스트가 등록된 뒤 이전 등록의 반환 함수를 호출해도 새 호스트가 유지된다. 슬롯을 잃은 자식은 이벤트 시작을 즉시 닫고 자식부터 정리한다. 기존 등록이 끝난 뒤 새 슬롯에 마운트한다.
3. 단일 브라우저 연결은 core 투영을 한 번 구독한다. 자식 목록은 슬롯 호스트별로 조정하고, `(address, generation)`과 현재 바인딩을 써서 재사용을 판단한다. 선언형 노드는 core의 자식 투영을 사용하고, 코드형 노드는 제공된 named slot별로 배치한다. 노드마다 자식 연결자의 결과를 둘 수 있는 comment anchor 범위를 사용해 단일 HTML wrapper를 강제하지 않는다. 위치 변경은 범위의 배치만 조정한다. 동일 슬롯에 그대로 존재하면 인스턴스를 유지하고, 순서 이동에서 기존 DOM과 가능한 focus·selection을 검증한다.

   이미 마운트한 같은 노드의 필수 입력이 `pending`이 되면 공통 기반은 해당 렌더 인스턴스와 로컬 상태를 유지한다. 마지막으로 전달한 유효한 입력은 인스턴스에 그대로 두고 해당 위치의 대기 상태를 표시한다. 대기 표시 방식은 연결자 이행에서 구체화한다. 다시 `ready`가 되면 같은 인스턴스에 검증된 새 입력을 전달한다. 이 규칙은 DOM과 Svelte에 공통으로 적용한다.
4. 슬롯 교체로 렌더 인스턴스 수명이 바뀌어도 같은 Viewstem 노드의 core State를 유지한다. 부모 실패로 더 이상 제공되지 않는 슬롯도 철회 경로를 탄다. 제거·연결 종료에서는 대기 중 작업의 신호와 인스턴스 신호를 먼저 취소하고 자식부터 정리한다. `mount()`가 동기 호출 중 재진입으로 무효화된 뒤 핸들을 반환하면 그 핸들은 표시하지 않고 한 번 정리한다.

   표시 연결은 부모의 렌더 완료까지 슬롯 등록을 반영한다. 부모가 렌더에 성공한 시점에 등록되지 않은 슬롯의 자식은 이번 마운트와 완료 대기에서 제외한다. 부모가 나중에 슬롯을 등록하면 표시 연결이 현재 자식 투영을 새 슬롯에 조정한다. Core 투영이 그대로여도 슬롯 등록으로 새 렌더 작업이 생길 수 있으며, 이미 끝난 대기의 결과는 유지한다.
5. 이벤트 함수는 연결과 현재 렌더 핸들에 묶인다. 기존 `View.emit`/Action 시작 검사에 연결·렌더 인스턴스·노드 수명·구현 연결의 현재성을 넘긴다. 권한 콜백이나 입력 평가가 반환한 직후에도 실제 Action 시작 전에 다시 검사한다. 현재 노드의 필수 입력이 대기 중이면 유지한 인스턴스의 이벤트도 시작 전에 거절한다. 같은 슬롯에서 순서만 바꾼 인스턴스는 이벤트를 계속 보낼 수 있다. 슬롯 교체 이전의 콜백은 노드의 core 세대가 같아도 새 Action을 시작하지 못한다.
6. `createRenderWaiter`의 `wait(generation, sequence)`는 투영을 받은 뒤 두 값을 표시 연결에 전달한다. `whenRendered()`는 호출 당시 core 투영을, `whenSettled(application)`은 해당 적용의 최초 Query 보고 뒤 대응하는 DOM 반영을 기다린다. 표시 연결은 core 순번 외에 연결 내 작업 순번을 둔다. 같은 `generation`에서 최신 투영이나 늦은 슬롯 제공이 미완료 표시 작업을 대체하면 대기를 새 작업에 연결한다. 이전 작업 신호를 취소하고 그 작업에서 늦게 온 결과·오류·진단을 버린다. 완료된 대기는 유지한다. 새 적용이 확정되거나 연결이 닫히면 이전 미완료 대기를 `CANCELLED`로 종료한다.

   한 노드의 동기 예외나 비동기 렌더 실패를 해당 노드와 슬롯 자식에 한정하고 독립 노드 조정을 계속한다. 진단은 연결에 귀속시키고 해당 렌더 완료 대기는 공개 오류로 실패시킨다. 원인을 특정할 수 없는 연결 실패는 전체 연결 오류로 전달한다. 실패 기록은 성공적으로 반영된 후속 갱신과 함께 수명에 맞춰 정리한다.
7. 현행 `mount().ready`는 첫 렌더 실패에 연결을 닫는다. 새 브라우저 경로의 `ready`는 View 준비와 표시 연결이 성립하면 View를 반환한다. 첫 렌더가 지연된 상태에서는 `whenRendered()`가 기다리며, 특정 노드가 실패하면 연결 진단과 렌더 대기에서 오류를 보고하고 성공한 형제 노드는 유지한다. `whenSettled(application)`의 DOM 대기도 해당 연결의 렌더 결과를 따른다. 핸들 반환 뒤 View 준비나 연결 성립이 실패하면 `ready`에서 오류를 반환하고 소유 View와 예약을 정리한다. [현행 renderer host](../../packages/core/src/renderer.mjs) · [공개 host 타입](../../packages/core/src/renderer.d.ts)

**완료 조건** — 새 `@viewstem/dom`을 별도 빌드해 단일 DOM 목록에서 순서 이동·슬롯 교체·정리·포커스를 재현한다. 렌더 갱신과 정리를 지연시키고 같은 이름의 새 슬롯 등록 뒤 이전 슬롯을 철회해 새 슬롯이 유지되고, 기존 자식의 정리는 한 번 끝난 뒤 새 자식이 붙는지 확인한다. 접힌 패널에는 슬롯 자식이 마운트 없이 남고, 패널을 펼치면 현재 자식 투영으로 마운트한다. 동일 View의 빠른 연결과 느린 연결이 서로의 완료를 막지 않고, 한 연결의 실패·해제가 다른 연결과 View 구성에 전파되지 않는다. 같은 적용에서 첫 렌더가 대기 중인 상태로 최신 투영을 반영해 최신 성공·실패에 따라 대기 결과가 정해지는지 확인한다. 첫 투영의 늦은 오류는 무시되고, 첫 대기가 이미 끝났거나 별도 View 적용으로 대체되는 경우도 각각 확인한다. 세대가 같은 오래된 렌더 핸들의 이벤트와 현재 핸들의 이벤트를 구별한다. 부분 렌더 실패에서 자식 정리·형제 입력·완료 실패를 모두 확인한다.

### 5. Svelte 연결자와 기본 UI 셋으로 전환

**Svelte 경로.** `packages/svelte/src/lib/index.ts`, `renderer.ts`, `types.ts`, `ViewstemView.svelte`를 새 공개 연결자로 전환한다. 노드 단위 마운트 컴포넌트와 슬롯 제공 컴포넌트를 `ComponentMount.svelte`, `SlotOutlet.svelte`로 둔다. 기존 `connection.ts`, `ConnectedView.svelte`, `RenderNode.svelte`, `NodeList.svelte`의 View 순회는 이 경로를 연결한 뒤 제거한다. `source.ts`의 source 캡처와 소유 View의 취소·정리 규칙에서 계속 필요한 부분을 재사용한다.

1. Svelte 구현은 공식 `mount`에 슬롯 부모와 노드 범위의 마지막 anchor를 전달한다. 새 입력·노드 투영은 마운트 컴포넌트가 `$state.raw`로 받은 스냅샷을 교체해서 반영한다. 구현 컴포넌트는 named slot 제공 함수를 받는다. 슬롯 컴포넌트의 요소 부착·정리에서 호스트 등록·철회를 전달하고, Viewstem 자식 목록의 keyed 순회는 공통 기반에서 동작한다.
2. 노드 마운트 단위의 `<svelte:boundary>`에서 오류를 해당 노드에 전달한다. `whenRendered`는 `tick()`과 작업 신호를 확인하고, `dispose`는 `unmount`를 한 번 기다린다. 직접 호스팅하는 `ViewstemView`의 `fallback(node, error)`는 준비되지 않은 노드와 렌더 실패 노드 위치에 연결한다. 마운트한 대기 노드에는 별도 대기 표시를 두고 컴포넌트 인스턴스를 유지한다. `pending`·`prepareError`는 `ViewstemView`의 소유 View 준비 화면에 남긴다. `getAllContexts()`는 `ViewstemView` 초기화 중 캡처하고 그 진입점이 여는 마운트로 넘긴다. 검증에서는 앱이 제공한 context가 유지되는지 확인한다. 임의 혼합 트리의 native context 전파는 후속 범위다. [Svelte 노드 경계](../../packages/svelte/src/lib/ComponentMount.svelte) · [Svelte 마운트 API](https://svelte.dev/docs/svelte/imperative-component-api) · [Svelte context](https://svelte.dev/docs/svelte/context) · [Svelte 오류 경계](https://svelte.dev/docs/svelte/svelte-boundary)

**UI 경로.** `packages/ui/src/index.ts`는 일반 공개 셋 `ui`를 제공한다. `dom.ts`의 카탈로그 노드 생성·입력 반영·이벤트·behavior를 `components.ts`의 컴포넌트 구현으로 옮기고 전체 트리 연결·`renderList`를 제거한다. `shadcn.ts`의 계약 생성 및 레시피, `component-context.ts`, 스타일, 지원표는 카탈로그가 소유한다. DOM 연결자는 요소 배치와 제거를 처리하며 카탈로그 이름을 조회하지 않는다.

1. 기존 컴포넌트의 마크업·ARIA·이벤트 계약과 ID를 유지한다. DOM 구현이 제공하는 슬롯의 실제 컨테이너에 자식을 배치한다. NativeSelect의 옵션 반영과 Tooltip의 자식 식별 같이 자식 DOM이 있어야 하는 기존 동작은 `afterChildren` 경로에서 검증한다. 순수 DOM의 메뉴·table·select 레시피와 CSS는 기존 `data-viewstem-ui` 스코프와 유효한 DOM을 유지하는지 확인한다. 스코프는 커스텀 연결자 노드마다 wrapper로 삽입하지 않고, UI를 쓰는 소비 진입점의 브라우저 mount 영역에 지정한다.
2. 카탈로그의 `update()`는 노드 배치와 자신의 컨트롤 재구성을 구별한다. 동일 키의 `Button.href`가 바뀌거나 `child` 슬롯 유무로 태그·구조가 바뀌면 기존 리스너와 behavior를 정리하고 기존 슬롯을 철회한 뒤 같은 배치 범위에 새 제어 요소를 만든다. 새 슬롯은 별도 등록으로 제공한다. 이전 요소의 콜백은 정리 신호를 검사하고 새 이벤트를 보내지 못한다. Core 노드 수명과 다른 형제 DOM은 유지한다. `Button.href` 추가·제거에서 `<button> → <a> → <button>`과 이벤트 횟수를 단언한다. [현행 태그 선택](../../packages/ui/src/markup-families.ts) · [카탈로그 구현](../../packages/ui/src/components.ts)
3. 새 DOM 경로는 앱에서 `ui` 셋을 직접 등록한 뒤 View를 생성한다. 의존 등록도 같은 `ui` 선언을 사용한다. Svelte 편의 렌더러는 DOM·Svelte 연결자를 조립하고 UI 셋 등록은 앱의 선택에 따른다. 전환 단계에서 양 패키지의 이전 순회를 제거하고 저장소 안의 예제·테스트·문서 앱을 같은 변경에 이행한다.

**문서 앱.** 실행 예제의 `preview.ts`와 복사 코드의 `component-demo-ui-setup.ts`도 새 DOM 패키지와 명시 등록을 사용한다. `ExamplePreview.astro`가 사용하는 실행 모듈과 문서에 표시하는 사용 코드 양쪽을 확인한다. 앱 매니페스트에 직접 import하는 `@viewstem/dom`을 추가한다. 아래 단계별 파일 목록에 실행·복사 진입점을 배정한다. [예제 실행 위치](../../apps/docs/src/components/ExamplePreview.astro) · [복사 예제](../../apps/docs/src/examples/component-demo-ui-setup.ts)

**완료 조건** — Svelte Layout 안 DOM Button, DOM Card 안 Svelte Chart의 입력·Action·State 갱신을 확인한다. DOM과 Svelte 구현에서 이미 마운트한 노드의 필수 입력을 `ready → pending → ready`로 바꿔 대기 표시, Action 시작 차단, 렌더 인스턴스와 로컬 상태 보존을 확인한다. 양쪽에서 keyed 재정렬, 슬롯 교체, cleanup 한 번, 예상한 시점의 완료와 늦은 이벤트 차단을 검증한다. 기본 UI는 직접 등록과 의존 등록에서 같은 기본 컴포넌트를 제공한다. DOM 단독 및 Svelte를 포함한 구성, 카탈로그의 대표적인 복합 DOM 레시피가 실제 브라우저에서 동작한다.

#### 등록 계약에서 Svelte 입력 타입 추론

1. `packages/svelte/src/lib/types.ts`의 공개 `ComponentAdapterProps<Contract>`를 선택형 타입 인자로 확장한다. `Contract`는 리터럴을 보존한 `ComponentContract`이며, 어댑터와 등록 코드는 같은 계약 파일을 참조한다. Core의 기존 스키마·포트 추론을 Action과 공유하고 읽기 전용 입력을 파생한다. 리터럴에서 타입을 산출할 수 없는 스키마와 Registry에서 해석하는 `typeRef`의 값 추론에는 `unknown`을 사용한다. 실행 시 계약 검증은 계속 Registry가 맡는다. [D162](../spec/12-resource-sets-browser.md#svelte-어댑터-입력-타입) · [현행 Core 타입 추론](../../packages/core/src/index.d.ts#L97) · [현행 Svelte props](../../packages/svelte/src/lib/types.ts)
2. `node`를 `status`로 구분하는 타입으로 제공한다. `ready`면 `node.inputs`의 필수 Value가 존재하고, 선택 Value는 선택으로 유지한다. `pending`, `error`, `missing`은 포트 입력의 존재를 보장하지 않는다. `State`·`Query` 포트는 기존 핸들 타입으로 두며 필수 State 핸들의 `read()`도 `undefined`를 반환할 수 있다. 기존 최상위 `inputs`와 타입 인자 없는 공통 어댑터는 호환을 유지한다. 상태에 따라 값을 좁히는 예제는 `node.inputs`를 사용한다.
3. `renderer.ts`의 `svelteComponent(contract, implementation)`은 첫 인수에서 리터럴 계약 타입을 결정한다. 둘째 인수는 `NoInfer`를 적용한 그 계약의 어댑터 타입과 비교한다. 둘째 인수로 계약 타입이 넓어지거나 잘못된 구현이 공통 어댑터 경로로 통과하지 않는지 검증한다. `index.ts`의 공개 export에서 기존 타입과 새 타입 인자 경로를 모두 제공한다. Connector 내부에는 현행 일반 `NodeSnapshot`을 전달하고, `ComponentMount.svelte`가 이미 표시한 노드를 대기로 전환하면 동일 인스턴스의 이전 입력이 남을 수 있게 한다. 처음 대기하는 노드에는 일부 입력이 없을 수 있다.
4. `packages/svelte/test/types/`에 별도 파일의 숫자 계약을 사용하는 어댑터, 문자열 계약에 같은 어댑터를 등록하는 실패, 준비 여부 확인 없이 필수 값을 `number`로 사용하는 실패를 넣는다. 대기 상태에서 이전 값을 읽으려면 `undefined`를 처리해야 하며, 선택 입력과 State 핸들, 기존 공통 어댑터도 검사한다. Svelte 브라우저 fixture는 첫 대기에서 값이 없는 경우와 `ready → pending → ready`에서 이전 값·렌더 인스턴스·로컬 상태를 유지하는 경우를 확인한다. 독립 패키지에서 계약과 바인딩을 내보내 생성한 `.d.ts`를 두 번째 소비 모듈이 읽도록 해, 배포 타입에서도 같은 추론과 계약 불일치 검사가 작동하는지 확인한다.

### 6. 독립 소비자 수락과 패키지 검증

`packages/dom/test/browser.test.mjs`는 혼합·수명·오류를, `packages/dom/test/public-consumer.test.mjs`는 배포 패키지의 독립 사용을 검증한다. fixture는 빌드한 tarball을 설치한 저장소 밖 임시 디렉터리에서 실행한다. `tsc`와 번들러의 입력 경로에서 workspace 별칭·`nodePaths`·Core/Svelte/UI 소스 경로·비공개 subpath를 제거한다. `npm pack --ignore-scripts`로 만든 로컬 tarball을 `npm install --ignore-scripts`로 설치한다. `import.meta.resolve`와 esbuild metafile로 `@viewstem/*`가 임시 `node_modules`의 공개 export에서만 들어왔는지 확인한다. [Core 소비 테스트](../../packages/core/scripts/test-package.mjs) · [Svelte 소비 테스트](../../packages/svelte/scripts/test-package.mjs) · [기존 UI 테스트의 번들 경로](../../packages/ui/test/consumers.test.mjs)

| 독립 설치 | 설치할 패키지와 검증 |
|---|---|
| Node | Core tarball만 설치한다. `common-set.ts`의 공통 셋을 가져와 `Runtime.invokeAction()`으로 일반 Action을 실행한다. HTML 환경이나 Svelte 없이 동작하고, 라우팅을 요구하는 호출은 시작 전에 실패한다. |
| DOM 단독 | Core·DOM·UI tarball을 설치한다. `dom-only.ts`에서 `ui` 셋을 명시 등록해 기본 Button을 번들하고 Chromium에서 렌더한다. 설치와 번들 입력에서 Svelte가 빠져 있는지 확인한다. |
| 혼합과 외부 연결자 | Core·DOM·UI·Svelte tarball과 현행 Svelte peer를 설치한다. `main.ts`의 단일 View는 공식 DOM Card 안에 공식 Svelte `Layout.svelte`를 넣고, Layout의 같은 슬롯에 공식 DOM Button과 `external-set.ts`의 keyed 외부 자식 두 개를 둔다. 외부 구현은 `external-connector.ts`의 자체 연결자가 마운트한다. |

혼합 사례에서 외부 자식 클릭이 같은 View의 Action과 State를 거쳐 DOM Button과 외부 자식의 표시를 갱신하는지 확인한다. 같은 슬롯에서 위치를 바꿔 외부 인스턴스를 보존하고 슬롯을 교체해 이전 인스턴스를 한 번 정리한다. 외부 셋 등록을 연결자 없는 Runtime에서 성공시킨 뒤 브라우저 연결에 공식·외부 연결자를 공급해 렌더하는 경우도 확인한다. 공통 셋 선등록 뒤 UI 확장 등록과 UI 확장을 통한 첫 의존 등록을 각각 실행한다.

공개 API 후속 검증은 기존 독립 소비 fixture에 추가한다. Node 소비자는 별도 파일의 코드 Action 계약과 기본 구현을 가져와 셋을 등록하고, 같은 계약으로 새 함수를 만들어 교체한 뒤 호출한다. 배포 타입으로 리터럴 추론과 명시적 `typeRef`를 검사하고, 실행에서는 권한 콜백의 Action ID와 독립 호출 취소를 확인한다. 혼합 소비자는 `whenRendered`를 생략한 동기 외부 연결자와 기존 비동기 Svelte 연결자를 한 View에서 사용한다.

CI의 공통 빌드에서 `npm run build:dom`, `npm run build -w @viewstem/ui`, `npm run build -w @viewstem/svelte`를 순서대로 실행한다. Node 22·24 호환 작업은 `npm run test:package`, `npm run test:svelte:package`, `npm run test:dom:package`를 실행한다. Playwright Chromium 설치는 현행 단계를 쓴다. Node 24 브라우저 작업에서는 `npm run test -w @viewstem/dom`, `npm run test -w @viewstem/ui`, `npm run test -w @viewstem/svelte`, `npm run test:browser`를 실행한다. npm 공개 발행은 별도 단계다. 그 단계에서 `.github/scripts/npm-release.mjs`의 패키지 목록에 DOM을 넣고, 비교 기준 `BEFORE_SHA`에 DOM 매니페스트가 없는 첫 변경을 `.github/scripts/npm-release.test.mjs`로 검증한다. npm 404는 현재 스크립트가 안내하는 최초 2FA 발행·Trusted Publisher 절차로 처리한다. [현행 CI](../../.github/workflows/core.yml) · [현행 발행 대상 선택](../../.github/scripts/npm-release.mjs)

#### 기본 Button과 Svelte 카운터 혼합 예제

1. `packages/dom/test/fixtures/public-consumer/`에 혼합 카운터 사례를 추가해 기존 독립 설치·컴파일·Chromium 경로로 실행한다. `index.html`의 마운트 요소, `src/counter-contract.ts`의 필수 정수 Value 포트, `src/Counter.svelte`의 타입 있는 어댑터, `src/main.ts`의 셋 등록·Action·View·마운트가 복사 가능한 한 앱을 이룬다. `createRenderer()`는 Svelte와 DOM을 연결한다. `dependencies: [ui]`로 기본 UI를 함께 등록하고 `@viewstem/ui/styles.css`와 `data-viewstem-ui`를 적용한다.
2. View에 `count` State를 `0`으로 선언한다. 단일 `shadcn.Card.Root`의 `default` 슬롯에 Svelte 카운터와 `shadcn.Button`을 둔다. 카운터는 `Value` 포트로 숫자를 읽고, 버튼의 `on.click`은 `defineCodeAction().implement()`로 등록한 Action의 `State` 포트에 같은 `/states/count`를 연결한다. Action이 핸들을 통해 State를 갱신한다. 가이드의 코드 옆에 두 포트의 차이, `click`을 제공하는 기본 UI 계약, 이벤트 입력과 State 바인딩을 설명한다.
3. 한·영 Svelte 마운트 가이드에 실행 예제를 싣고 로컬 패키지 설치와 Svelte TypeScript 클라이언트 빌드 설정으로 연결한다. 첫 표시를 기다리는 코드는 `await screen.whenRendered()`를 사용한다. View를 직접 조회·조작하는 코드는 `screen.ready`를 사용하는 경우로 설명한다. 화면 종료의 `screen.unmount()`와 앱 종료의 `renderer.dispose()`를 안내한다. 어댑터·타입 레퍼런스에는 계약 공유, 상태에 따른 `node.inputs` 사용을 반영한다. 오류 레퍼런스는 누락된 참조의 위치와 메시지, `onError`의 `prepare`·`node`·`render`·`action` 진단을 예제에 연결한다. [한국어 마운트 가이드](../../apps/docs/src/content/docs/ko/docs/svelte/guides/mount-in-svelte.md) · [영어 마운트 가이드](../../apps/docs/src/content/docs/docs/svelte/guides/mount-in-svelte.md) · [오류 레퍼런스](../../apps/docs/src/content/docs/ko/docs/svelte/errors.md)
4. Node 24 독립 앱의 공개 tarball로 예제를 실행한다. 처음 표시가 `0`, 버튼 클릭 뒤 `1`, Enter 뒤 `2`이고 `view.getState('count').read()`도 `2`인지 확인한다. 각 입력 직후에는 바뀐 문구를 기다린다. 종료 뒤 마운트 영역이 정리되는지 확인한다. 복사한 가이드의 코드로 같은 흐름을 확인하고, 잘못된 경로로 바꾼 예제에서 문서가 제시한 오류 코드·위치가 실제로 출력되는지 대조한다.

## 구현 순서와 검증 게이트

| 단계 | 구현 후 체크포인트 | 대표 검증 |
|---|---|---|
| 1. 셋·저장소 | 공개 셋 선언과 Registry 등록·교체를 제공한다. 기존 View와 연결자는 현재 바인딩 경로를 사용한다. | 새 `resource-set.test.mjs`, 기존 `registry.test.mjs`, 공개 키와 타입 검사, `npm run check`, `npm run test:package`. |
| 2. View 적용과 실행 | Core에 고정 구성, 일괄 적용, resolver 재검증 및 호출별 실행 구성을 연결한다. | 새 `resource-application.test.mjs`와 기존 `runtime-management.test.mjs`, `url-runtime.test.mjs`, `runtime-query.test.mjs`, `action.test.mjs`, `preflight-runtime.test.mjs`. `npm run check`, `npm run test:package`. |
| 3. DOM 공통 기반 | 기존 UI/Svelte와 병행해 공개 DOM 연결자와 투영 인터페이스를 제공한다. | `renderer-diagnostics.test.mjs`의 두 호스트 경로, 소규모 DOM fixture의 슬롯·투영·`ready`·실패 검증. `npm run check`, `npm run test:package`, `npm run check:dom`. |
| 4. 공식 연결자 전환 | UI/Svelte 트리 순회를 제거하고 공개 바인딩 검사와 `ready` 계약을 모든 공식 경로에 적용한다. | DOM/Svelte 양방향 혼합, UI 카탈로그와 Svelte context 회귀. `npm run check`, `npm run test:package`, `npm run test:browser`, `npm run check:dom`, `npm run check:svelte`, `npm run check:ui`, `npm run typecheck:docs`, `npm run build:docs`. |
| 5. 독립 tarball 소비 | 패킹 산출물로 headless, DOM 단독, 혼합 연결자 설치를 확인한다. | `npm run test:package`, `npm run test:svelte:package`, 새 `npm run test:dom:package`. Node 22·24 CI에서 공개 export·번들 의존성을 점검한다. |

### 경로별 바인딩 검사 전환

| 진입점 | 단계 1~3 | 단계 4부터 |
|---|---|---|
| `registerResourceSet()`·`replaceResource()` | 단계 1부터 셋이나 코드 리소스 교체 입력의 정의와 구현 연결을 함께 검증한다. | 동일. |
| `view.applyResourceSets()` | 단계 2부터 준비에서 새 View 구성이 투영한 `ready` 코드 노드의 바인딩을 검사한다. | 동일. |
| `runtime.createView()`·`view.replace()`·`updateDefinition()`·`setInputs()` | 기존 경로를 유지한다. 단계 3의 새 소유 DOM View는 생성과 이후 갱신·교체에도 준비 검사를 적용한다. | 모든 진입점에서 `ready` 코드 노드의 바인딩을 준비에서 검사한다. 이미 확정한 뒤 비동기 입력 상태가 바뀐 경우는 표시 단계에서 확인한다. |
| 렌더러 `mount()` | 기존 UI/Svelte는 첫 렌더를 기다리는 기존 호스트 경로를 쓴다. 단계 3의 새 DOM은 View 준비와 표시 연결이 성립하면 `ready`를 해결한다. | 모든 공식 `mount()`에서 새 `ready` 경로를 적용한다. |
| 렌더러 `attach(existingView)` | 새 DOM은 확정된 View를 빌린다. 새 DOM이 표시할 수 없는 노드는 연결별 렌더 오류로 처리한다. | 빌린 View의 구성은 유지하고 실제 연결자·슬롯은 표시 단계에서 확인한다. |

단계 3에서 `prepareOwnedView`와 호스트 내부에 전환용 옵션 `requireBindings`와 `readyOnConnection`을 둔다. 단계 4에서 두 옵션을 제거하고 정해진 계약을 기본화한다. 이때 Core의 `RendererHost` 제네릭에서 `HTMLElement` 기본값을 제거한다. 사용처가 브라우저 대상 타입을 지정하고 브라우저 공개 별칭은 `@viewstem/dom`이 제공한다.

### 단계별 테스트·소비부 이행

1. **단계 1.** `packages/core/test/public-api.test.mjs`의 root export와 Registry 키 단언에 `defineResourceSet`, `registerResourceSet`, `replaceResource`를 같은 변경에서 추가한다. `packages/core/test/types/public-api.ts`, `inference.ts`, `negative.ts`에 공개 타입과 Action 핸들러 추론·오류를 넣는다. `packages/core/scripts/test-package.mjs`가 실행하는 기존 공개 API 단언과 기존 View 스모크를 이 단계에서 통과시킨다.
2. **단계 2.** `public-api.test.mjs`, `types/public-api.ts`에 Runtime `invokeAction`과 View `applyResourceSets`를 추가한다. `resource-application.test.mjs`에 URL 선점·재시도 중 취소·무충돌 재시도·양방향 충돌을 배정한다. `url-runtime.test.mjs`에서는 StateStore 직접 연결의 URL 키 예약과 확정 후 쓰기를, `preflight-runtime.test.mjs`에서는 준비 콜백의 Action 차단과 확정 화면 이벤트를, `runtime-query.test.mjs`와 `action.test.mjs`에서는 실행 고정과 Runtime별 종료를 검증한다.
3. **단계 3.** `packages/dom/`에 4절의 소스·매니페스트와 `LICENSE`, `README.md`, `README.ko.md`, `test/browser.test.mjs`, `test/types/consumer.ts`, `test/types/tsconfig.json`을 추가한다. ESM과 `NodeNext`, ES2022를 사용한다. `exports["."]`에서 타입과 모듈은 `dist/index.d.ts`와 `dist/index.js`를 가리킨다. 패킹 파일은 `dist`, 두 README와 `LICENSE`이고 프로덕션 의존성은 Core다. `build`는 `tsc -p tsconfig.json`, `typecheck`는 `tsc -p test/types/tsconfig.json`, `test`는 `node --test test/browser.test.mjs`다. 루트 `package.json`에서 `build:dom`은 Core→DOM을 빌드하고 `check:dom`은 빌드 뒤 DOM 타입·브라우저 테스트를 실행한다. 같은 단계에서 `package-lock.json`을 갱신한다. Core의 `public-api.test.mjs`와 `types/public-api.ts`에는 `@viewstem/core/renderer` 공개 경로를, `renderer-diagnostics.test.mjs`에는 새 호스트의 연결 성공·렌더 실패 사례를 추가한다. 기존 호스트의 첫 렌더 실패 단언은 이 단계에서 유지한다.
4. **단계 4.** 5절의 Svelte·UI 소스 전환과 기존 순회 파일 제거를 아래 소비부 이행과 같은 변경에서 처리한다. 공개 API 기대값과 tarball 소비 스모크를 각 패키지의 새 표면과 함께 바꾼다.

   | 소비부 | 함께 이행하는 파일과 기준 |
   |---|---|
   | Core | `packages/core/scripts/test-package.mjs`, `test/browser-fixture.mjs`, `test/renderer-diagnostics.test.mjs`에서 실제 렌더의 테스트 바인딩과 공개 진입점을 이행한다. Core 스모크는 Core tarball만 설치한다. 첫 렌더 실패 단언을 `ready`의 View 반환, `whenRendered()`의 실패, 형제 유지로 바꾼다. 준비 바인딩 누락은 `ready`의 별도 실패 사례로 남긴다. |
   | Svelte | `packages/svelte/package.json`, 두 README, `example/App.svelte`, `example/definition.ts`, `example/main.mjs`, `example/adapters/`와 예제 README를 이행한다. `scripts/test-package.mjs`에서 Core·DOM·Svelte tarball을 함께 설치하도록 바꾸고 기존 `bindComponent` 호출과 export 단언을 새 셋과 공개 연결자 API로 바꾼다. `test/browser-fixture.mjs`, `test/browser.test.mjs`, `test/fixtures/{Host,SourceHost}.svelte`, `test/types/{TypedAdapter,TypedHost}.svelte`, `test/types/consumer.ts`를 새 슬롯·오류·context 호출에 맞춘다. |
   | UI | `packages/ui/package.json`, 두 README, `test/{consumers,goldfish-regressions,recipe-behavior,renderer}.test.mjs`, `test/hosts/shared.mjs`를 새 `ui` 셋과 DOM 진입점에 맞춘다. 소비 테스트는 Core·DOM·UI tarball을 설치하고 기존 Vanilla·React·Vue·Svelte 호스트에서 공식 DOM 연결 경로를 검증한다. |
   | docs 앱 | `apps/docs/package.json`, `src/components/playground-renderer.ts`, `src/examples/{preview,component-demo-ui-runtime,component-demo-ui-setup}.ts`를 이행한다. `ComponentDemo.astro`, `ExamplePreview.astro`, `ExamplesPage.astro`, `PlaygroundPage.astro`의 실행·복사 결과와 `HomePage.astro`의 코드 예시를 확인한다. `src/content/docs/{docs,ko/docs}/` 아래 양쪽 언어의 `quickstart/index.md`, `guides/{conditional-settings,form-validation,keyed-list,query-dashboard}.md`, `svelte/{renderer,adapters}.md`, `ui/{api,guides/mount-in-browser}.md`에서 교체한 API 예시를 갱신한다. |
   | 워크스페이스·CI | 루트 `package.json`의 `build:svelte`·`build:ui`에서 `build:dom`을 선행 실행한다. Svelte·UI·docs 매니페스트의 직접 DOM 의존을 `package-lock.json`에도 반영한다. `.github/workflows/core.yml`의 공통 빌드는 Core→DOM→UI·Svelte 순으로 바꾸고 DOM 타입·브라우저 검증을 추가한다. |

   Core 테스트 중 `packages/core/test/`의 `action-acceptance.test.mjs`, `action.test.mjs`, `preflight-{io,runtime,values}.test.mjs`, `query-acceptance-gaps.test.mjs`, `runtime.test.mjs`, `runtime-{composition,derived-dependencies,management,query,review-regression,subscription-projection,ui-review}.test.mjs`, `state-integration.test.mjs`, `url-runtime.test.mjs`에서 실제 `ready` 코드 노드가 있는 View를 생성할 때는 렌더러에 독립적인 불투명 바인딩을 등록한다. 기존 기대값이 바인딩 누락을 검증하는 경우는 누락을 유지한다. Registry의 선언 등록 검사와 타입 fixture는 확인하려는 공개 계약에 맞춰 수정한다.

5. **단계 5.** `packages/dom/test/public-consumer.test.mjs`와 `test/fixtures/public-consumer/`의 `common-set.ts`, `headless.ts`, `dom-only.ts`, `main.ts`, `external-set.ts`, `external-connector.ts`, `Layout.svelte`, `tsconfig.json`을 추가한다. fixture를 독립 설치 디렉터리로 복사해 그 디렉터리에 설치된 Svelte 컴파일러와 공개 배포 타입을 사용한다. 루트 `test:dom:package`는 이 테스트를 실행하고 `.github/workflows/core.yml`의 Node 호환 작업은 빌드한 패키지를 이 테스트로 검증한다.

기존 테스트를 변경할 때는 새 공개 진입점으로 fixture를 이행하고 보존 대상의 관찰값을 유지한다. 새 검증은 원자 재검증, 고정 구성, 슬롯 교체·렌더 실패 격리, 공개 연결자처럼 종전 검사에서 입증하지 못한 계약에 집중한다. 이 표의 명령은 구현 후 실행하며 `check:dom`과 `test:dom:package`는 새로 추가할 명령이다. [현행 검증 절차](../handoff/implementation-start.md#수정-후-검증)

### 공개 API 후속 구현 순서

리소스 셋과 혼합 렌더링이 구현된 상태에서 아래 순서로 작업한다. 각 단계의 대표 검증을 통과한 뒤 다음 단계로 진행한다.

| 순서 | 구현과 수락 조건 | 검증 경로 |
|---|---|---|
| 1. 코드 Action 작성 | Core 루트에 `defineCodeAction()`을 공개한다. 별도 파일에서 가져온 리터럴 스키마 엔트리와 명시적 `typeRef` 엔트리가 셋 등록·교체 양쪽에서 컴파일된다. 잘못된 입력 가정이나 반환값은 `.implement()`에서 타입 오류가 난다. 같은 계약으로 만든 새 함수가 게시되면 기존 호출과 View, 새 호출과 명시 적용한 View가 D154에 따라 각각 함수를 선택한다. 입출력이나 필수 기능이 달라진 동일 ID 교체는 거절한다. | `core/test/public-api.test.mjs`, `core/test/types/{public-api,inference,negative}.ts`, `core/test/resource-set.test.mjs`. `npm run check`와 `npm run test:package`. |
| 2. 권한 콜백 | 등록된 코드형·선언형 Action에 실제 실행 대상의 ID를 전달한다. 계약이 같은 두 ID 중 하나만 허용했을 때 다른 쪽의 본문은 실행되지 않는다. Runtime·View의 직접 호출, View 이벤트, 코드·선언형 하위 호출에 같은 검사를 적용한다. 인라인은 이벤트 관찰 ID나 단계 ID가 있어도 `null`이며, 하위 호출은 자기 Action을 식별한다. 같은 ID의 정의가 교체됐을 때 기존 View와 새 실행이 권한 검사와 실행에 각각 자기 스냅샷의 정의를 쓰는지 확인한다. | `core/test/action.test.mjs`, `core/test/action-acceptance.test.mjs`, `core/test/types/public-api.ts`. `npm run check`. |
| 3. 호출 단위 취소 | Runtime과 View 양쪽에서 사전 취소 시 권한 검사와 본문이 0회인지 확인한다. 실행 중 부모·하위 호출을 지연시키고 취소해 두 신호의 취소와 `CANCELLED`를 관찰한다. 같은 소유자의 다른 독립 호출은 정상 완료한다. 취소 전 쓰인 State와 시작된 외부 효과는 보존하고, 취소 뒤 새 작업과 늦은 성공·실패는 반영하지 않는다. 권한 콜백 도중 취소와 기존 Runtime·View 종료도 재검증한다. | `core/test/action-acceptance.test.mjs`, `core/test/owned-lifetime.test.mjs`, `core/test/types/{public-api,negative}.ts`. `npm run check`와 `npm run test:package`. |
| 4. 연결자 완료 대기 | 동기 DOM 카탈로그와 외부 fixture의 빈 `whenRendered()`를 제거하고 Svelte의 `tick()` 대기를 검증한다. 타입 검사에서 `whenRendered` 생략을 허용하고 `update`, `setPending`, `dispose` 누락을 각각 거절한다. 동기 부모가 제공한 슬롯의 비동기 자식까지 표시 연결이 기다리는지, 이미 마운트한 노드의 대기·복구 상태가 보이는지, 대체된 비동기 렌더의 늦은 실패가 무시되는지 확인한다. | `dom/test/types/consumer.ts`, `dom/test/browser.test.mjs`, Svelte·UI 회귀. `npm run check:dom`, `npm run check:svelte`, `npm run check:ui`. |
| 5. 독립 소비자와 문서 | 6절의 독립 앱에서 빌드한 tarball의 공개 타입과 런타임을 확인한다. 한·영 Core Registry·Runtime 레퍼런스는 코드 Action 작성·권한·취소 예제를 갱신한다. DOM 연결자 안내에는 동기 예제와 비동기 렌더·슬롯 완료 순서를 싣는다. | `npm run test:package`, `npm run test:dom:package`, `npm run typecheck:docs`, `npm run build:docs`. |

### 혼합 View 리뷰 후속 구현 순서

앞선 공개 API의 구축 상태를 기준으로 아래 세 단계를 진행한다. 각 단계의 검증을 통과한 뒤 다음 단계로 넘어간다.

| 순서 | 완료 기준 | 검증 경로 |
|---|---|---|
| 1. 참조 검증과 오류 메시지 | D163의 준비 오류와 정확한 위치, 열린 View 적용의 원자적 거절, 값이 아직 없을 때 노드만 대기, 실행 시 타입 오류의 노드 진단을 검증한다. D164에 따라 단일 루트는 허용하고 배열은 공개 타입과 준비 검사에서 거절하는 회귀를 확인한다. | `packages/core/test/{registry,resource-application,preflight-runtime,renderer-diagnostics}.test.mjs`, `packages/core/test/types/negative.ts`. `npm run check`, `npm run test:package`. |
| 2. Svelte 입력 타입 추론 | D162의 준비 상태와 대기 상태별 타입, 잘못된 계약의 등록 거절, 기존 어댑터 호환을 확인한다. 같은 렌더 인스턴스에서 대기 전환과 복구를 재현하고 외부 패키지에서 내보낸 선언 파일의 타입을 두 번째 소비 모듈에서 확인한다. | `packages/svelte/test/types/`, `packages/svelte/test/browser.test.mjs`, `packages/svelte/scripts/test-package.mjs`. 독립 설치 검증까지 포함한 `npm run check:svelte`. |
| 3. 혼합 예제와 가이드 | 문서에서 복사한 코드와 독립 소비 fixture에서 같은 버튼·상태 갱신과 오류 메시지를 확인한다. 양쪽 언어의 예제, 공개 타입과 오류 설명을 대조하고 문서 빌드를 확인한다. | `npm run build:ui`, Node 24에서 `npm run test:dom:package`, `npm run typecheck:docs`, `npm run build:docs`. |

#### 혼합 View 후속 검증 결과

2026-11-18 Node 24.19.0에서 세 단계를 순서대로 검증했다. 패키지 검증에는 현재 작업 트리에서 빌드한 Core·DOM·Svelte·UI 0.1.0 tarball을 해당 소비 경로에 맞춰 설치했다.

- 참조 검증 단계의 `npm run check`에서 Core 테스트 1,168개와 타입·커버리지를 통과했다. `npm run test:package`에서 Core 공개 타입과 실행 경로를 확인했다. 별도 렌더러 진단 회귀에서 resolver가 가져온 리소스 내부의 참조 위치까지 확인했다.
- `npm run check:svelte`에서 타입 검사와 브라우저 테스트 45개를 통과했다. 외부 Svelte 패키지가 어댑터와 바인딩의 `.d.ts`를 생성했고 두 번째 TypeScript 소비자가 그 계약으로 등록을 검사했다.
- `npm run test:dom:package`에서 한·영 가이드 코드와 오류 JSON을 fixture와 대조했다. Chromium에서 클릭과 Enter로 `0 → 1 → 2`가 표시됐고, 잘못된 정의 적용의 거절 뒤 기존 DOM과 State가 보존됐다. `npm run typecheck:docs`는 오류·경고 0건이었고 `npm run build:docs`는 323페이지를 생성했다.

## EGM 발견과 검증 대응

| 리뷰 항목 | 계획의 적용 위치와 관찰값 |
|---|---|
| F1 · 열린 View 수명과 다중 표시 | 상세 계획 2·3·4절. 추가 적용에서 편집값·인스턴스·조회/저장 실행을 보존한다. 교체는 새 내부 수명이다. 빠른 연결과 느린 연결의 완료, 새로 붙는 연결의 기존 설정 선택, 이벤트 유효성을 관찰한다. |
| F2 · 실패 단계 | 상세 계획 2·4절. 준비 중 발견한 누락은 설정·정의 보존으로, 적용 뒤 한 연결의 렌더 실패는 그 연결의 완료 오류 및 독립 노드 렌더 유지로 관찰한다. |
| F3 · 저장소 범위와 경합 | 상세 계획 1·2절. 기본 격리·명시 공유, 셋과 resolver가 먼저 성공하는 두 순서와 충돌 없는 동시 등록에서 값 유실을 검사한다. |
| F4 · headless와 의존 합성 | 상세 계획 1·3·6절. Node 단독 import와 Action, 공통 셋 선등록 뒤 UI 확장, 다이아몬드 의존 재사용을 확인한다. |
| F5 · slot 수명 | 상세 계획 4·5절. 양방향 혼합, 같은 슬롯 재정렬, 컨테이너 교체 시 렌더 정리·마운트 각 한 번과 core State 보존, 지연 완료와 오래된 이벤트를 확인한다. |
| F6 · 실행 코드와 호스트 기능 | 상세 계획 1·3·6절. 이미 등록한 구현만 참조하고 선언형 resolver 경로를 검증한다. routing 미공급에서도 셋 등록과 일반 Action이 가능하며 대상 Action은 시작 전에 실패한다. |
| F7 · 외부 연결자 | 상세 계획 6절. 저장소 밖 독립 소비자가 공개 export만 써서 작성한 셋과 연결자를 공식 연결자와 한 View에서 실행한다. |
| F8 · 등록 식별 | 상세 계획 1절. 서로 다른 종류의 동일 ID 성공, 같은 `(kind, id)` 충돌의 전체 거절, ID당 구현 하나를 검증한다. |

### 9단계 재리뷰 반영 위치

| 재리뷰 지적 | 반영한 구현·검증 계획 |
|---|---|
| 1. 코드 Action 교체와 D154 | 1·3절. 같은 계약에서 명시 교체하고 각 호출·View의 함수 선택을 검증한다. |
| 2. 후보·재시도·URL 예약 | 2절. 마지막 콜백, 취소·리비전·URL 키 확인, 동기 게시, 외부 통지 순서를 지정한다. 준비 콜백의 Action 차단, 예약 충돌, 재시도 도중 취소와 무충돌 성공을 각각 검증한다. |
| 3. 표시 연결까지 투영 번호 전달 | 4절. 투영 순번과 실행 바인딩을 함께 전달한다. 연결별 최신 렌더 결과, 늦은 실패, 준비와 렌더의 완료를 각각 검증한다. |
| 4. 단계별 Core 검증 | 단계 1~4. 각 공개 키·타입 변경에 맞춰 단언을 갱신하고 완료 진단과 Core tarball 스모크를 전환한다. |
| 5. 공식 연결자와 소비부 이행 | 단계 3~5. DOM 패키지·lockfile부터 기존 예제·테스트·문서·CI와 독립 tarball까지 같은 단계에서 검증할 경로를 지정한다. |
| 주요 보완 사항 | 1절의 셋 소유 키, 3절의 실행 구성과 기능 주입, 4·5절의 슬롯 등록·정리·대기·카탈로그 태그 전환, 바인딩 검사 전환표, 6절의 독립 소비 트리와 모듈 해석 검증에 반영했다. |

구현 종료 시 각 수락 사례에 실행 명령, 결과, 사용한 패키지 산출물을 기록한다. 명세와 이 계획을 읽은 사실은 동작 검증을 대신하지 않는다. [수락 시나리오 원본](../handoff/resource-sets-browser-2026-11-16.md#후속-수락-시나리오)
