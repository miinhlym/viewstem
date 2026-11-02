# 공개 API 네이밍 검토 · 2026-11-02

후속 U42: 권고 이름 전체를 적용했다. 이 문서의 이전 이름·제안·검증 수는 당시 기록이며, 현재 사용법과 새 검증은 [네이밍 적용 인계](public-api-naming-2026-11-02.md)를 따른다.

**검토 제안이며 채택된 계약이 아니다.** U41 이후 실제 공개 선언과 구현을 조사했다. 이번 작업은 이 보고서만 추가하며 패키지 코드·현재 명세·기존 검증 결과를 변경하지 않는다. 아래 변경명은 아직 import하거나 호출할 수 없다.

## 범위와 판단 기준

TypeScript compiler API로 공개 export를 열거했다. 실행 export 12개, core 타입 72개, HTTP 타입 4개, CEL 타입 4개, Svelte 타입 82개다. 재노출을 제외한 고유 타입은 86개다. Svelte의 82개 중 71개는 core 타입이며 별도 구현이 아니다. 반환 객체의 메서드·수명/완료 속성·호스트 callback 이름도 아래에서 대조했다. 리소스 JSON의 모든 DSL 필드와 kind 값을 개명하는 검토는 아니다.

동일한 기준을 적용한다: 실제 수행 동작, 대상과 소유권, 부작용/수명 변경, 비동기 완료 범위, 프로젝트 내부 일관성, 참고 라이브러리와의 의미 차이, 변경 비용. 다른 라이브러리에 같은 철자가 있다는 것만으로 동작 호환성을 주장하지 않는다. **P1은 동작 오해를 줄이는 변경, P2는 일관성·발견성 개선**이다. 대안의 우열은 이 프로젝트에 대한 판단이며 공식 표준이라는 뜻이 아니다.

조사 기준: [core 선언](../../packages/core/src/index.d.ts), [HTTP 선언](../../packages/core/src/http.d.ts), [CEL 선언](../../packages/core/src/cel.d.ts), [Svelte 진입점](../../packages/svelte/src/lib/index.ts), [Svelte 계약](../../packages/svelte/src/lib/types.ts). 의미 확인에는 `api.mjs`, `runtime.mjs`, `registry.mjs`, `state.mjs`, `url.mjs`, `grid.mjs`, `cel/limits.mjs`, Svelte `connection.ts`를 사용했다.

## 공식 레퍼런스와 적용 한계

