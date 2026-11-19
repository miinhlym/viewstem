# 공개 호출 전수 검토

검토 기준은 `f5c0785`의 패키지 `exports`와 공개 선언이다. 호출 이름은 선언 소유자 단위로 적었다. 오버로드와 재내보내기는 같은 호출에 표시하고, 실제 동작이 다른 DOM·Svelte 커넥터와 동일 이름의 다른 수명은 구분했다. 구현이 불투명 값으로 공개되는 UI 카탈로그 항목은 리소스 셋과 연결자 계약을 통해 검토했다. 각 위젯의 입력 목록과 스타일은 이번 함수 감사의 범위 밖이다.

판정의 **수정**은 재현 또는 구현 근거가 있는 계약 문제, **개선**은 선택할 수 있는 API나 문서 제안, **유지**는 이번 검토에서 현재 경계가 타당하다는 판단이다. [종합 보고서](consolidated-review.md)

## Core · 리소스 작성과 Registry

| 공개 호출 | 판정 | 편의성·직관성·확장성 |
| --- | --- | --- |
| `createRegistry` | 개선 | 빈 생성과 명명 옵션은 읽기 쉽다. 배열 축약은 쉽게 쓸 수 있지만 두 생성 문법을 가르친다. 첫 예제는 옵션 객체를 사용한다. |
| `defineResourceSet` | 유지 | 버전·의존성·정의·구현을 한 import 단위로 묶는 목적이 분명하다. 동일 ID·버전은 객체 동일성 규칙을 문서화한다. |
| `defineCodeAction` | 유지 | 구현 전 계약으로 타입·필수 기능을 고정하는 경계다. `typeRef` 입력을 명시하는 경로를 같이 가르친다. |
| `CodeActionContract.implement` | 유지 | 등록과 함수 교체가 모두 이 값을 받는 흐름은 직관적이다. 별칭과 래퍼를 추가할 이유가 작다. |
| `ActionHandler` | 유지 | 명명된 입력·신호·실행 기능을 하나의 context로 받는다. output 검증과 반환값의 기준을 계약과 함께 보여준다. |
| `ActionContext.invokeAction` | 유지 | 하위 호출이 부모 실행의 취소·스냅샷을 상속한다. 최상위 호출과 같은 이름을 쓸 실질적 이유가 있다. |
| `Registry.registerResources` | 유지 | 선언형 문서의 일괄 등록에 적합하다. 코드와 의존성을 함께 등록할 때까지 예제를 섞으면 입력 차이를 알기 어렵다. |
| `Registry.registerResourceSet` | 유지 | 원자 등록 경계로 적합하다. 첫 앱에서 팩토리 밖으로 깊게 접근하는 비용과 중복 Core 모듈 오류는 별도 개선 대상이다. |
| `Registry.registerAction` | 수정 | 정의·함수 두 인자에 작성된 엔트리를 분해하면 `requires`가 보존되지 않는다. 엔트리 경로를 공식 기본으로 지정하고 직접 등록 오버로드의 필요를 검토한다. |
| `Registry.registerComponentContract` / `Registry.registerComponentContracts` | 개선 | 계약만 적재하는 용도는 분명하다. 셋 등록이 같은 ID의 구현을 붙이는 다음 단계라고 추론하기 쉬우므로 테스트·계약 검증·기존 키 교체의 경로를 명시한다. |
| `Registry.updateResource` | 수정 | 기존 구현을 보존하며 새 Component 계약을 발행할 때 호환성을 검사하지 않는다. 직접 포트와 참조 Type 변경을 검사한다. `replaceResource`와 동작을 나란히 설명한다. |
| `Registry.replaceResource` | 유지 | `resource`·`action`·`component` 태그가 대상을 명확히 한다. 기존 View가 새 구현을 쓰는 시점도 예제에서 밝힌다. |
| `Registry.get` | 개선 | 종류+ID 조회와 실패는 일관적이다. 탐색·존재검사에는 `list` 필터가 있다. 별도 조회 함수는 수요가 확인되면 검토한다. |
| `Registry.list` / 필터 predicate | 유지 | 종류·속성·predicate가 있어 소비자가 필요한 범위만 조회할 수 있다. 읽기 전용 predicate 입력과 문자열 종류 필터를 예제로 보여준다. |
| `Registry.exportResource` | 유지 | 읽기 전용 조회와 편집·직렬화용 사본의 차이가 이름에서 드러난다. |
| `Registry.isCode` | 유지 | 선언형과 코드형 구분에 적합하다. 이름에서 구현·연결자 준비 여부까지 추론하지 않도록 결과 의미를 좁혀 설명한다. |

