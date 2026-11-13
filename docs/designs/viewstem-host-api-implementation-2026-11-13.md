# Viewstem 호스트 API 구현 계획

2026-11-13 · 현행 기준 `3819bdc` · [호스트 명세](../spec/07-host-integration.md) · [D150](../history/decision-register.md)

사용자가 승인한 방향은 DOM과 Svelte의 명령형 진입점을 통일하고, View가 상태·실행을, 화면 핸들이 표시·정리를 맡게 하는 것이다. 이 문서는 구현 순서와 수락 기준을 기록한다. 아래 예제는 현재 작업 트리의 D150 API를 사용한다. 각 패키지의 공개 시그니처는 타입 선언과 README에서 확인한다.

## 1. 공개 계약

| 호출 | 결과와 책임 |
| --- | --- |
| `createRenderer(options?)` | `@viewstem/ui`와 `@viewstem/svelte`에서 제공. 내부 Runtime을 소유하거나 주입 Runtime을 빌림. `renderer.runtime`에서 Registry와 Store에 접근 |
| `renderer.mount({ target, source, inputs?, url?, onError?, ...svelteOptions })` | 동기적으로 `MountedView` 반환. 유효하지 않은 대상·중복 예약·이미 닫힌 렌더러는 동기 예외. 정의 준비·적용·최초 렌더 실패는 `ready` 거절 |
| `screen.ready` | 첫 DOM 반영 뒤 `View` 반환. 입력 대기·개별 Core 노드 오류·Query 오류는 진단으로 남음. Svelte 구현 미등록·어댑터나 fallback 렌더 실패는 첫 반영 중이면 거절과 자동 정리 |
| `screen.unmount()` / `renderer.dispose()` | 각각 해당 화면의 View와 DOM, 렌더러의 모든 작업 및 내부 Runtime 정리. 각 호출은 반복해도 같은 정리를 재사용하며 `Promise<void>` 반환 |
| `renderer.attach(view, target, options?)` | 기존 View를 빌려 동기적으로 `RenderAttachment` 반환. `attachment.detach()`가 DOM과 구독 정리. 빌린 View와 서비스 Store는 원래 소유자가 관리 |
| `runtime.createView(source, options?)` | DOM 없는 경로. 구조를 커밋하면 `Promise<View>` 이행. `options`는 `inputs`, `url`, 선택적 준비용 `signal` |
| `view.initial` | 최초 적용의 불투명 `ViewApplication`. 이후에도 같은 핸들을 제공 |
| `view.setInputs(inputs)` | 외부 입력 맵 전체 교체. 정의와 호환 State 유지. 현재 정의로 권한 검사하고 새 값은 포트 계약으로 검증 |
| `view.updateDefinition(spec, { inputs?, states? }?)` | 전체 정의로 조정. 같은 인스턴스의 호환 State 유지. 생략한 입력은 실행 시점의 현재 입력을 사용. 명시 State 쓰기를 정의와 함께 검증·커밋 |
| `view.replace(source, options?)` | 같은 공개 View와 구독·DOM 연결 위에서 새 내부 수명 시작. 이전 State 핸들과 호출은 폐기. 이전 Query 핸들은 마지막 snapshot을 읽을 수 있고 갱신·재시도는 거절 |
| `view.invokeAction({ actionRef 또는 action, inputs? })` | 현재 View 소유의 독립 실행. 기존 권한 검사와 불투명 owner를 사용. 코드 Action의 `context.invokeAction`은 부모 스택과 취소를 상속 |
| `view.whenSettled(application)` | 지정 적용의 Core 보고. `screen`, `attachment`, `ViewstemView` 인스턴스의 같은 메서드는 동일 보고에 해당 연결의 DOM 반영을 포함 |
| `screen.whenRendered()` / `attachment.whenRendered()` | 호출 직전까지 요청된 현재 적용의 DOM 반영을 기다림. 최초 Query 또는 브라우저 paint 대기는 필요할 때 별도 호출 |

`ViewSource`는 `ViewSpec | { readonly ref: string }`이다. 타입에서 `ref`와 `render`를 배타적으로 두고 JS에서도 혼합 객체를 거절한다. `ViewOptions`의 `inputs`와 `url`은 기존 View 입력·URL 설정을 사용한다. `replace`도 준비용 `signal`을 받는다. 준비 취소는 아래의 적용 확정 시점까지만 유효하다. 세 변경 메서드는 커밋 뒤 `Promise<ViewApplication>`을 이행한다. 애플리케이션 핸들은 위조하거나 다른 View의 것을 전달하면 `INVALID_DEFINITION`이다. Registry는 공용 정의 관리와 코드 Action 등록을 담당하며 Runtime의 목록·내보내기 별칭은 정리한다.

