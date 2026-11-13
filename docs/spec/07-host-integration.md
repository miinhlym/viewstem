# 호스트 등록 · 렌더러 연결

U41 API 정리: JS/TS 루트는 세 팩토리와 URL/Grid 유틸리티만 공개하며 HTTP·CEL 직접 실행기는 subpath로 제공한다. Registry·Store·Runtime·View는 타입과 공개 핸들로 사용하고 내부 엔진·검증기·생성자는 노출하지 않는다. `authorize`의 update owner는 공개 View, invoke owner는 메서드 없는 수명 식별 객체다. 코드 Action의 구현 함수는 권한 콜백에 노출하지 않는다. [변경 안내와 검증](../handoff/public-api-refactor-2026-11-02.md)을 따른다.

U37 구현: 실제 JS/TS API는 [core README](../../packages/core/README.md)와 [공개 타입](../../packages/core/src/index.d.ts)에 구체화했다. `NodeSnapshot`은 이름별 `slots`와 평탄한 `children`을 함께 제공한다. 기존 화면은 주입한 정의를 유지하고 `replace`/새 createView에서 새 Registry 정의를 주입한다. 아래 예제·SDK 표와 공개 선언은 같은 이름을 사용하며 최소 계약·권한·초기 완료 의미는 그대로 따른다.

U39–U40에서 Svelte 클라이언트 렌더러와 실행 중인 View를 빌리는 `ViewstemView`를 도입했다. 그때의 공개 호출은 [Svelte 구현 인계](../handoff/svelte-implementation-2026-11-02.md)에 기록했다. 현재 호출은 아래 D150을 따른다.


기준일: 2026-10-28 · Viewstem v1 설계 계약

[명세 시작점](../VIEWSTEM-SPEC.md) · 이 문서는 최종 명세의 주제별 상세다. **확정**과 **구체화 필요/구현 제안/이전 승인 이관**을 구분해 읽는다. JSON은 계약 설명이며 실행 검증 완료를 뜻하지 않는다.

## JS/TS 호스트 API · D150

DOM과 Svelte의 명령형 연결을 공통 `createRenderer → mount → unmount`로 이행한다. `mount`는 준비 중에도 해제할 수 있는 화면 핸들을 동기로 반환하고, 기존 View를 빌리는 `attach`는 연결만 소유한다. View에 입력·전체 정의·교체·독립 Action 연산을 둔다. 초기 데이터와 DOM 완료는 지정한 적용을 기준으로 관찰한다.

새 적용은 후보를 준비한 뒤 **Registry·Store·View와 URL 예약을 하나의 동기 구간에서 확정**한다. 구독자에게 그 결과를 함께 보인 뒤 소유 URL 정리 및 연결을 실행한다. URL 후처리 오류는 새 적용의 진단으로 남으며 최초 Query는 정리 및 URL 입력 준비 순서를 따른다. 두 명령형 렌더러는 같은 Core 설치에서 대상 예약을 공유한다.

[구현 계획과 수락 기준](../designs/viewstem-host-api-implementation-2026-11-13.md)에 시그니처, 적용 순서, 호스트 예제를 둔다. 공개 시그니처는 [Core 타입](../../packages/core/src/index.d.ts), [DOM 사용법](../../packages/ui/README.ko.md), [Svelte 사용법](../../packages/svelte/README.ko.md)을 따른다.

**D151 · Svelte 트리에서 View 생성.** `ViewstemView`는 기존 View를 `view`로 빌리거나 `source`와 초기 `inputs`로 클라이언트에서 새 View를 만든다. 두 방식 모두 부모 context를 상속한다. 소유 View의 최초 설정은 컴포넌트 수명에 고정한다. 새 View는 `{#key}`로 다시 마운트한다. 컴포넌트 제거 또는 렌더러 폐기는 준비를 취소하고 소유 View를 정리한다. 대여 View의 수명은 호스트가 관리한다. `whenRendered()`는 생성과 첫 DOM 반영을 기다리며 Query 보고는 앱이 View를 생성하고 빌려주는 경로에서 관찰한다. [Svelte 레퍼런스](../../apps/docs/src/content/docs/ko/docs/svelte/viewstem-view.md)를 따른다.