[Core 선언](../../../packages/core/src/index.d.ts) · [Registry 구현](../../../packages/core/src/registry.mjs)

## Core · Runtime과 View

| 공개 호출 | 판정 | 편의성·직관성·확장성 |
| --- | --- | --- |
| `createRuntime` | 개선 | 단일 명명 객체와 명시 Registry 주입을 유지한다. 새 Registry를 만들 때 초기 셋을 전달할 수 있는 구성을 제안한다. |
| `RuntimeSettings.resourceResolver` | 수정 | 조회 실패 반환 타입을 실제 동작과 맞추고, 생성·교체에서만 탐색하는 범위를 명시한다. |
| `RuntimeSettings.authorize` | 유지 | `operation`으로 분기하고 실행 대상의 읽기 전용 ID를 준다. 동기 제한과 불투명 owner 사용 예를 안내한다. |
| `Runtime.createView` | 수정 | 인라인과 `{ref}` 선택은 이해하기 쉽다. 계약만 등록한 공식 헤드리스 예제는 현재 준비 규칙에서 실행이 막힌다. |
| `Runtime.invokeAction` / `View.invokeAction` | 개선 | 명명 요청과 `signal`은 일관적이다. TS가 작성 계약의 ID·입력·출력을 호출 지점으로 전달하는 선택형 경로를 검토한다. |
| `Runtime.dispose` / `View.dispose` | 개선 | 새 실행 차단과 실제 정리 완료를 구분해야 하는 호스트에는 명시적인 대기 방법이 필요하다. 렌더러와 같은 이름이 다른 대기 의미를 갖는다. |
| `View.setInputs` | 개선 | 전용 이름은 찾기 쉽다. 전체 입력 집합을 바꾸는 의미, 다른 적용을 대체하는 순서, 취소 옵션의 차이를 설명한다. |
| `View.updateDefinition` | 유지 | 현재 수명·고정 Registry를 사용하는 변경이다. `setInputs`·`replace`·`applyResourceSets`와 비교하는 표가 필요하다. |
| `View.applyResourceSets` | 유지 | 기존 View에 영향을 줄 때 호출을 구분할 가치가 있다. 셋 등록 및 적용에서 실패하는 시점, 버전 선택과 취소를 예제로 연결한다. |
| `View.replace` | 유지 | 최신 구성과 새 내부 수명을 선택하는 이유가 분명하다. 등록된 `ref` 사용과 보존되는 서비스 State를 안내한다. |
| `View.whenSettled` | 유지 | 적용 핸들과 Query 보고를 한정해 기다린다. 표시 핸들의 동명 메서드는 DOM 반영까지 기다린다는 점을 함께 읽을 수 있게 한다. |
| `View.exportDefinition` | 유지 | GUI 편집기·저장과 재적용에 직접 쓰는 JSON 사본 경계다. |
| `View.getState` / `View.getQuery` | 개선 | 이름과 선택 instance ID로 대상을 찾는 것은 타당하다. 반복 자식의 ID가 스냅샷에서 온다는 예제와 누락 시 실패를 붙인다. |
| `View.getSnapshot` | 유지 | 즉시 읽는 경로로 명시적이다. 스냅샷 상태 열거를 UI 진단 예제와 연결한다. |
| `View.subscribe` / 관찰 콜백 / 반환 해제 함수 | 수정 | 최초 콜백이 던지면 구독 해제 함수를 받지 못해도 구독이 남는다. 최초 전달과 후속 실패 정책을 명시한다. |
| `View.emit` | 개선 | 직접 실행과 이벤트 전달의 효과를 구분한다. 앱 외부 호출은 `invokeAction`, 커넥터 내부는 수명 제약이 적용되는 `context.emit`을 기본으로 보여준다. |