Core의 `createRuntime()`는 빈 Registry를 만든다. 자체 Registry 생성 옵션은 `resources`, `componentContracts`, `functions`이며 `createRegistry({ resources, componentContracts, functions })`도 같은 혼합 배치를 받는다. 기존 배열 입력과 명시 Registry 주입은 유지한다. Registry 주입 시 정의와 CEL 함수 계약은 그 Registry가 정하고 Runtime의 `resources`, `componentContracts`, `functions`와 함께 넘기면 거절한다. Store·권한·실행기·resolver는 주입 Registry와 함께 설정할 수 있다.

DOM 자체 Runtime은 `registerShadcn`과 같은 카탈로그 계약을 사용자 정의와 한 후보에서 검증한다. Svelte 자체 Runtime의 `components: [{ contract, component }]`는 새 계약과 구현을 한 번에 등록한다. 각 구현과 ID를 먼저 검사하고 모든 계약을 검증한 뒤 렌더러를 공개한다. 코드 Component가 참조하는 Type과 그 Component를 참조하는 선언형 View를 같은 배치에 넣을 수 있다. `createRenderer({ runtime, onError })`는 Registry를 수정하지 않는다. DOM 호스트는 필요한 카탈로그를 미리 `registerShadcn(registry)`로 준비한다. Svelte 호스트는 `renderer.bindComponent(id, component)`로 기존 코드 계약에 구현만 연결한다. 가변 계약 등록은 Registry의 기존 연산으로 한다. 어댑터 연결은 처음 attach하거나 같은 View가 replace될 때의 구현 집합을 사용하고, 정의 update는 기존 집합을 유지한다.

## 2. 적용과 커밋 순서

### A. 준비와 취소

1. Runtime 또는 View에 작업을 만든다. 호출 시 인라인 정의와 값 입력은 기존 스냅샷 규칙으로 격리하고 State·Query 핸들은 정체성을 유지한다. `resourceResolver(kind, id, { signal })`에 작업별 신호를 전달한다. 기존 두 인자 함수는 같은 방법으로 호출할 수 있다. 내부 대기는 취소 시 즉시 끝나며, resolver의 늦은 이행과 거절은 소비한다.
2. 새 요청은 같은 View에서 준비 중이거나 대기 중인 이전 변경을 `CANCELLED`로 종료한다. 커밋 구간과 URL 후처리 중에는 최신 후속 변경 하나를 보관한다. 이전 대기 요청은 취소한다. 커밋 중 재진입도 이 큐로 보낸다. 새 요청이 거절돼도 마지막으로 커밋한 화면은 유지한다. dispose는 현재와 대기 작업을 모두 취소하고 소유 URL 쓰기의 `isCurrent()`를 무효화한다.
3. 최초 생성과 `replace`는 최신 Registry를 바탕으로 참조를 조회한다. resolver 결과는 작업별 맵에 넣고 종류·ID·정의를 검증한다. `setInputs`와 `updateDefinition`은 View에 이미 주입된 Registry 스냅샷을 쓴다. 참조 조회가 끝나면 최신 Registry에서 후보를 다시 구성해 새로 생긴 의존성을 확인한다. 새 미등록 의존성이 있으면 필요한 조회를 마저 수행한다. 동일 키의 선언형 정의는 `kind/id/name/spec` 전체의 구조 동등성으로 비교한다. 객체 키 순서는 무시하고 배열 순서는 보존한다. 동일하면 재사용하고 상충 정의나 코드 계약 충돌은 `INVALID_DEFINITION`이다. resolver 호출 자체는 두 작업 사이에서 공유하지 않는다.
4. 후보 정의의 구조, 권한, 포트·명시 State 쓰기, 초기값·Derived·reaction, URL 바인딩 타입·소유권을 검사한다. 최초 적용은 기존과 같이 update 권한 훅을 호출하지 않으며, 기존 View의 세 변경 연산에는 적용 권한 훅을 호출한다. 렌더러의 최초 생성은 커밋 전에 대상 토큰과 연결 상태를 한 번 더 검사한다. Store의 실제 후보 구성은 다음 동기 트랜잭션 안에서 한 번만 만들고, 실패하면 롤백한다. 이 과정에서 Registry 공개 등록, Store 알림, URL 어댑터 호출, Query·Action 시작을 금지한다. 권한 콜백은 후보 구성 전에 호출한다. 재진입으로 공용 Registry가 변경됐으면 적용을 `INVALID_DEFINITION`으로 거절하고 호스트가 명시적으로 재시도할 수 있게 한다.

### B. 동기 커밋과 공개