소유 View의 생성 설정은 컴포넌트 초기화 시점에 캡처하고, 클라이언트 마운트 뒤 생성한다. 이미 커밋한 State의 알림 중 렌더러를 폐기하면 확정한 Registry 변경은 보존하며 최초 Query를 시작하기 전에 소유 View를 닫는다. 렌더러 폐기 Promise는 소유 View 정리가 끝난 뒤 이행한다. 기존 표시 연결에서 시작한 완료 대기는 교체 또는 폐기에 따라 취소되며, 닫힌 연결의 캐시는 조회할 수 없다.

**D152 · 소유 View의 실행 차단과 정리.** 브라우저와 Svelte의 `mount()`, Svelte의 `ViewstemView source`는 같은 소유 생성 경로를 쓴다. 후보 View는 참조 해결 전에 소유자에 등록한다. 공개 Core `createView()`와 `replace()`의 준비 신호는 동기 확정 직전까지 유효하다. 호스트의 종료는 View 수명 전체에 적용하며, 확정 후 알림 중에 닫으면 Registry 커밋과 외부 소유 셀을 보존하고 해당 View의 실행을 차단한다.

렌더러 전체를 닫을 때는 모든 소유 화면의 실행 자격을 먼저 무효화한다. Store 트랜잭션, 알림 또는 순수 함수 실행 중 종료를 요청하면 실행을 차단한 뒤 구조를 바꾸는 정리를 해당 구간 밖에서 수행한다. `unmount()`와 렌더러 `dispose()`는 소유 scope·구독·타이머·표시 연결의 정리를 기다린다. 진행 중 HTTP와 resolver에는 중단 신호를 전달하며, URL은 `isCurrent()`로 늦은 반영을 차단한다. 이 외부 작업들의 응답은 종료 완료의 조건에 포함하지 않는다. 대여 연결 해제는 View와 다른 표시 연결의 수명을 유지한다.

호스트 타이머와 URL 어댑터에서 돌아온 뒤에도 종료 상태를 확인한다. HTTP 실행기 호출과 URL 복원·쓰기는 해당 수명이 유효할 때만 시작한다. 호환 갱신에서는 유지한 Query 사용과 캐시를 보존한다. Store 알림 중 시작한 갱신·재시도는 최신 Query 설정이 적용된 뒤 판정한다. 닫히거나 교체된 연결에서 진행 중인 표시 대기는 `CANCELLED`로 끝난다.

**D153 · 렌더러와 화면의 오류 관찰.** `mount()`, `attach()`, `ViewstemView`는 렌더러 관찰자 다음에 화면 관찰자를 호출한다. 각 호출 직전에 연결과 관찰자의 수명을 확인한다. 같은 진단 발생에는 연결이나 렌더러를 가로질러 함수 참조당 한 번 전달한다. 새 연결의 현재 노드·Query 오류와 현재 적용의 URL 진단은 발생 당시의 불변 공개 데이터를 사용한다. Query 실행 실패는 다음 실행에 의해 투영에서 가려져도 당시 관찰자에게 전달한다. 연결의 렌더 실패는 해당 연결의 관찰자에게만 전달한다. 관찰자 예외·Promise 거절과 정상 취소는 새 진단을 만들지 않는다.

## 10.8 서비스 연결과 에이전트의 같은 경로

아래 예제는 Svelte 앱의 어댑터와 재사용 정의를 등록하고 화면을 연결한다. 저장 서비스는 호스트가 제공한다.

```js
import { createRenderer } from '@viewstem/svelte';

const renderer = createRenderer({
  components: [{ contract: buttonContract, component: ButtonAdapter }],
});
renderer.runtime.registry.registerAction(confirmContract, confirmImplementation);
renderer.runtime.registry.registerResources(resources);

const screen = renderer.mount({ source: { ref: 'editor-view' }, target: element });
const view = await screen.ready;
await screen.whenSettled(view.initial);
await serviceApi.saveDefinition(view.exportDefinition());
```

공개 대상·입력·호출자 권한을 검사하고 실제 서버 쓰기는 서버가 다시 검증한다. export/save는 서비스가 선택한 명시적 저장 흐름이다.