[Core 선언](../../../packages/core/src/index.d.ts) · [Runtime 실행](../../../packages/core/src/runtime.mjs) · [공개 View 래퍼](../../../packages/core/src/api.mjs)

## Core · State·Query·URL·시간과 유틸리티

| 공개 호출 | 판정 | 편의성·직관성·확장성 |
| --- | --- | --- |
| `createStateStore` / `StateStore.createScope` | 유지 | 서비스가 소유한 State의 생성과 범위를 구분한다. 화면 소유 State만 쓰는 시작 예제에서는 노출할 필요가 작다. |
| `StateStore.transaction` / 트랜잭션 콜백 / `StateStore.writeBatch` | 수정 | 동기 변경과 일괄 쓰기의 구분은 유효하다. 트랜잭션의 교체 알림과 명시 쓰기 우선순위, 병합된 관찰 값 불변성을 고친다. |
| `StateStore.subscribe` / 관찰 콜백 / 반환 해제 함수 / `StateStore.getDiagnostics` | 유지 | 즉시 전달, 범위 선택, 콜백 실패 관찰을 제공한다. 트랜잭션에서 발행하는 데이터의 불변성은 해당 행의 수정 대상이다. |
| `StateStore.registerReaction` / 반환 해제 함수 | 개선 | 소유자·watch·target의 역할은 이해하기 쉽다. View 선언형 반응과 서비스 레벨 반응 선택 이유를 안내한다. |
| `StateStore.connectUrl` / `StateStore.connectUrl.onError` | 유지 | 호스트 직접 연결과 View에 위임하는 URL 옵션 모두 의미가 있다. 한 Store 연결·예약과 바인딩 차이를 안내한다. onError로 받은 실패 키·단계의 타입은 URL 진단 행에서 다룬다. |
| `StateStore.dispose` | 유지 | Store 소유자가 전체 scope를 닫는다. 주입받은 공유 Store의 책임을 소유권 표에 명시한다. |
| `StateScope.registerState` / `StateScope.replaceState` | 유지 | 기존 핸들 무효화가 일어나는 교체를 이름으로 구별한다. |
| `StateScope.getState` / `StateScope.removeState` / `StateScope.dispose` | 유지 | 이름 조회·제거와 범위 종료의 의미가 충분히 분리돼 있다. 누락 오류와 오래된 핸들의 수명을 설명한다. |
| `StateScope.connectClock` / 반환 해제 함수 | 수정 | 시간 입력용 분리는 타당하다. 등록 도중 실패할 때 첫 값의 처리, 등록 도중 Scope 종료, 셀 제거·교체 때 시계 해제를 정한다. |
| `StateHandle.read` / `StateHandle.getSnapshot` | 유지 | 값만 읽거나 미준비·오류를 구분해서 읽는 두 용도가 있다. |
| `StateHandle.write` / `StateHandle.reset` | 유지 | 검증을 통과해야 쓰고 reset은 초기 기준을 따른다. 더 적은 메서드로 합칠 이유가 작다. |
| `QueryHandle.getSnapshot` | 유지 | data·error·stale의 상태를 직접 읽는 작은 API다. |
| `QueryHandle.refresh` / `QueryHandle.retry` | 수정 | 새 조회와 실패한 실행의 재시도 입력은 다르다. Action 포트 및 View의 취소 실패는 선언된 Promise 거절로 통일한다. |
| `UrlAdapter.read` / `UrlAdapter.subscribe` / 변경 콜백 / 구독 해제 함수 | 유지 | 브라우저 또는 자체 router를 주입할 수 있는 모양이다. URL 변경을 보고하는 시점과 해제 계약을 명시한다. |
| `UrlAdapter.writeOwned` / `UrlAdapter.writeOwned.isCurrent` | 유지 | 소유 쿼리만 바꾸고 지연 반영 직전 유효성을 확인한다. 일반 앱에게 어댑터를 직접 작성하게 할 필요가 있는지 별도로 본다. |
| `UrlConnection.isReady` / `UrlConnection.restore` | 수정 | 준비·초기 복원 실패·종료를 프로퍼티 `ready`와 상태 검사에서 구분할 수 있어야 한다. |
| `UrlConnection.getDiagnostics` / `UrlConnection.removeOwned` / `UrlConnection.dispose` | 수정 | 진단·키 제거·연결 종료의 구분을 유지한다. 제거 대상 외의 지연 쓰기를 보존하고 실패 키·단계의 공개 타입과 조회 위치를 보완한다. |
| `Clock.now` / `Clock.subscribe` / tick 콜백 / 구독 해제 함수 | 유지 | 앱 시간 데이터용이다. Query 스케줄러와 분리한 것은 목적에 맞는다. |
| `TimerClock.now` / `TimerClock.setTimeout` / `TimerClock.clearTimeout` / 타이머 콜백 | 개선 | 시계와 일치하게 증가하는 `now`가 필요하며 고정 숫자는 기한을 만료시키지 못한다. HTTP 실행기의 별도 설정 이름도 설명한다. |
| `mergeOwnedUrl` | 유지 | 소유한 쿼리 키만 패치하는 독립 유틸리티로 적합하다. |
| `computeGridLayout` | 수정 | 순수 계산 경계를 유지한다. 중복 주소가 점유 공간과 결과 Map을 어긋나게 하므로 유일성 검증과 오류를 설명한다. |