1. Core는 Store의 기존 동기 트랜잭션에서 셀·scope·reaction 변경을 준비한다. `View.build`는 다음 실행 Registry, 루트, 인스턴스, 연결, 이전 수명 정리 목록을 만든다. View 필드를 미리 갈아 끼우거나 기존 Action·Query를 취소하지 않는다. Store의 일반 알림, baseline 알림, scope 종료 콜백은 이 작업이 끝날 때까지 보류한다. 준비 중 공개 View 읽기는 마지막 확정 snapshot을 가리킨다. 기존 StateStore의 transaction 및 preview 복구 메커니즘을 재사용한다. 새 후보만 폐기 가능한 상태로 두고 실패 시 기존 핸들·구독·적용 번호를 유지한다.
2. 트랜잭션의 최종 검사에서 작업 토큰과 Registry revision, URL 예약 가능 여부를 확인한다. 이후 **Registry 후보 맵 교체 → Store 변경 확정 → View 필드·적용 핸들 교체 → URL 예약 소유자 교체**를 같은 동기 구간에서 수행한다. 이 구간은 await와 사용자 콜백을 호출하지 않는다. 확정 단계에는 이미 검증한 맵·필드·토큰 대입만 남긴다. `updateDefinition`과 `setInputs`는 공용 Registry를 바꾸지 않는다. URL 소유권 검사는 기존 Store당 연결 하나와 adapter별 key 점유를 함께 적용한다. 커밋에서 기존 연결의 키와 새 연결의 키의 합집합을 해당 교체의 토큰으로 예약한다. 키가 겹치면 옛 제거를 끝낸 뒤 새 연결에 넘긴다. 새 연결이 없거나 시작에 실패하면 잔여 예약을 해제한다. 공개 `store.connectUrl()`도 같은 예약 검사를 통과해야 한다.
3. 새 필드와 Store가 모두 보이는 상태에서 이전 수명 정리·취소, 병합한 Store 알림, 해당 View의 첫 투영 전달 순으로 공개한다. 외부 콜백의 예외는 각 경계의 진단으로 격리하고 이미 확정된 적용을 롤백하지 않는다. 이전 수명 취소에서 외부 AbortSignal listener가 재진입해도 새 필드가 먼저 보인다. 공개 Store 트랜잭션 안에서 시작한 View 연산은 현재 알림·트랜잭션을 마친 후에만 커밋할 수 있다. 구독 콜백이 즉시 `getSnapshot()` 또는 `exportDefinition()`을 읽으면 알림의 새 State와 같은 적용을 본다. 알림 중 View 변경은 후속 작업으로, Store 쓰기는 기존 재진입 큐로 보낸다. 화면을 닫는 호출은 새 작업의 시작과 외부 효과를 즉시 막되 현재 알림 도중에 구조를 반쯤 해제하지 않는다. 준비 실패·취소에는 정상 구독 알림이 없다. 기존 Core 함수 확장의 동기·순수 콜백은 후보 계산에서 호출할 수 있다. 그 콜백 안의 공개 Store·State 핸들 변이는 `INVALID_DEFINITION`으로 거절한다. 권한 콜백과 resolver는 Store 트랜잭션 밖에서 실행한다. 조회와 권한 콜백의 재진입은 작업 토큰 또는 revision의 최종 검사로 다룬다.
4. `createView`와 변경 메서드의 이행 기준은 이 커밋이다. 이전 미완료 Core 보고는 새 적용이 확정될 때 `CANCELLED`가 된다. 이미 이행한 보고서는 핸들이 유지되는 동안 다시 읽을 수 있다. 이후 DOM 연결이 실패하면 소유 View와 대상은 정리하고, 성공한 Core 적용에서 게시한 공용 정의는 유지한다.

### C. URL 후처리와 첫 Query

기존 제안의 URL 직렬화를 유지하고 **비가역 URL 쓰기보다 Core 커밋을 앞에 둔다.** Registry와 Store를 최신 상태로 검증한 뒤 URL 쓰기를 먼저 기다리면, 기다리는 중에 다른 화면이 Store를 바꿔 검증을 다시 해야 하고 이미 삭제한 URL을 되돌릴 수 없다. Core가 먼저 확정되면 모든 URL 효과를 실제로 커밋한 적용에 귀속할 수 있다.

| 상황 | 커밋 이후 순서 |
| --- | --- |
| URL 없는 적용 | 이전 수명 정리 뒤 새 Query 사용을 구성. 준비된 UI와 최초 실행 가능한 Query를 진행 |
| 최초 View의 URL | 연결 시작 → 지원되는 기존 baseline에서 URL 복원 → 입력 안정화 → 최초 실행 가능한 Query. baseline 입력을 기다리는 동안 준비된 UI를 표시하고 대기 Query는 초기 보고를 막지 않음 |
| 같은 View의 정의·입력 갱신 | URL 연결과 복원 기준을 유지. 기존 연결이 가리키는 셀을 제거·교체하는 정의는 구조 검사에서 거절 |
| 이전 View의 URL이 있는 교체 | 구 연결의 일반 쓰기와 구독을 중지하되 옛 key 점유는 정리용 토큰으로 보관 → 정확히 옛 소유 key만 `replace`로 제거 → 구 점유 해제 → 새 연결을 새 baseline에서 시작. 교체 시 이전 URL을 복원하지 않음. 새 View의 연결 대기 중 명시한 State 쓰기는 새 연결이 시작된 뒤 반영 |
| 옛 URL 제거 실패 | adapter의 throw·reject·`{ applied: false }`와 제한 시간 만료를 실패로 처리. 실패한 키를 자동으로 다시 쓰지 않음. `URL/replace-cleanup` 진단을 내고 새 화면과 baseline을 유지하며 새 연결·Query를 진행 |
| 새 adapter의 subscribe 또는 초기 read가 예외 | 등록한 구독·점유를 해제하고 `URL/connect` 진단. 최초 baseline이 나중에 준비되어 처음 읽을 때 발생한 예외에도 같은 정책을 적용한다. URL 연결 없이 현재 State로 Query를 진행. 호스트가 adapter를 복구한 뒤 명시 `replace`로 새 연결을 시작 |
| View/renderer 종료 | 소유 URL 작업 토큰을 즉시 무효화하고 점유를 해제. URL을 지우는 새 작업을 만들지 않음. 서비스가 소유한 Store·URL 연결은 유지 |