**등록 식별은 확정:** 위 함수명과 무관하게 같은 등록 집합은 `(kind, id)`로 정의를 구별한다. Query와 Component가 같은 ID인 것은 허용한다. 코드형·선언형 Component끼리 또는 코드형·선언형 Action끼리 같은 ID이면 해당 종류 안의 중복 오류다. `xxxRef`는 기대 종류만 찾으며 다른 종류나 구현 방식으로 fallback하지 않는다. [등록 계약](../VIEWSTEM-SPEC.md#41-정의와-인스턴스)의 예시와 U01을 따른다.

**초기 적용의 관찰 의미도 확정:** 준비된 UI는 점진 표시하고, 실행 가능한 최초 Query·화면 반영이 성공/개별 오류로 정리되면 초기 처리는 완료된다. 입력 대기가 초기 완료를 계속 막지 않고, 적용 구조/타입 충돌은 기존 화면·Store를 보존한다. 전부 inline/static이면 서비스 resolver/Query 실행 콜백은 불필요하며 필요한 연결 누락은 오류다. [초기 적용 상세](09-preserved-contracts.md#초기-적용-완료의-확정-관찰-의미)의 E61/E68을 새 SDK에 연결한다. 과거 예시에서 시그니처를 추정하지 않으며 아래 U13의 현재 SDK 선택을 적용한다.

## 최소 SDK와 적용 완료

**확정(U13, D150):** 공개 View 연산과 완료 핸들은 [D150 구현 계획](../designs/viewstem-host-api-implementation-2026-11-13.md)의 API를 따른다. [U42 검증 기록](../handoff/public-api-naming-verification-results.json)은 이전 인터페이스의 증거다.

| 표면 | 계약 |
|---|---|
| createRegistry() | 등록 집합 생성. registerResources(resources)는 묶음 전체 구조·참조·순환 검증 후 원자 등록 |
| registry.registerAction(definition, implementation) | 코드형 Action의 공개 정의와 실행 함수 등록. 같은 종류 ID 중복 거절. 타입에서 필수인 입력에는 해당 포트와 required:true를 요구 |
| registry.registerComponentContract(contract) | 코드 Component 공개 계약 등록. 실제 렌더러 구현은 같은 ID에 별도 연결 |
| createStateStore() | 서비스가 소유할 core Store 생성. createScope()로 격리된 소유 범위 생성 |
| createRuntime(options?) | Registry 생략 시 생성, stateStore·requestExecutor·resourceResolver 선택. Store 생략 시 core가 생성·소유하며 주입 Store의 수명은 서비스가 유지. 실제 필요한 의존성이 없을 때만 오류 |
| runtime.createView(source, options?) | 구조를 확정한 뒤 View 반환. `view.initial`로 최초 적용을 식별 |
| view.updateDefinition(viewSpec, options?) / view.setInputs(inputs) | 다음 전체 View spec을 원자 reconcile. 같은 owner·노드 ID·대상 정의의 상태 유지. 실패 시 기존 정의·상태 유지 |
| view.replace(source, options?) | 같은 View의 내부 수명 교체. 준비 실패는 기존 View를 보존하며 성공은 적용 핸들을 반환 |
| view.exportDefinition() | 현재 View spec을 반환. 독립 리소스로 저장할 kind/id/name 외피는 서비스가 부여. 자동 저장·runtime snapshot export 아님 |
| view.dispose() | 소유 실행·내부 상태·구독 정리. 서비스 Store의 외부 소유 셀은 유지. 반복 호출은 안전한 no-op |
| view.invokeAction({actionRef 또는 action, inputs}) | 독립 명시 호출. owner 수명·공개 대상·권한·입력 검증 후 실행하고 실제 결과/void 또는 공통 오류 반환 |
| context.invokeAction({actionRef 또는 action, inputs}) | 코드 Action의 부모에 연결된 하위 호출. 부모 owner·스택·취소를 상속하며 변경 불가. 명시 입력·대상·권한·출력 검증 후 결과/오류 Promise 반환 [U35] |

변경은 `ViewApplication`을 반환한다. `view.whenSettled(application)`은 `{generation, queryErrors}`를 반환하며 실행 가능한 최초 Query의 개별 오류를 보고에 모은다. 입력 대기는 완료를 막지 않는다. 폐기 또는 다른 적용으로 대체된 미완료 보고는 `CANCELLED`다. 화면과 연결의 `whenSettled(application)`은 동일 적용의 DOM 반영까지 기다린다.

View가 투영을 계산·발행하는 중 구독자가 State를 변경하면 재계산 요청을 버리지 않고 기존 microtask 큐에 합친다. 현재 전달 중인 snapshot은 유지하며, 통지를 마친 뒤 후속 투영에서 변경된 입력을 발행한다. 예약된 투영이 남아 있으면 해당 적용의 초기 완료를 먼저 확정하지 않는다. View 폐기 뒤에는 예약 작업이 발행하지 않으며, 교체 뒤에는 현재 정의와 수명으로 계산한다. 일반적인 State 쓰기나 core 이벤트 전체를 별도 비동기 실행 엔진으로 바꾸는 것은 아니다. [D131 구현·회귀 검증](../handoff/view-subscription-projection-fix-2026-11-06.md)을 따른다.

update는 유지할 State의 계약과 기존 연결을 새 정의로 재검증하고, 불일치를 조용한 초기화로 숨기지 않는다. 구조 준비와 실제 외부 요청 실행은 구분한다. 구조 준비를 위한 정의 resolver 조회와 달리, 데이터 Query·코드 Action은 구조 검증 전에 선행 실행하지 않는다. native 실행 context는 `{inputs, signal, invokeAction}`이며 State/Query inputs에는 아래 호출 한정 핸들을 넣는다. 전체 runtime·Store는 자동 주입하지 않는다. untrusted 에이전트 입력으로 owner나 권한을 위조할 수 없도록 서비스 연결층이 공개 대상과 호출자 권한을 먼저 확인한다.

U35의 하위 호출은 부모가 끝난 뒤 사용할 수 없고, 대기하지 않은 자손도 부모 종료 시 취소한다. 별도 UI 관찰 id를 받지 않으며 입력·결과의 의미와 신뢰 코드 경계는 [Action 하위 호출 계약](04-action.md#재귀확장-실행의-경계)을 따른다. JS/TS 문맥의 함수명은 `invokeAction`으로 구체화했으며 다른 언어에서도 같은 수명·오류 의미를 유지한다.

## 상태·Query 핸들과 시계

State의 논리 주소는 `{scopeId, name}`이고 실제 셀 핸들은 생성 세대에 고정한다. scopeId는 core가 발급하며 local name에 `/` 등을 이어 붙여 정체성을 추측하지 않는다. 이름으로 다시 조회한 새 셀과 폐기된 옛 핸들은 다르다.

- StateScope는 registerState(name, declaration), getState(name), removeState(name), dispose()를 제공한다. 중복 등록·미등록 조회/제거는 오류다. 셀 교체는 명시 replaceState(name, declaration)로 수행한다.
- StateHandle은 read(), getSnapshot(), write(value)를 제공한다. read/getSnapshot은 [값 준비 상태](10-value-contracts.md#값-준비-상태의-읽기)를 따르며 쓰기는 전체 값 교체다. reset()은 최초 확정 초기 snapshot을 복원한다. snapshot이 missing이면 missing으로 복원하며 undefined 쓰기로 구현하지 않는다.
- QueryHandle은 getSnapshot(), refresh(), retry()를 제공한다. 호출에 묶인 핸들의 쓰기·갱신·재시도는 호출 취소 후 거절하지만 원래 공유 대상이나 다른 호출의 핸들을 폐기하지 않는다.
- Store.subscribe(selector, listener)는 전체·한 주소·주소 배열을 받으며 구독 해제 함수를 반환한다. 정확한 관찰 payload와 URL/reaction 연결은 [Store 상세](09-preserved-contracts.md#store-주소관찰reaction의-현행-매핑)를 따른다.

시간 공급 인터페이스는 `Clock.now(): epoch milliseconds`와 `Clock.subscribe(listener): unsubscribe`로 둔다. now는 유한한 안전 정수이며 listener는 같은 종류의 시각을 받는다. 서비스가 이 공급자를 명시적인 State/Value 입력에 연결하고 변화 시 그 입력을 갱신한다. 구독은 만든 owner가 해제하며 초기값/reset을 매 tick마다 다시 실행하지 않는다. core가 숨은 현재 시각이나 기본 tick 주기를 CEL에 넣지 않는다. 업무 시간대는 [U14의 명시 Value 입력](10-value-contracts.md#명시-업무-시간대와-달력-연산)으로 별도 연결한다. Clock의 epoch milliseconds는 날짜 데이터의 공개 문자열 표현과 별개이며 명시 변환 없이 날짜 State에 저장하지 않는다. [U13, U14]

## 공통 오류와 진단

**확정(U13):** 공개 오류는 `{code, message, resource?, instanceId?, location?, input?, cause?}`다. code·message는 필수, resource는 `{kind,id}`, location은 해당 선언 문서의 JSON Pointer이며 변환 단계는 배열 인덱스로 식별한다. input은 문제 포트 이름이다. cause도 같은 정제된 오류 형태이며 원본 예외·stack·전체 입력·secret·Login 응답을 그대로 직렬화하지 않는다. value 자체를 메시지에 붙이지 않아도 경로·원인을 식별할 수 있어야 한다.

code는 INVALID_DEFINITION, REFERENCE_NOT_FOUND, TYPE_MISMATCH, TYPE_CONTRACT_MISMATCH, INVALID_EXPRESSION, INPUT_NOT_READY, VALUE_PENDING, EXECUTION_BLOCKED, QUERY_REFRESH_DISABLED, INVALID_RETRY_STATE, ACTION_RECURSION, ASSERTION_FAILED, HTTP_ERROR, TIMEOUT, CANCELLED, LIMIT_EXCEEDED, INTERNAL_ERROR를 기본으로 한다. 하위 실행 실패를 일반 성공값으로 치환하지 않고 cause와 location을 보존한다. 선택 모듈은 namespaced 코드를 명시 등록할 수 있으나 core 코드 의미를 덮어쓰지 않는다.

**오류 정제의 실패 격리(U23):** 외부 콜백이 던진 값은 안전한 오류 DTO라고 가정하지 않는다. code를 확인할 때 getter·상속된 속성·임의 문자열 변환을 실행하지 않고, 직접 저장된 알려진 문자열 코드만 사용한다. Proxy의 속성 검사 등 메타데이터 확인 자체가 실패하는 경우도 정제 경계 안에서 처리한다. HTTP 실행 경로의 알 수 없거나 안전하게 읽을 수 없는 예외는 값·원본 예외·stack을 포함하지 않는 고정 HTTP_ERROR로 반환한다. 이미 확정된 TIMEOUT/CANCELLED는 유지한다. 신뢰할 수 있는 내부 위치·원인의 정제된 진단을 제공하는 기존 계약은 유지하며, 외부 예외 객체를 그대로 복사·로그 출력하는 대체 경로를 두지 않는다.

**U22 문제의 수정·검증(U23):** [독립 HTTP 실험 P35–P38](../handoff/t2-http-boundary-2026-10-29.md)에서 직접 저장된 코드만 확인하고 속성 검사 실패도 고정 오류로 처리하도록 보완했다. getter·Proxy·형 변환·오염된 다른 필드·늦은 예외와 TIMEOUT/CANCELLED 경합을 검증했다. 수정 전 소스·결과는 별도 보존하며, 실제 core 전체 오류 처리의 완료를 뜻하지 않는다.

**U34 독립 State 실험:** 오류 정제 중 다시 발생하는 예외와 `null`·`false` 등의 reject 값도 실패로 처리한다. 알 수 없는 State/관찰 콜백 예외는 고정 INTERNAL_ERROR로 격리하며 다른 관찰자 통지를 막지 않는다. 폐기된 의존 셀의 결과를 현재 성공값으로 유지하지 않고 세대에 묶인 CANCELLED로 전파한다. [실행 범위와 회귀](../../experiments/t3-state/README.md)는 실제 core SDK 구현과 구별한다.

이 오류 표면과 값 snapshot은 서로 다른 계약이다. Action 관찰의 error와 Query 관찰의 error에는 같은 오류를 넣되 각 리소스의 status/data 의미는 유지한다. 네트워크·취소·동시 교체에서의 실제 적합성은 구현 후 검증해야 한다.

공용 리소스는 `runtime.registry.exportResource`로, 현재 화면의 ViewSpec은 `view.exportDefinition`으로 추출한다. Store는 `writeBatch`, `registerReaction`, `getDiagnostics`, URL 연결은 `getDiagnostics`를 제공한다. Svelte `whenRendered()`는 현재 projection의 DOM 반영을 기다리며 Query 완료·paint를 보장하지 않는다. State JSON의 `initial`은 초기값이며 공개 View의 `initial`은 최초 적용 핸들이다. [전체 이름 이행표](../handoff/public-api-naming-2026-11-02.md)를 따른다.

## 컴포넌트 등록

브라우저 기본 UI의 계약은 `@viewstem/ui`의 `registerShadcn(registry)`로 등록한다. 실제 입력·이벤트·슬롯의 범위는 [UI 사용법](../../packages/ui/README.ko.md)과 패키지의 `support.json`을 따른다.

호스트는 Core Registry의 `registerComponentContracts(contracts)`로 여러 계약을 등록할 수 있다. Svelte의 `createRenderer({ components })`는 새 Registry에 계약과 구현을 함께 등록한다. 기존 계약에 구현을 연결할 때는 `renderer.bindComponent(id, component)`를 호출한다. [Svelte 등록 API](../../apps/docs/src/content/docs/ko/docs/svelte/renderer.md)를 참고한다.