[Core 선언](../../../packages/core/src/index.d.ts) · [Store 구현](../../../packages/core/src/state.mjs) · [URL 구현](../../../packages/core/src/url.mjs) · [Grid 구현](../../../packages/core/src/grid.mjs)

## Core · HTTP·CEL 선택 진입점

| 공개 호출 | 판정 | 편의성·직관성·확장성 |
| --- | --- | --- |
| `createHttpExecutor` / `createHttpExecutor 반환 실행기` | 유지 | transport·권한·비밀 해석을 구성한 실행기를 Runtime에 주입하는 경계가 명확하다. 스케줄러와 시간 초과의 차이는 설명할 가치가 있다. |
| `RequestExecutor` / `HttpExecutorOptions.transport` | 유지 | 실행 계획 가로채기와 실제 HTTP 전송 대체의 단위를 분리한다. |
| `HttpExecutorOptions.authorize` / `HttpExecutorOptions.resolveSecret` | 유지 | 신뢰 정책을 호스트에 돌려준다. Action 권한과 HTTP 목적지 권한의 대상을 구별하고 신호가 전달되는 곳을 명시한다. |
| `HttpExecutorOptions.clock.now` / `HttpExecutorOptions.clock.set` / `HttpExecutorOptions.clock.clear` / 타이머 콜백 | 수정 | 초기 예외를 정제하고, 정리 실패가 성공·시간 초과·취소를 덮지 않게 한다. Runtime 시계와 설정 명칭의 차이는 별도 개선 대상이다. |
| `compileCel` / `compileCel 반환 평가기` / `evaluateCel` | 유지 | 컴파일 재사용과 한 번 평가가 구분된다. `unknown` 결과의 검증 방법과 컴파일·실행 오류를 나눠 설명한다. |
| `CelFunction.run` | 수정 | 입력 tuple과 동기 콜백 제약을 유지한다. 사용하는 이름이 CEL 예약 이름이면 등록 시점에 거절한다. |

[HTTP 공개 선언](../../../packages/core/src/http.d.ts) · [CEL 공개 선언](../../../packages/core/src/cel.d.ts)

## Core · 렌더러 확장 진입점