교체의 URL 후처리 중에는 **새 Query 요청과 후속 적용**을 시작하지 않는다. Store 알림과 준비된 영역의 첫 DOM은 진행할 수 있다. 이 구간에 들어온 후속 적용은 최신 하나를 남기고 URL 제거가 끝난 뒤 실행한다. 같은 Store의 다른 View는 계속 동작한다. 새 바인딩의 명시 쓰기는 커밋에 설치한 내부 Store 관찰에서 최신 값과 push 여부를 모아 새 연결에 넘긴다. 초기값과 복원은 수집에서 제외한다. 교체가 끝나기 전에 화면이 닫히면 이 버퍼도 폐기한다. 정상 종료된 제거는 어댑터 결과를 확인하고, 종료·만료된 제거는 늦게 도착한 결과나 오류를 소비한다. URL 제거의 기본 제한 시간은 30초다. Runtime의 `urlCleanupTimeoutMs`로 양의 안전 정수를 지정해 바꿀 수 있으며 HTTP 요청 제한 시간과 독립이다. 제한 시간과 타이머는 Runtime의 기존 `TimerClock`을 사용한다. 만료 시 정리 실패를 진단하고 토큰을 무효화한 뒤 진행한다. 적용을 닫으면 이 타이머도 제거하며 adapter의 완료를 기다리지 않는다. 어댑터는 실제 브라우저 URL 변경 직전에 `isCurrent()`를 확인해야 한다. 이미 반영된 URL 효과는 해당 적용의 효과다. 서비스의 별도 URL 연결과 View 연결을 한 Store에 동시에 예약하는 시도는 커밋 전에 거절한다.