| 공식 자료 | 확인한 관례 | Viewstem에 적용할 판단 |
|---|---|---|
| [Svelte 런타임](https://svelte.dev/docs/svelte/svelte) | mount/unmount는 컴포넌트와 target 연결. tick은 보류 중 상태 반영, settled는 그로 인한 비동기 작업까지 기다림. transformError 옵션 제공 | DOM mount는 유지. tick에 기반한 Viewstem settled와 범위를 구분. 오류 hook 이름은 유지 |
| [React createRoot](https://react.dev/reference/react-dom/client/createRoot) | root 생성 후 render, 종료 시 unmount. 같은 root의 render는 화면을 갱신 | 생성·DOM 연결·갱신·종료를 구별하되 core 전체 수명을 unmount로 부르지 않음 |
| [Vue Custom Renderer](https://vuejs.org/api/custom-renderer), [Application](https://vuejs.org/api/application) | createRenderer는 호스트 렌더링 기능 구성. 앱은 mount와 component 등록을 제공 | renderer라는 책임명은 적절하지만 Vue의 저수준 renderer와 동일한 기능이라고 설명하지 않음 |
| [JSON Forms Custom Renderers](https://jsonforms.io/docs/tutorial/custom-renderers/) | UI schema에 대응하는 renderer 구현을 registry에 등록 | 선언 계약과 프레임워크 구현을 구분할 근거. tester/ranking 방식까지 Viewstem에 도입할 이유는 없음 |
| [XState Actors](https://stately.ai/docs/actors) | createActor, getSnapshot, subscribe, send, start/stop을 구분 | getter/구독 이름 참고. 조사 시 사이트는 v6 alpha 표기도 포함하므로 안정 버전 표준이라고 주장하지 않음. Action 호출을 actor 메시지 모델로 바꾸지 않음 |
| [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore) | subscribe/getSnapshot 쌍과 snapshot 안정성 요구 | getSnapshot 명칭을 참고하되 이름 변경만으로 React adapter 적합성이 생기지는 않음 |
| [Zustand createStore](https://zustand.docs.pmnd.rs/reference/apis/create-store), [Jotai Store](https://jotai.org/docs/core/store) | createStore 및 getState/setState/subscribe, 또는 get/set/sub | 생성·관찰이라는 관례는 공유하지만 읽기/쓰기 철자 하나가 유일한 정답은 아님 |
| [MobX reactions](https://mobx.js.org/reactions.html), [transaction](https://mobx.js.org/api.html#transaction) | reaction 등록이 disposer를 반환. transaction은 동기 작업 묶음 | 등록/수명 의미 참고. Viewstem의 고정 reaction 값과 원자 롤백까지 MobX와 같다고 보지 않음 |
| [Solid batch](https://docs.solidjs.com/reference/reactive-utilities/batch) | callback 안의 반응형 갱신을 묶음 | 배열을 받는 Viewstem batch는 writeBatch로 대상 동작을 드러내는 편이 명확 |
| [TanStack QueryClient](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient) | refetchQueries, invalidateQueries, resetQueries를 구별 | Viewstem의 refresh/retry와 실제 실행·취소·실패 조건이 다르므로 이름만 그대로 가져오지 않음 |
| [Lit lifecycle](https://lit.dev/docs/components/lifecycle/#updatecomplete) | updateComplete Promise로 갱신 완료를 표현하며 자식 완료 범위는 별도 | 완료 속성에 무엇의 완료인지 넣을 근거. Viewstem의 Query·DOM 완료 범위는 자체 계약을 따름 |
| [Vega View](https://vega.github.io/vega/docs/api/view/) | View 생성, initialize, runAsync, finalize를 구분 | 선언 실행과 컨테이너 연결은 구분 가능. Vega 이름을 전부 복사할 필요는 없음 |
| [Ajv API](https://ajv.js.org/api.html), [math.js expression API](https://mathjs.org/docs/expressions/parsing.html) | compile로 실행 가능한 결과를 만들고 evaluate로 평가. 등록/조회 메서드는 역할별 명명 | compileCel/evaluateCel 및 등록/조회 구분을 유지할 근거 |
| [GraphQL Tools HTTP executor](https://the-guild.dev/graphql/stitching/docs/getting-started/remote-subschemas) | buildHTTPExecutor가 실행 함수를 구성 | createHttpExecutor의 역할명이 타당. GraphQL 프로토콜이나 build 접두사를 가져오지는 않음 |
| [Floating UI computePosition](https://floating-ui.com/docs/computeposition) | 배치 계산을 동사 compute로 드러냄 | gridLayout에 compute 접두사를 붙일 근거. 좌표 체계·DOM 측정 방식이 같다는 뜻은 아님 |

## 권고 요약

구조는 유지한다. Svelte/core 분리, HTTP/CEL subpath, 팩토리와 공개 핸들 방식은 현재 책임과 맞는다. 모든 이름을 더 짧게 만들거나 다른 프레임워크와 동일하게 만드는 것은 목표가 아니다.

| 우선순위 | 현재 | 권고 | 이유 |
|---|---|---|---|
| P1 | `registry.registerComponent` | `registerComponentContract` | 계약만 등록하는 호출을 실제 Svelte 구현 등록과 구별 |
| P1 | `runtime.mount` | `createView` | DOM target 없이 실행 View를 생성하는 작업. renderer.mount와 구별 |
| P1 | `initial` | `initialComplete` | 값이나 초기 상태가 아니라 초기 적용의 완료 Promise임을 드러냄 |
| P1 | `settled()` | `whenRendered()` | 현재 projection의 DOM 반영 대기. Svelte settled처럼 모든 비동기 작업을 기다리지 않음 |
| P1 | `celLimits` | `defaultCelLimits` | 실제로 변경 가능한 한도의 기본값이며 현재 evaluator의 적용값이나 절대 상한이 아님 |
| P2 | State/Query/View의 `snapshot()` | `getSnapshot()` | 기존 getState/getQuery와 getter 표현을 맞춤 |
| P2 | Store/URL 연결의 `diagnostics()` | `getDiagnostics()` | 진단 생성/실행이 아니라 저장된 진단 조회 |
| P2 | `gridLayout` | `computeGridLayout` | UI Component나 설정 객체가 아닌 순수 배치 계산 |
| P2 | `registry.export`, `runtime.describeResource` | 각 객체의 `exportResource` | 두 구현 모두 리소스 정의 복사본 반환. 설명 DTO 생성과 혼동하지 않음 |
| P2 | `store.batch` | `writeBatch` | callback 실행이 아니라 State 쓰기 목록의 원자 적용 |
| P2 | `store.reaction` | `registerReaction` | 고정 reaction 규칙을 등록하고 해제 함수를 반환 |

`initialComplete`는 오류 없는 전체 준비를 뜻하지 않는다. 실행 가능한 최초 Query들의 성공/개별 오류가 정리된 시점이며 외부 입력 대기가 남을 수 있다. Svelte의 해당 Promise는 DOM 반영까지 포함한다. `whenRendered()`는 현재 DOM 반영만 기다리고 Query 완료·paint·호스트 컴포넌트의 모든 비동기 작업은 기다리지 않는다. 이 차이는 이름뿐 아니라 타입 주석과 예제에도 남겨야 한다. 위 이름들은 이런 제한을 표현하기 위한 제안이다.

## 실행 export 12개 전수 검토

| 진입점 | 현재 API | 판단 |
|---|---|---|
| core | `createRegistry` | 유지. 등록 집합 생성이며 createRuntime과 일관됨 |
| core | `createRuntime` | 유지. DOM에 종속되지 않는 실행기라는 책임이 맞음. createApp은 실제 앱 전반을 소유하는 듯한 의미가 추가됨 |
| core | `createStateStore` | 유지. 단순 createStore보다 저장 대상이 분명하고 Svelte store와도 구별 |
| core | `mergeOwnedUrl` | 유지. 소유 키만 병합하는 순수 함수. syncUrl은 연결/부작용을 암시하고 updateUrl은 실제 위치 변경으로 오해 가능 |
| core | `gridLayout` | P2 computeGridLayout |
| core/http | `createHttpExecutor` | 유지. 단순 fetch wrapper가 아니라 계획·인증·secret·취소 실행 함수 구성. Http는 도메인 구분에 유용 |
| core/cel | `compileCel` | 유지. 소스를 준비해 재사용 평가 함수를 생성. parseCel은 검증·실행 준비 의미를 축소 |
| core/cel | `evaluateCel` | 유지. 직접 평가와 compile 단계를 구별. Cel은 언어 구분이며 불필요한 프레임워크 접두사와 역할이 다름 |
| core/cel | `celLimits` | P1 defaultCelLimits. `src/cel/limits.mjs`의 기본값을 재노출하고 custom limits로 덮어쓸 수 있음 |
| svelte | `createRenderer` | 유지. Svelte 이름을 다시 붙이지 않음. Runtime을 기본 생성한다는 편의는 옵션·소유권 문서에서 설명 |
| svelte | `ViewstemView` | 유지. 호스트 앱의 View, core의 View 타입과 구별. View만 남기려면 타입 충돌까지 다루는 별도 export 설계가 필요 |
| svelte | `transformError` | 유지. Svelte root의 같은 이름 옵션과 대응. sanitizeError는 일반 오류 정제 함수처럼 보이나 현재 구현은 렌더러용 오류로 제한적으로 매핑 |

`@viewstem/core/cel-support.json`은 지원 목록 데이터 경로로 유지한다. 공개 패키지 이름과 subpath는 변경하지 않는다.

## 객체 메서드·속성 전수 대조

동일 의미의 메서드는 한 행으로 묶었다. 공개 타입에 없는 내부 메서드는 검토 대상에서 제외했다.

| 객체 | 현재 이름 | 판단 |
|---|---|---|
| Registry | `registerResources`, `updateResource` | 유지. 복수 신규 등록과 기존 식별자의 정의 갱신을 구별. updateResource는 부분 patch API가 아님 |
| Registry | `registerComponent` | P1 registerComponentContract |
| Registry | `registerAction` | 유지. 계약과 구현 함수를 함께 받으므로 실제 Action 등록이라는 표현이 맞음 |
| Registry | `get`, `list` | 유지. Registry라는 수신 객체에서 조회 대상이 분명. get은 readonly 정의, list는 목록 복사본이라는 차이를 문서화 |
| Registry | `export` | P2 exportResource. 반환은 JSON 문자열이 아닌 정의 객체 복사본이므로 serialize로 바꾸지 않음 |
| Registry | `isCode` | 유지. 코드형 리소스 여부라는 기존 모델 용어. 자동 완성만을 위해 isCodeResource까지 늘릴 필요는 낮음 |
| Runtime | `registry`, `stateStore` | 유지. 주입한 공개 객체와 동일하다는 소유권 계약 유지 |
| Runtime | `mount` | P1 createView. 반환 구조 `{view, initialComplete}`는 별개 제안으로 명시 |
| Runtime / NativeContext | `invokeAction` | 유지. 호출 결과를 Promise로 받으며 취소·재귀 검사를 수행. dispatch/send 같은 큐·이벤트 단어로 바꾸지 않음 |
| Runtime | `listResources` | 유지. Runtime은 여러 종류의 실행을 제공하므로 대상 명사가 필요 |
| Runtime | `describeResource` | P2 exportResource. 현재는 Registry.export에 그대로 위임 |
| View / RenderedView | `update`, `replace` | 유지. update는 기존 연결/상태 유지, replace는 새 수명·정의 주입. update를 patch로 바꾸면 전체 spec 인자를 잘못 설명 |
| View | `exportDefinition` | 유지. 반환은 Resource 외피가 아닌 현재 ViewSpec이며 실행 상태 snapshot과 구별 |
| View / Scope | `getState` | 유지. 현재 셀의 capability를 얻는 호출. 값은 반환 핸들의 read로 구별 |
| View | `getQuery` | 유지. 사용 인스턴스의 Query 핸들 획득 |
| View / StateHandle / QueryHandle | `snapshot` | P2 getSnapshot. 반환 의미·동일성·읽기 전용 여부는 그대로 |
| View / StateStore / UrlAdapter | `subscribe` | 유지. 구독을 등록하고 해제 함수를 반환하는 친숙한 관례 |
| View / AdapterProps | `emit` | 유지. 선언된 Component 이벤트 발생. Action 결과 전달·거절을 유지하며 Node EventEmitter와 같은 반환 계약이라고 보지 않음 |
| StateHandle | `read`, `write`, `reset` | 유지. cell.read/write는 명확하며 Scope.getState와 혼동하지 않음. reset은 missing을 포함한 초기 기준으로 복원 |
| StateHandle / Scope | `address`, `generation`, `scopeId` | 유지. 주소·교체 세대·소유 범위 식별을 구분 |
| QueryHandle | `refresh`, `retry` | 유지. refresh는 명시적 새 실행, retry는 error에서만 복구 실행. refetch로 바꿔 TanStack의 cache·취소 정책을 암시하지 않음 |
| StateStore | `createScope` | 유지. StateStore 문맥에서 범위 생성임이 분명 |
| StateStore | `transaction` | 유지. 동기 원자 변경·예외 시 롤백이라는 의미. 일반 UI batching보다 보장이 강함 |
| StateStore | `batch` | P2 writeBatch. State 쓰기 배열과 transaction(callback)을 구별 |
| StateStore | `reaction` | P2 registerReaction. MobX와 달리 고정 watch/target/value 선언을 받음 |
| StateStore | `connectUrl` | 유지. 관찰/동기화 연결을 만들며 단발 URL 갱신이 아님 |
| StateStore / UrlConnection | `diagnostics` | P2 getDiagnostics |
| Scope | `registerState`, `replaceState`, `removeState` | 유지. 이름을 등록, 새 세대로 교체, 해당 셀 제거라는 서로 다른 수명 동작 |
| Scope | `connectClock` | 유지. Clock 공급과 State 셀 사이의 지속 연결. 현재 시간 자동 생성으로 오해하지 않도록 타입을 유지 |
| UrlAdapter | `read`, `writeOwned` | 유지. 읽기는 현재 URL, 쓰기는 소유 키 patch만 전달 |
| UrlConnection | `ready`, `isReady` | 유지. URL 초기 준비 상태로 한정. 전체 View 초기 적용과 같은 신호로 합치지 않음 |
| UrlConnection | `restore`, `removeOwned` | 유지. URL→State 복원과 소유 URL 키 정리를 구별. removeOwned는 대상 State 셀 삭제가 아님 |
| Renderer | `registry`, `runtime` | 유지. 생성된 core 핸들 접근이며 별도 사용자 import 불필요 |
| Renderer | `registerComponent` | 유지. 실제 Svelte 구현 등록. 계약 쪽 메서드 이름만 구체화 |
| Renderer | `mount`, `attach` | 유지. mount는 View 생성/소유와 DOM 연결, attach는 기존 View를 빌려 DOM에 연결 |
| RenderAttachment / RenderedView / ViewstemView export | `settled` | P1 whenRendered. 실제 구현은 tick 후 연결 수명과 렌더 오류를 검사 |
| RenderAttachment / RenderedView / ViewstemViewProps | `view` | 유지. core View와 DOM attachment를 구별 |
| ApplicationResult / runtime.mount 결과 / RenderedView | `initial` | P1 initialComplete. update/replace 결과에도 동일 변경 필요 |
| Registry 외 수명 객체 | `dispose` | 유지. Runtime/View/Scope/Store/URL 연결은 DOM 외의 수명도 정리. Svelte attachment는 소유한 것만 정리. 일괄 unmount/destroy/stop 개명은 권고하지 않음 |
| AdapterProps | `inputs`, `node`, `renderSlot` | 유지. 평가된 입력·인스턴스 snapshot·이름 있는 slot 렌더링을 구분 |

이름만으로 소유권을 완전히 표현할 수는 없다. `attach(...).dispose()`는 빌린 View를 보존하고 `mount(...).dispose()`는 소유 View도 폐기한다는 계약은 계속 필요하다. 이름 변경 과정에서 이 동작을 통일하면 리팩토링이 아닌 기능 변경이다.

## 옵션·callback·결과 필드

| 범주 | 이름 | 판단 |
|---|---|---|
| Runtime 생성 | `registry`, `stateStore`, `requestExecutor`, `resourceResolver`, `authorize`, `functions`, `requestTimeoutMs`, `clock` | 유지. 실행기·리소스 해석·권한·함수 등록을 구분. `clock`은 TimerClock임을 타입/주석으로 명시 |
| Svelte 생성/연결 | `runtime`, `onError`, `target`, `context`, `fallback` | 유지. 관찰 callback인 onError와 변환 callback인 transformError를 구별 |
| HTTP 실행기 | `transport`, `requestTimeoutMs`, `caller`, `clock`, `authorize`, `resolveSecret` | 유지. transport는 fetch-compatible 함수이고 RequestExecutor와 다른 계층 |
| Clock / TimerClock / HTTP clock | `now`, `subscribe`, `setTimeout`, `clearTimeout`, `set`, `clear` | 명칭 자체는 수용 가능. 업무 Clock과 타이머 clock을 합치지 않음. Runtime/HTTP의 clock 구조가 다른 점은 별도 타입 설계 과제이며 scheduler라는 이름만 붙여 해결했다고 보지 않음 |
| NativeContext / CelFunction | `inputs`, `signal`, `invokeAction`, `name`, `output`, `run` | 유지. 부모 연결 하위 호출과 순수 동기 함수 실행 계약을 이름 변경으로 혼합하지 않음 |
| CEL 설정 | `inputs`, `output`, `functions`, `limits`, `cost` | 유지. cost는 평가 예산으로 설명. limits의 expressionChars/inputNodes/outputNodes/valueBytes/depth는 단위·대상을 드러냄 |
| URL 연결 | `adapter`, `bindings`, `restore`, `limits`, `onError`; `key`, `history`; `mode`, `isCurrent`, `applied` | 유지. 특히 isCurrent는 URL 반영 직전 검사 조건이며 이름 변경으로 경합 책임을 옮기지 않음 |
| snapshot/결과 DTO | `status`, `value`, `data`, `dataInputs`, `error`, `errors`, `stale`, `waitingReason`, `running`, `queryErrors`, `generation`, `lifetime`, `roots`, `children`, `slots`, `states`, `queries`, `actions`, `changes` | 유지. Value/Query/Action 각각의 관찰 데이터와 View projection이라는 기존 의미가 존재. 상태 enum·JSON 필드 변경은 이번 권고에서 제외 |

## 타입 이름의 권고

타입만 공개한다고 이름의 중요성이 사라지지는 않는다. 다만 자주 쓰지 않는 타입을 모두 개명하면 사용자에게 필요한 수정만 늘어난다. 우선 정리 가치가 있는 그룹은 다음과 같다. **모두 P2**이며 실행 메서드의 P1 변경과 별도로 채택 가능하다.

- `ActionObservation` → `ActionSnapshot`: ViewSnapshot.actions에 들어가는 현재 실행 상태. QuerySnapshot/ValueSnapshot과 어휘를 맞춘다. StoreObservation은 changes를 포함하는 구독 관찰 묶음이므로 유지한다.
- `NativeAction` → `ActionHandler`, `NativeContext` → `ActionContext`, `NativeActionSpec` → `CodeActionSpec`, `NativeActionDefinition` → `CodeActionDefinition`: native가 FFI/플랫폼 네이티브처럼 보이지 않도록 코드 Action 계약과 호스트 실행 함수를 구별한다.
- `Adapter`/`AdapterProps` → `ComponentAdapter`/`ComponentAdapterProps`: 같은 공개 타입 공간의 UrlAdapter와 대상 범위를 구별한다.
- `Scope` → `StateScope`: 직접 import한 타입에서도 어떤 수명을 묶는지 드러낸다. store.createScope는 수신 객체가 명확하므로 유지한다.
- `RenderedView` → `MountedView`: renderer.mount의 소유 결과라는 점을 표현한다. 현재 이름도 사용 불가능한 것은 아니며 RenderAttachment와의 소유권 문서가 우선이다.
- `ErrorListener` → `RendererErrorListener`, `Fallback` → `RenderFallback`: 범용 이름보다 renderer에 한정된 타입임을 드러낸다.
- `View`와 정확히 같은 별칭인 `ViewHandle`은 `View`로 단일화하는 편을 권고한다. 타입 이름 제거이므로 단순 철자 변경과 구별한다. `ViewstemView` 컴포넌트명까지 바꿀 필요는 없다.

나머지 이름은 유지한다. Spec은 선언 본문, Resource는 kind/id/spec 외피, Snapshot은 관찰된 실행 상태, Handle은 권한 있는 연결, Options는 생성/호출 설정이라는 구분을 따른다. `DatasourceSpec`을 DataSourceSpec으로만 바꾸는 식의 교정은 현재 DSL의 Datasource와 어휘를 어긋나게 하므로 권고하지 않는다. 아래 부록에 86개 타입을 빠짐없이 열거한다.

## 채택한다면 보이는 사용법

아래는 제안된 이름을 적용한 모습이며 현재 실행 예제가 아니다.

```ts
import { createRenderer } from '@viewstem/svelte';

const renderer = createRenderer();
renderer.registry.registerComponentContract(buttonContract);
renderer.registerComponent('Button', Button);

const mounted = await renderer.mount({ target, view: spec });
await mounted.initialComplete;

mounted.view.getState('count').write(1);
await mounted.whenRendered();
const snapshot = mounted.view.getSnapshot();

await mounted.dispose();
await renderer.dispose();
```

headless 사용은 `runtime.createView({ view: spec })`, 기본값 조회는 `defaultCelLimits`, 배치 계산은 `computeGridLayout(...)`로 역할이 드러난다. P2까지 채택했을 때의 예시이며 P1만 적용한다면 getSnapshot 등은 기존 이름을 사용한다.

## 이행·검증 영향

현재 미발행 0.1.0이라도 로컬 소비자는 깨질 수 있다. 채택한 이름만 한 번에 변경하고, 거절한 대안은 추가 별칭으로 남기지 않는 편을 권고한다. 이미 외부 소비자에게 배포된 경우에는 버전/유예 정책을 별도로 정해야 한다.

실제 변경 시에는 공개 .mjs/.d.ts와 Svelte 재노출, 실제 핸들 메서드, 브라우저 adapter, example/playground, 타입 positive/negative fixture, exact export 검사, tarball 소비자, 문서·검증 해시를 함께 갱신해야 한다. initial/settled 변경은 Promise의 성공·개별 Query 오류·폐기·DOM 완료 범위가 그대로인지 확인해야 한다. HTTP/CEL 공통 chunk와 하나의 값/상태 엔진은 유지한다.

이번에는 실행 코드를 변경하지 않았으므로 기존 1,071개 회귀 테스트를 다시 실행하지 않았다. 수행한 검증은 공개 선언 inventory 대조, 구현 의미 확인, 공식 문서 조사와 보고서 완전성 검사다. 이 보고서를 새로운 제품 테스트 통과 증거로 사용하지 않는다.

## 부록: 고유 공개 타입 86개

core 공통 타입의 Svelte 재노출은 별도 타입으로 중복 계산하지 않았다. 변경 대상에 없는 타입은 해당 계약 역할을 유지한다.

| 현재 타입 | 권고 | 원래 선언 영역 |
|---|---|---|
| `Awaitable` | 유지 | core |
| `JsonValue` | 유지 | core |
| `Schema` | 유지 | core |
| `TypeContract` | 유지 | core |
| `ResourceKind` | 유지 | core |
| `Resource` | 유지 | core |
| `PublicError` | 유지 | core |
| `DeepReadonly` | 유지 | core |
| `ValueSnapshot` | 유지 | core |
| `StateAddress` | 유지 | core |
| `StateHandle` | 유지 | core |
| `QuerySnapshot` | 유지 | core |
| `QueryHandle` | 유지 | core |
| `StateDeclaration` | 유지 | core |
| `Scope` | P2 → StateScope | core |
| `StoreObservation` | 유지 | core |
| `UrlAdapter` | 유지 | core |
| `UrlConnection` | 유지 | core |
| `StateStore` | 유지 | core |
| `Clock` | 유지 | core |
| `TimerClock` | 유지 | core |
| `ValuePort` | 유지 | core |
| `StatePort` | 유지 | core |
| `QueryPort` | 유지 | core |
| `Port` | 유지 | core |
| `ChildActionRequest` | 유지 | core |
| `NativeContext` | P2 → ActionContext | core |
| `NativeAction` | P2 → ActionHandler | core |
| `NativeActionSpec` | P2 → CodeActionSpec | core |
| `NativeActionDefinition` | P2 → CodeActionDefinition | core |
| `ActionObservation` | P2 → ActionSnapshot | core |
| `ValueExpression` | 유지 | core |
| `InputExpressions` | 유지 | core |
| `PathExpression` | 유지 | core |
| `ActionSpec` | 유지 | core |
| `ActionCall` | 유지 | core |
| `Step` | 유지 | core |
| `HttpRequest` | 유지 | core |
| `DatasourceSpec` | 유지 | core |
| `QuerySource` | 유지 | core |
| `TransformStep` | 유지 | core |
| `QuerySpec` | 유지 | core |
| `VariableSpec` | 유지 | core |
| `QueryUse` | 유지 | core |
| `QueryDefaults` | 유지 | core |
| `ResourceStateDeclaration` | 유지 | core |
| `Reaction` | 유지 | core |
| `ComponentPublicContract` | 유지 | core |
| `ComponentContract` | 유지 | core |
| `ComponentSpec` | 유지 | core |
| `ViewSpec` | 유지 | core |
| `ComponentNode` | 유지 | core |
| `ResourceSpecs` | 유지 | core |
| `AnyResource` | 유지 | core |
| `RegisteredResource` | 유지 | core |
| `Registry` | 유지 | core |
| `ViewTarget` | 유지 | core |
| `InitialReport` | 유지 | core |
| `ApplicationResult` | 유지 | core |
| `NodeSnapshot` | 유지 | core |
| `ViewSnapshot` | 유지 | core |
| `RuntimeOptions` | 유지 | core |
| `Runtime` | 유지 | core |
| `View` | 유지 | core |
| `ViewHandle` | P2 → View로 단일화; 중복 별칭 제거 | core |
| `CelValue` | 유지 | core |
| `CelFunction` | 유지 | core |
| `HttpExecutionPlan` | 유지 | core |
| `HttpResponse` | 유지 | core |
| `RequestExecutor` | 유지 | core |
| `GridConfig` | 유지 | core |
| `GridPlacement` | 유지 | core |
| `HttpExecutorOptions` | 유지 | HTTP |
| `CelLimits` | 유지 | CEL |
| `CelOptions` | 유지 | CEL |
| `AdapterProps` | P2 → ComponentAdapterProps | Svelte |
| `Adapter` | P2 → ComponentAdapter | Svelte |
| `RendererDiagnostic` | 유지 | Svelte |
| `ErrorListener` | P2 → RendererErrorListener | Svelte |
| `Fallback` | P2 → RenderFallback | Svelte |
| `ViewstemViewProps` | 유지 | Svelte |
| `RenderAttachment` | 유지 | Svelte |
| `RenderedView` | P2 → MountedView | Svelte |
| `RenderOptions` | 유지 | Svelte |
| `Renderer` | 유지 | Svelte |
| `RendererOptions` | 유지 | Svelte |