| 공개 호출 | 판정 | 편의성·직관성·확장성 |
| --- | --- | --- |
| `createRendererHost` | 개선 | 프레임워크 연결 수명 로직을 재사용하는 지점이다. 외부 확장 가이드에서 브라우저 `ComponentConnector` 구현과 선택 기준을 먼저 보여준다. |
| `RendererHostOptions.validateTarget` / `RendererHostOptions.disposeOwned` / `RendererHostOptions.connect` | 유지 | 호스트 전용 검증·정리·연결을 교체할 수 있어 경계가 작다. 콜백 중 실패 정책을 예제와 함께 명시한다. |
| `RendererHostOptions.onRenderError` / `RendererHostOptions.connection.isOpen` / `RenderEmission` | 개선 | 표시 연결에 실패와 이벤트를 한정한다. `RenderEmission`의 선택적 `current`가 검사하는 인스턴스 수명과 인자 위치를 예제로 보여준다. |
| `RendererHostOptions.connect 반환 dispose` / `RendererHostOptions.connect 반환 whenRendered` | 유지 | 외부 프레임워크가 정리와 투영 완료를 보고한다. 투영 세대·순번을 받는 이유와 대체된 작업의 경계를 안내한다. |
| `subscribeRenderProjection` / 투영 관찰 콜백 / 반환 해제 함수 | 수정 | 최초 콜백이 던지면 등록이 남고 폐기 후에도 재생된다. 독립 실행 검증에서 전달 중 등록에 따른 중복 재생도 확인했다. 최초 전달·동일 투영 중복·해제 의미를 고정한다. |
| `RenderProjection.componentBinding` / `RenderProjection.isCodeComponent` | 유지 | 같은 투영의 코드 분류와 바인딩 일관성을 관찰한다. 공개 Registry로 우회할 이유가 줄어든다. |
| `prepareOwnedView` / `prepareOwnedView 반환 준비 함수` / `prepareOwnedView.owner.isOpen` / `prepareOwnedView.owner.onCreate` / `prepareOwnedView.owner.close` | 개선 | 생성 입력 캡처와 에러·취소 수명을 재사용할 수 있다. 이 수준은 프레임워크 통합자 대상으로 준비의 동기 실패·반환 함수의 비동기 실패를 문서화한다. |
| `createRenderWaiter` / `createRenderWaiter.render` / `createRenderWaiter.getErrorListener` / `createRenderWaiter.deliverDiagnostic` / `createRenderWaiter.onClose` / `createRenderWaiter.isOpen` | 개선 | 유연한 전달 방식이지만 조합 조건을 알기 어렵다. 전문 통합용으로 예제를 하나 유지하고 진단 전달의 중복 정책을 설명한다. |
| `createRenderWaiter 반환 whenRendered` / `createRenderWaiter 반환 whenSettled` / `createRenderWaiter 반환 emit` / `createRenderWaiter 반환 dispose` | 개선 | 공통 대기·전달 이름이 재사용된다. 표시 연결 핸들의 비동기 종료와 달리 이 대기 객체 자체의 종료는 동기다. |
| `createDiagnostic` / `notifyDiagnostic` | 수정 | 외부 원인 정제와 동일 발생 전달 공통화의 가치는 크다. Svelte에서 원래 콜백의 동일성과 Promise 결과가 이 경로까지 이어져야 한다. |
| `createRenderError` / `createPreparationError` | 개선 | 안정된 오류 생성은 유용하다. `missing` 불리언의 호출 의도가 숨고, 연결자 누락 시 필요한 ID가 빠진다. |
| `RendererErrorListener` / `notifyDiagnostic.observer.isOpen` / 렌더러·연결·대기 객체의 `onError` | 수정 | 종료 후 호출 억제와 동일 함수 중복 제거는 유효한 계약이다. 비동기 관찰자의 거절 격리를 모든 경로에서 동일하게 보장한다. |

[렌더러 공개 선언](../../../packages/core/src/renderer.d.ts) · [진단 구현](../../../packages/core/src/diagnostics.mjs)

## DOM·Svelte·UI