신규 View 최초 입력 대기의 경우 기존 E61 규칙을 유지한다. URL 이전 화면 정리 자체가 진행 중인 경우 초기 Query 분류는 유한한 정리 완료·실패까지 기다린다. 이후 입력 대기는 오류 없이 초기 보고 대상에서 빠지며 입력이 준비되면 Query를 시작한다. [URL 보존 계약](../spec/09-preserved-contracts.md#url-동기화의-확정-의미)

## 3. DOM 대상 소유와 완료

- Core의 렌더러 연동용 진입점 `@viewstem/core/renderer`에 `WeakMap<object, token>`을 한 개 둔다. DOM과 Svelte의 명령형 연결은 같은 모듈의 예약·조회·해제를 호출한다. Core는 대상 객체의 정체성만 다룬다. DOM 판별은 렌더러에서 한다. 두 tarball이 동일 버전의 Core 하나를 공유하는 설치가 지원 범위다. 여러 버전의 Core를 한 페이지에 중복 로드하는 경우에는 같은 대상 배타성을 보장하지 않는다.
- 명령형 대상은 실제 문서에 연결된 `HTMLElement`다. iframe 대상은 해당 문서의 `defaultView.HTMLElement`로 판별한다. 예약은 대상 자체에만 적용하며 별도 대상이나 부모 트리의 Svelte 선언형 `ViewstemView`에는 확대하지 않는다. DOM 렌더러와 Svelte는 자체 DOM·리스너만 소유한다. 호스트는 관리 중인 서브트리에 별도 렌더러를 배치한 경우 부모를 없애기 전에 자식을 닫는다.
- 예약 상태는 **준비 중 → 연결됨 → 정리 중 → 해제**다. 같은 대상을 사용하는 두 번째 호출은 resolver 또는 Query 전에 `INVALID_DEFINITION`으로 거절한다. 준비 실패는 자동 정리 후 `ready`가 거절되므로 그 뒤 대상 재사용이 가능하다. 수동 정리는 `await unmount()` 또는 `await detach()`가 끝난 뒤 재예약한다. 정리가 거절되더라도 라이브러리 예약은 풀린다. 토큰이 일치할 때만 해제한다. 늦은 마운트·정리는 새 연결을 건드리지 않는다. Svelte 정리는 outro 없이 자신이 시작한 `unmount` 완료까지 기다린다. 지연 resolver나 URL 쓰기는 토큰으로 끊고 대기하지 않는다.
- `renderer.dispose()`는 새 예약을 막은 뒤 모든 소유 mount와 빌린 attachment를 정리한다. 자체 Runtime은 닫고 주입 Runtime은 유지한다. 같은 View를 여러 대상에 붙일 수 있다. 한 borrowed 연결의 해제는 다른 연결과 View를 유지한다. View의 소유자가 View를 종료하면 관련 명령형 연결을 자동으로 정리하고 대기 중인 표시 완료를 취소한다. 예약은 정리 완료 때 해제한다. 호스트의 후속 `detach()`는 같은 정리 Promise를 반환한다. `ViewstemView`는 빈 투영으로 전환하고 부모 트리의 자체 수명에 따라 종료된다.
- Core는 적용마다 불투명 핸들을 발행한다. 외부 신호와 resolver listener는 커밋 또는 작업 종료 때 정리한다. View에는 투영 요청 순번과 실제 게시 순번을 둔다. State 쓰기·Query 결과로 같은 적용 안에서 투영을 요청할 때도 순번이 증가한다. 묶인 투영은 포함한 마지막 순번을 게시한다. `whenRendered`는 호출 직전 요청된 순번을, `whenSettled(application)`은 Core가 최초 Query 보고를 확정하며 표시한 순번을 기다린다. DOM은 동기 반영이 성공하면 그 순번을 확인한다. Svelte는 `tick()` 이후 실제로 본 적용·순번과 해당 어댑터 오류를 확인한다. 더 최신의 같은 적용 투영으로 갈 수 있지만 다른 적용의 DOM은 성공으로 세지 않는다.
- 연결의 최초 반영 전에는 `whenRendered`가 첫 반영 대기에 합류한다. 소유 mount에서는 `ready`가 같은 경계를 제공한다. 적용별 확인이 완료된 결과는 연결과 적용 핸들이 남는 동안 재조회할 수 있다. 확인 전 교체·해제는 `CANCELLED`다. 이미 끝난 Core 보고를 새로 붙인 연결이 확인하려면 그 적용이 아직 View의 현재 적용이어야 한다. 이력 DOM을 다시 그리지 않는다.
- 진단 타입은 `{ phase: 'prepare' | 'node' | 'query' | 'action' | 'url' | 'render'; error: PublicError; application?: ViewApplication; nodeId?: string }`다. 위치·입력은 기존 정제 DTO에 둔다. Core는 노드 오류 진입·변경, Query 실패 결과, UI 이벤트 Action 실패, URL 실패 발생마다 한 번을 발행한다. 같은 노드 오류의 단순 재투영은 재발행하지 않으며 복구 뒤 같은 오류가 나면 새 발생이다. 연결 전에 이미 존재하는 현재 노드·Query 오류는 첫 snapshot에서 연결당 한 번 전달한다. DOM·Svelte 렌더 오류는 해당 연결에서만 보고한다. 동일 발생의 동일 콜백은 한 번 호출하며, 콜백 예외는 격리한다. 동기 대상 검사는 호출자가 catch한다. `ready`는 라이브러리가 미관찰 거절을 처리하고 명시 await는 그대로 reject된다. 정상 취소는 진단 콜백을 호출하지 않는다. 호출자가 직접 실행한 View 연산의 오류는 그 Promise에서 처리한다.

## 4. 소비자 예제와 기대 결과

### 기본 DOM과 라우트 수명

```ts
import { createRenderer } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const target = document.querySelector<HTMLElement>('#panel');
if (!target) throw new Error('Missing #panel');

const renderer = createRenderer();
const screen = renderer.mount({
  target,
  source: {
    states: { title: { kind: 'State', schema: { type: 'string' }, initial: 'Draft' } },
    render: { id: 'title', componentRef: 'shadcn.Badge', inputs: { text: { '@path': '/states/title' } } },
  },
  onError: ({ phase, error }) => console.error(phase, error.code),
});
const closeRoute = () => screen.unmount();

const view = await screen.ready;
view.getState('title').write('Saved');
await screen.whenRendered();
// #panel 안 배지의 문구는 Saved
await closeRoute();           // 라우트가 먼저 닫혀도 같은 함수 사용
await renderer.dispose();     // 앱 종료
```

### Svelte에서 앱 컴포넌트를 연결하고 화면을 교체

```ts
import { createRenderer, type ComponentContract, type ViewSpec } from '@viewstem/svelte';
import Label from './Label.svelte';

const contract = {
  kind: 'Component', id: 'Label',
  spec: { ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } } },
} satisfies ComponentContract;
const draft = {
  states: { text: { kind: 'State', schema: { type: 'string' }, initial: 'Draft' } },
  render: { id: 'label', componentRef: 'Label', inputs: { text: { '@path': '/states/text' } } },
} satisfies ViewSpec;
const renderer = createRenderer({ components: [{ contract, component: Label }] });
const target = document.querySelector<HTMLElement>('#panel');
if (!target) throw new Error('Missing #panel');

const screen = renderer.mount({ target, source: draft });
const view = await screen.ready;
const oldText = view.getState('text');
oldText.write('Saved');
await screen.whenSettled(await view.updateDefinition(draft)); // Saved
await screen.whenSettled(await view.replace(draft));          // Draft, 같은 view 객체
await renderer.dispose();
```

```svelte
<!-- Label.svelte -->
<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  let { inputs }: ComponentAdapterProps = $props();
</script>
<span>{typeof inputs.text === 'string' ? inputs.text : ''}</span>
```

### 공유 State와 대여 연결

```ts
import { createRegistry, createRuntime, createStateStore, type ViewSpec } from '@viewstem/core';
import { createRenderer, registerShadcn } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const left = document.querySelector<HTMLElement>('#left');
const right = document.querySelector<HTMLElement>('#right');
if (!left || !right) throw new Error('Missing panel target');

const registry = createRegistry();
registerShadcn(registry);
const store = createStateStore();
const scope = store.createScope();
const filter = scope.registerState<string>('filter', { schema: { type: 'string' }, initial: 'All' });
const runtime = createRuntime({ registry, stateStore: store });
const renderer = createRenderer({ runtime });
const source = {
  ports: { filter: { kind: 'State', schema: { type: 'string' }, required: true } },
  render: { id: 'filter', componentRef: 'shadcn.Badge', inputs: { text: { '@path': '/ports/filter' } } },
} satisfies ViewSpec;

const screen = renderer.mount({ target: left, source, inputs: { filter } });
const view = await runtime.createView(source, { inputs: { filter } });
const attachment = renderer.attach(view, right);
await screen.ready;
await screen.unmount();
filter.write('Open');
await attachment.whenRendered(); // 오른쪽 화면에 Open
await renderer.dispose();       // 오른쪽 연결 정리, view와 filter는 생존
view.dispose();
runtime.dispose();
store.dispose();
```

기존 Svelte 부모 context가 필요한 경우는 `<ViewstemView {renderer} {view} />`로 실행 중인 View를 빌린다. SSR에서 소유 View를 만드는 선언형 컴포넌트, 커스텀 HTTP 실행기의 503 분류 변경, DSL 타입 전반 재설계는 이 구현 단위 밖이다.

### URL을 사용하는 화면의 교체

아래 예제에서 새 View의 URL 옵션도 교체 호출에 명시한다. 같은 adapter를 사용해 소유 키만 정리한다. 앱 라우터에서 URL을 바꾸는 경우에도 실제 쓰기 직전의 유효성 검사를 유지한다.

```ts
import { mergeOwnedUrl, type UrlAdapter, type ViewSpec } from '@viewstem/core';
import { createRenderer } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const adapter: UrlAdapter = {
  read: () => location.href,
  subscribe(listener) {
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  },
  writeOwned(patch, { mode, isCurrent }) {
    const href = mergeOwnedUrl(location.href, patch);
    if (!isCurrent()) return { applied: false };
    if (mode === 'push') history.pushState(history.state, '', href);
    else history.replaceState(history.state, '', href);
  },
};
const definition = (initial: string): ViewSpec => ({
  states: { filter: { kind: 'State', schema: { type: 'string' }, initial } },
  render: { id: 'filter', componentRef: 'shadcn.Badge', inputs: { text: { '@path': '/states/filter' } } },
});
const url = { adapter, bindings: [{ state: 'filter', key: 'filter' }] };
const target = document.querySelector<HTMLElement>('#panel');
if (!target) throw new Error('Missing #panel');

const renderer = createRenderer();
const screen = renderer.mount({ target, source: definition('All'), url });
const view = await screen.ready;
await screen.whenSettled(view.initial);
const applied = await view.replace(definition('Open'), { url });
await screen.whenSettled(applied);
// 새 배지는 Open. 이전 filter만 제거되고 다른 query parameter와 hash는 유지.
await renderer.dispose();
```

## 5. 구현 단계와 변경 경로

1. **Core의 적용 경계.** `packages/core/src/registry.mjs`에 revision과 혼합 후보·동기 교체를 추가한다. `state.mjs`의 기존 transaction에 내부 전용 확정·알림 분리를 추가하고 public transaction 시그니처를 유지한다. `runtime.mjs`에서 작업 취소, 준비 맵, 커밋, 투영을 구분한다. `url.mjs`에서 예약과 연결 시작, 제거 권한과 수명 종료를 나눈다. 우선 현행 공개 어휘로 연결해 Core 테스트와 기존 소비자 빌드가 통과한 상태를 만든다. `packages/core/test/url-runtime.test.mjs`의 L09는 커밋 전 대체와 커밋 후 URL 직렬화를 각각 검증하도록 수정한다. 준비 중 취소는 변경 Promise가 거절되고, 커밋 후 종료는 이미 이행한 변경 Promise를 되돌리지 않고 해당 적용의 미완료 보고만 거절한다. 기존 인수의 늦은 URL 쓰기 방지는 두 시나리오에서 계속 검증한다.
2. **공개 Core와 공통 렌더러.** `packages/core/src/{index.mjs,index.d.ts,api.mjs}`를 바꾸고 `packages/core/src/{renderer.mjs,renderer.d.ts}`를 추가한다. 이 subpath는 `createRendererHost`와 Svelte 부모 트리의 대여 연결에 쓰는 `createRenderWaiter`를 내보낸다. 이 팩토리가 내부 대상 예약과 Core의 취소 가능한 최초 작업, View 종료·진단·투영 순번 구독을 연결한다. 공개 패키지의 renderer 핸들은 이 공통 구현을 사용하고 대상 토큰과 View 내부 제어는 소비자에게 노출하지 않는다. 런타임 객체나 DOM 타입은 대상 점유 맵에 저장하지 않는다. `packages/core/package.json`과 `packages/core/scripts/build.mjs`에서 기존 root·HTTP·CEL과 같은 esbuild 분할 빌드의 진입점으로 구성한다. 임시 호환 호출이 필요하면 이행 브랜치의 검증에만 사용하고 최종 tarball에는 제거한다.
3. **DOM과 Svelte.** `packages/ui/src/{index.ts,shadcn.ts}`에서 실제 DOM 구현을 공통 renderer의 어댑터로 연결한다. `packages/svelte/src/lib/{index.ts,types.ts,renderer.ts,connection.ts,ConnectedView.svelte,ViewstemView.svelte,RenderNode.svelte}`에서 같은 mount·detach·완료 계약을 사용한다. Renderer의 공개 타입은 같은 Core 연동 타입을 이용하고 각 구현에 필요한 옵션만 확장한다. 공통 수명 제어는 `core/renderer`의 `createRendererHost` 하나에 둔다. 렌더러별 어댑터는 토큰 확인 후 DOM 연결 생성, 반영 순번 보고, DOM 정리만 제공한다. 구형 UI 최상위 `attach`, Svelte의 중복 변경 메서드와 등록 별칭은 최종 공개 export에서 제거한다. 현재 `ViewstemView`의 대여 동작과 부모 context는 유지한다.
4. **소비자와 릴리스.** `apps/docs/src/components/{HomePage.astro,Playground.svelte,playground-copy.ts,playground-renderer.ts}`, `apps/docs/src/examples/{preview.ts,component-demo-ui-runtime.ts,component-demo-ui-setup.ts}`, `packages/svelte/example/App.svelte`를 새 호출로 이행한다. 양 언어의 루트·패키지 README, 빠른 시작·설치·Core/Svelte/UI 레퍼런스와 실습, `skills/viewstem/SKILL.md`를 같은 변경에 이행한다. 대상 문서는 현재 문서 트리에서 제거된 공개 호출명을 검색해 확정하며 과거 인계·리뷰 산출물은 당시 증거로 둔다. 변경 대상 세 패키지는 같은 호환성 단절 버전으로 이행하고 내부 의존 버전을 맞춘다. Changesets에 breaking 변경을 기록한다. 문서 스니펫과 패키지 소비자가 통과한 뒤 릴리스 작업에서 버전·lockfile을 갱신한다.

## 6. 검증과 종료 조건

| 사례 | 입력과 단언 | 주 검증 위치 |
| --- | --- | --- |
| R1 공유 Registry | 두 작업에 동일 미등록 View를 늦게 반환 → 둘 다 성공, 정의 1개. 상충 정의 또는 코드 ID → 후발 거절. 다른 키 추가·의존 정의 교체 중 조회 → 최신 그래프 재검증 | `packages/core/test/runtime-management.test.mjs` |
| R2 준비 실패와 취소 | 권한 거절, 포트 오류, 잘못된 URL 구성, 실패한 후보 리소스 → 공용 Registry·이전 Store·세대 그대로. resolver가 취소 신호를 무시하고 늦게 성공/실패 → 등록·Query·알림 없음 | `packages/core/test/runtime-management.test.mjs`, `packages/core/test/preflight-runtime.test.mjs` |
| R3 Store 공개 순서 | 같은 적용의 State·Registry·View 정의를 Store 콜백 안에서 읽음. 옛 핸들의 예외가 새 View 읽기를 막지 않음. 재진입 쓰기와 갱신은 후속 투영에서 확인. 동일값 쓰기는 알림 추가 없음 | `packages/core/test/runtime-subscription-projection.test.mjs`, `packages/core/test/runtime-management.test.mjs` |
| R4 교체 경쟁 | A의 resolver 정지 → B의 갱신 성공 또는 거절 → A 이행. A 취소, B 성공 시 B 유지, B 거절 시 기존 화면 유지. 첫 Query의 대기는 다른 적용을 막지 않음 | `packages/core/test/runtime-management.test.mjs`, `packages/core/test/runtime-query.test.mjs` |
| U1 URL 후처리 | A 교체의 URL 쓰기 정지 → 잘못된 B 대기 → A 쓰기 해제. A의 새 State·정의 유지, A 소유 key만 정리, B만 거절. 구독자 쓰기는 새 연결로 전달. 어댑터 거절·타임아웃·구독/read 예외에서 새 State·Query와 URL 진단 확인 | `packages/core/test/url-runtime.test.mjs` |
| U2 URL 수명 | URL 쓰기 대기 중 dispose → adapter의 실제 변경 직전 검사 false. 서비스 연결을 주입한 경우 두 View가 제거돼도 공용 URL·State 생존. 최초 복원은 첫 요청 입력에 포함 | `packages/core/test/url-runtime.test.mjs`, `packages/core/test/browser.mjs` |
| D1 양쪽 대상 점유 | 같은 대상에서 DOM→Svelte, Svelte→DOM, mount→attach 및 역순. 후발 호출에서 resolver 0회. 다른 document에서 연결된 HTMLElement도 허용하며 detached·SVG·위조 객체는 거절. 실패·정리 후 재연결. 동일 View를 두 별도 대상에 붙여 한쪽만 닫아도 다른 쪽 유지 | `packages/ui/test/consumers.test.mjs`, `packages/svelte/test/browser.test.mjs` |
| D2 지연 마운트 | 화면 준비 중 unmount → 같은 대상 재마운트 → 첫 resolver 이행. 새 DOM만 표시. 늦은 거절과 초기화 중 재진입 dispose에서도 브라우저의 unhandled rejection 0건. ready 거절 직후 재마운트 및 연결된 View의 소유자 dispose 후 타깃 회수 | `packages/ui/test/consumers.test.mjs`, `packages/svelte/test/browser.test.mjs` |
| D3 표시 완료와 진단 | State 쓰기 직후 `whenRendered`는 새 문자열 확인. 대기 중 교체되면 옛 적용의 대기는 취소. 503의 Query 보고와 정적 영역 표시, 재시도 후 최신 데이터. Svelte의 구현 미등록·어댑터 오류·fallback 오류와 DOM의 잘못된 입력을 구분 | `packages/ui/test/consumers.test.mjs`, `packages/svelte/test/browser.test.mjs` |
| P1 공개 사용법 | §4 예제를 설치된 tarball에서 실행. 음성 타입 검사에서 구 시그니처·혼합 source·주입 옵션 충돌 거절. 기본 DOM 번들에 프레임워크가 없고, 두 렌더러가 같은 Core 연동 모듈을 사용. 느린 resolver를 기다리는 화면과 별개로 준비된 다른 화면이 표시되고, 같은 View에서는 Query보다 정적 영역이 먼저 표시 | `packages/core/test/types/public-api.ts`, `packages/core/scripts/test-package.mjs`, `packages/svelte/scripts/test-package.mjs`, `packages/ui/test/consumers.test.mjs` |

구현 시작 전에 현행 재현과 결과를 기준선으로 보관한다. 1단계 종료 시 `npm run check`와 `npm run test:browser`를 통과시킨다. 2–4단계의 공개 호출 전환과 소비자 이행은 같은 브랜치에서 함께 완료하고 `npm run check`, `npm run test:package`, `npm run check:ui`, `npm run check:svelte`를 실행한다. 문서와 사이트 이행 뒤 `npm run typecheck:docs`, `npm run build:docs`, `node --test apps/docs/scripts/component-demo-session.test.mjs` 및 각 `verify-core-docs.mjs`, `verify-ui-docs.mjs`, `verify-task-guides.mjs`, `verify-component-setup.mjs`, `verify-site-svelte.mjs`를 저장소 루트에서 `node apps/docs/scripts/<파일>`로 실행한다. 기존 인수 테스트 이름이나 위치가 바뀌면 Core 검증 매핑도 갱신한다. 기존 예제가 구형 호출로 남았는지 검색하고 문서에 표시하는 JSON과 실행 JSON이 같은지 확인한다.

구현 완료는 위 대표 시나리오와 패키지 검증의 실행 결과를 남겼을 때 판단한다. 계획 작성 시점에는 현행 Runtime·URL·투영 테스트 41개가 통과했다. 늦은 resolver의 Registry 변경, 동시 미등록 참조 실패, 늦은 교체의 덮어쓰기, URL 정리 후 취소, 새 URL 구독 실패를 현행 공개 API에서 재현했다. 소비자 예제 4개는 예정 시그니처의 임시 타입과 현행 DSL·핸들 타입을 사용해 strict TypeScript에서 확인했다. Svelte 컴포넌트 및 새 API의 브라우저 동작은 구현 단계의 수락 조건이다.

### 구현 검증

Node 22.23.4와 Chromium에서 Core 검사 1,090개, Svelte 브라우저 검사 30개, UI 검사 43개를 통과했다. Core와 Svelte 설치 tarball의 공개 타입 및 실행, UI tarball의 순수 JS·React·Vue·Svelte 호스트, DOM↔Svelte 대상 예약 경합을 확인했다. 사이트는 323페이지를 빌드했고, 영·한 가이드와 생성된 컴포넌트 설정 296쌍을 검사했다. 호환성 단절은 세 패키지의 minor Changeset에 기록했다. 버전 갱신은 기존 릴리스 절차에서 수행한다.