| 공개 호출 | 판정 | 편의성·직관성·확장성 |
| --- | --- | --- |
| `DOM.createRenderer` / `Svelte.createRenderer` | 개선 | 같은 이름에서 Svelte는 Runtime을 소유할 수 있고 DOM은 빌린다. 소유권을 문서에서 비교하고 각 패키지의 기본 커넥터를 명시한다. |
| `Renderer.mount` / `Renderer.attach` / `Renderer.dispose` | 수정 | 새 View 소유, 기존 View 대여, 종료를 구분한다. Svelte에서 소유 Runtime까지 정리를 기다리는 계약과 자동 정리 오류 관찰을 보완한다. |
| `MountedView.unmount` / `RenderAttachment.detach` | 유지 | 각각 소유 View와 연결만 종료하는 동작 차이를 이름으로 전달한다. |
| `RenderAttachment.whenRendered` / `RenderAttachment.whenSettled` | 유지 | 표시 완료와 Query·적용의 완료를 합치는 용도가 실제로 다르다. mount의 `ready` 속성과 함께 목적별로 가르친다. |
| `ComponentConnector.accepts` / `ComponentConnector.mount` | 개선 | 렌더러와 독립으로 구현을 연결하는 핵심 확장 지점이다. ID 선택과 accept 실패의 진단을 개선한다. |
| `domConnector.accepts` / `domConnector.mount` / `DomComponent.mount` | 유지 | DOM 구현은 mount 핸들을 보유한다. 기본 DOM 커넥터가 이미 포함된다는 점을 알려 중복 등록을 예방한다. |
| `svelteConnector.accepts` / `svelteConnector.mount` | 유지 | DOM 렌더러에 Svelte 커넥터를 추가하는 혼합 호스트에서 유용하다. Svelte 렌더러는 이미 포함한다. |
| `ComponentMountContext.emit` / `ComponentMountContext.invalidate` / `ComponentMountContext.provideSlot` / `ComponentMountContext.provideSlot 반환 철회 함수` | 개선 | 수명에 맞춘 이벤트, 렌더 재요청, 슬롯 등록과 철회를 분리한다. 확장 예제에서 종료 이후 이벤트와 슬롯 교체를 보여준다. |
| `MountedComponent.update` / `MountedComponent.setPending` / `MountedComponent.whenRendered` / `MountedComponent.afterChildren` / `MountedComponent.dispose` | 유지 | 동기 구현은 완료 대기를 생략하고, 비동기는 작업 취소에 응답한다. 대기와 자식 슬롯 완료의 순서 및 정리 실패 결과를 연결자 가이드에서 설명한다. |
| `BrowserDisplayOptions.fallback` / `MountedDisplayFallback.update` / `MountedDisplayFallback.whenRendered` / `MountedDisplayFallback.dispose` | 개선 | 간단한 동기 폴백은 반환 생략이 편리하다. 비동기 폴백은 반환 핸들의 타입과 중단 계약을 찾기 어려우므로 명시적으로 안내한다. |
| `svelteComponent` | 유지 | 같은 계약을 등록과 props 타입이 공유하는 방향이 맞다. 새 연결자 설정을 이 작성 함수에 섞지 않는다. |
| `ViewstemView` | 개선 | Svelte markup으로 View 수명을 관리하는 표준 진입점에 적합하다. 단독 화면에 한해 렌더러 생성·셋 등록·정리를 맡는 모드를 제안한다. 공유 모드는 이미 있는 명시적 renderer를 활용한다. |
| `ViewstemView.whenRendered` | 유지 | 컴포넌트 표시 대기용으로 직접 쓸 수 있다. |
| `ViewstemView.whenSettled` | 개선 | `view` 대여에서는 사용 가능하다. `source` 소유에서 검증 가능한 토큰을 돌려줄 경로가 없다. 타입 또는 API에서 지원 경로를 드러낸다. |
| `ComponentAdapter` / `ComponentAdapterProps.emit` / `ComponentAdapterProps.renderSlot` / `ComponentAdapterProps.provideSlot` | 유지 | 일반 Svelte 어댑터에서도 같은 이벤트·슬롯 수명 계약을 쓴다. 타입이 있는 입력을 읽는 정규 경로는 `node.inputs`다. 직접 자식 DOM이 필요하면 `provideSlot`을 사용한다. |
| `RenderFallback` / `ViewstemView.pending` / `ViewstemView.prepareError` / `ViewstemView.onError` | 개선 | 표시 슬롯과 관찰 콜백의 용도는 다르다. `onError`에서 원 콜백을 감싼 경로의 동작을 통일한다. |
| `transformError` | 개선 | Svelte 루트에서 오류 정제 역할이 있다. 함수명과 반환 타입만 보면 원인 변환을 기대하기 쉬워 정제 정책과 적용 범위를 명시한다. |

`@viewstem/ui`의 루트 export는 `ui` 셋이다. `/styles.css`와 `/support.json`은 스타일과 카탈로그다. 이 패키지의 호출 편의성은 `registerResourceSet(ui)`, 초기 셋 설정과 화면 범위의 스타일 적용에서 평가했다. [DOM 공개 진입점](../../../packages/dom/src/index.ts) · [Svelte 공개 진입점](../../../packages/svelte/src/lib/index.ts) · [UI 공개 진입점](../../../packages/ui/src/index.ts)
