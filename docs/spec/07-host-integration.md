# 호스트 등록 · 렌더러 연결

기준일: 2026-10-28 · Viewstem v1 설계 계약

[명세 시작점](../VIEWSTEM-SPEC.md) · 이 문서는 최종 명세의 주제별 상세다. **확정**과 **구체화 필요/구현 제안/이전 승인 이관**을 구분해 읽는다. JSON은 계약 설명이며 실행 검증 완료를 뜻하지 않는다.

**구현 제안:** 아래 JS는 책임 연결을 설명하는 의사 코드다. 함수명·시그니처·인자·반환 핸들은 확정 SDK가 아니다. 실제 코드 등록 확장은 Component와 Action이며, core가 전체 View/StateStore/runtime 권한을 native Action에 자동 주입하지 않는다.

## 10.8 서비스 연결과 에이전트의 같은 경로

```js
// 구현 제안용 의사 코드: 함수명과 인자는 최종 SDK 계약이 아니다.
const registry = createRegistry();
const renderer = createSvelteRenderer({ registry });

// 공개 계약과 실제 렌더러 구현은 별개로 등록한다.
renderer.registerComponent(buttonContract, ButtonAdapter);
registry.registerAction(confirmContract, confirmImplementation);
for (const resource of resources) registry.registerResource(resource);

const view = renderer.mount({ viewRef: "editor-view", target: element });

// 서비스·UI·에이전트는 같은 공개 변경/호출 기반을 사용한다.
// 실제 함수명·주소·호출자 권한 인자는 구현 시 구체화한다.
const definition = view.exportDefinition();
await serviceApi.saveDefinition(definition);
```

위 예시 전체를 최종 시그니처로 취급하지 않는다. 현재 최소 SDK 표면은 아래 U13을 따른다. 예시는 임의 액션 호출을 허가하지 않는다. 공개 대상·입력·호출자 권한을 검사하고 실제 서버 쓰기는 서버가 다시 검증해야 한다. export/save도 서비스가 선택한 명시적 저장 흐름이다.

**등록 식별은 확정:** 위 함수명과 무관하게 같은 등록 집합은 `(kind, id)`로 정의를 구별한다. Query와 Component가 같은 ID인 것은 허용한다. 코드형·선언형 Component끼리 또는 코드형·선언형 Action끼리 같은 ID이면 해당 종류 안의 중복 오류다. `xxxRef`는 기대 종류만 찾으며 다른 종류나 구현 방식으로 fallback하지 않는다. [등록 계약](../VIEWSTEM-SPEC.md#41-정의와-인스턴스)의 예시와 U01을 따른다.

**초기 적용의 관찰 의미도 확정:** 준비된 UI는 점진 표시하고, 실행 가능한 최초 Query·화면 반영이 성공/개별 오류로 정리되면 초기 처리는 완료된다. 입력 대기가 초기 완료를 계속 막지 않고, 적용 구조/타입 충돌은 기존 화면·Store를 보존한다. 전부 inline/static이면 서비스 resolver/Query 실행 콜백은 불필요하며 필요한 연결 누락은 오류다. [초기 적용 상세](09-preserved-contracts.md#초기-적용-완료의-확정-관찰-의미)의 E61/E68을 새 SDK에 연결한다. 과거 예시에서 시그니처를 추정하지 않으며 아래 U13의 현재 SDK 선택을 적용한다.

## 최소 SDK와 적용 완료

**확정(U13):** 다음 이름·결과 의미를 JS/TS core의 최소 표면으로 선택한다. 타입 선언 파일·제네릭 추론·렌더러별 감싸기 함수는 구현 시 이 계약에 맞춰 검증한다. 아래 표는 SDK 구현 완료 기록이 아니다.

| 표면 | 계약 |
|---|---|
| createRegistry() | 등록 집합 생성. registerResources(resources)는 묶음 전체 구조·참조·순환 검증 후 원자 등록 |
| registry.registerAction(definition, implementation) | 코드형 Action의 공개 정의와 실행 함수 등록. 같은 종류 ID 중복 거절 |
| registry.registerComponent(contract) | 코드 Component 공개 계약 등록. 실제 렌더러 구현은 같은 ID에 별도 연결 |
| createStateStore() | 서비스가 소유할 core Store 생성. createScope()로 격리된 소유 범위 생성 |
| createRuntime(options) | registry 필수, stateStore·requestExecutor·resourceResolver 선택. Store 생략 시 core가 생성·소유하며 주입 Store의 수명은 서비스가 유지. 실제 필요한 의존성이 없을 때만 오류 |
| runtime.mount({viewRef 또는 view, inputs}) | 구조 준비·검증·commit 후 Promise로 `{view, initial}` 반환. initial은 최초 처리 보고의 별도 Promise |
| view.update(viewSpec) | 다음 전체 View spec을 원자 reconcile. 같은 owner·노드 ID·대상 정의의 상태 유지. 실패 시 기존 정의·상태 유지 |
| view.replace({viewRef 또는 view, inputs}) | 새 수명으로 전체 교체. 준비 실패 시 기존 View 유지. 성공 시 이전 내부 수명 정리·새 initial Promise 반환 |
| view.exportDefinition() | 현재 View spec을 반환. 독립 리소스로 저장할 kind/id/name 외피는 서비스가 부여. 자동 저장·runtime snapshot export 아님 |
| view.dispose() | 소유 실행·내부 상태·구독 정리. 서비스 Store의 외부 소유 셀은 유지. 반복 호출은 안전한 no-op |
| runtime.invokeAction({actionRef 또는 action, inputs, owner}) | 독립 명시 호출. owner 수명·공개 대상·권한·입력 검증 후 실행하고 실제 결과/void 또는 공통 오류 반환 |
| context.invokeAction({actionRef 또는 action, inputs}) | 코드 Action의 부모에 연결된 하위 호출. 부모 owner·스택·취소를 상속하며 변경 불가. 명시 입력·대상·권한·출력 검증 후 결과/오류 Promise 반환 [U35] |

update/replace는 `{initial}`을 반환하며 각 initial은 그 적용 세대에 고정된다. 보고는 `{generation, queryErrors}`다. 실행 가능한 최초 Query의 개별 오류는 queryErrors에 모으고 initial 자체를 전체 적용 실패로 reject하지 않는다. 외부 입력 대기는 완료를 막지 않는다. commit 뒤 폐기·다음 세대 교체로 완료할 수 없게 되면 해당 initial은 CANCELLED다. core는 최초 projection 전달까지, 렌더러 연결은 해당 projection 반영 확인까지 포함해 자신의 initial을 완료한다. 렌더러가 없는 core 경로는 DOM을 기다리지 않는다.

update는 유지할 State의 계약과 기존 연결을 새 정의로 재검증하고, 불일치를 조용한 초기화로 숨기지 않는다. 구조 준비와 실제 외부 요청 실행은 구분한다. 구조 준비를 위한 정의 resolver 조회와 달리, 데이터 Query·코드 Action은 구조 검증 전에 선행 실행하지 않는다. native 실행 context는 `{inputs, signal, invokeAction}`이며 State/Query inputs에는 아래 호출 한정 핸들을 넣는다. 전체 runtime·Store는 자동 주입하지 않는다. untrusted 에이전트 입력으로 owner나 권한을 위조할 수 없도록 서비스 연결층이 공개 대상과 호출자 권한을 먼저 확인한다.

U35의 하위 호출은 부모가 끝난 뒤 사용할 수 없고, 대기하지 않은 자손도 부모 종료 시 취소한다. 별도 UI 관찰 id를 받지 않으며 입력·결과의 의미와 신뢰 코드 경계는 [Action 하위 호출 계약](04-action.md#재귀확장-실행의-경계)을 따른다. JS/TS 문맥의 함수명은 `invokeAction`으로 구체화했으며 다른 언어에서도 같은 수명·오류 의미를 유지한다.

## 상태·Query 핸들과 시계

State의 논리 주소는 `{scopeId, name}`이고 실제 셀 핸들은 생성 세대에 고정한다. scopeId는 core가 발급하며 local name에 `/` 등을 이어 붙여 정체성을 추측하지 않는다. 이름으로 다시 조회한 새 셀과 폐기된 옛 핸들은 다르다.

- Scope는 registerState(name, declaration), getState(name), removeState(name), dispose()를 제공한다. 중복 등록·미등록 조회/제거는 오류다. 셀 교체는 명시 replaceState(name, declaration)로 수행한다.
- StateHandle은 read(), snapshot(), write(value)를 제공한다. read/snapshot은 [값 준비 상태](10-value-contracts.md#값-준비-상태의-읽기)를 따르며 쓰기는 전체 값 교체다. reset()은 최초 확정 초기 snapshot을 복원한다. snapshot이 missing이면 missing으로 복원하며 undefined 쓰기로 구현하지 않는다.
- QueryHandle은 snapshot(), refresh(), retry()를 제공한다. 호출에 묶인 핸들의 쓰기·갱신·재시도는 호출 취소 후 거절하지만 원래 공유 대상이나 다른 호출의 핸들을 폐기하지 않는다.
- Store.subscribe(selector, listener)는 전체·한 주소·주소 배열을 받으며 구독 해제 함수를 반환한다. 정확한 관찰 payload와 URL/reaction 연결은 [Store 상세](09-preserved-contracts.md#store-주소관찰reaction의-현행-매핑)를 따른다.

시간 공급 인터페이스는 `Clock.now(): epoch milliseconds`와 `Clock.subscribe(listener): unsubscribe`로 둔다. now는 유한한 안전 정수이며 listener는 같은 종류의 시각을 받는다. 서비스가 이 공급자를 명시적인 State/Value 입력에 연결하고 변화 시 그 입력을 갱신한다. 구독은 만든 owner가 해제하며 초기값/reset을 매 tick마다 다시 실행하지 않는다. core가 숨은 현재 시각이나 기본 tick 주기를 CEL에 넣지 않는다. 업무 시간대는 [U14의 명시 Value 입력](10-value-contracts.md#명시-업무-시간대와-달력-연산)으로 별도 연결한다. Clock의 epoch milliseconds는 날짜 데이터의 공개 문자열 표현과 별개이며 명시 변환 없이 날짜 State에 저장하지 않는다. [U13, U14]

## 공통 오류와 진단

**확정(U13):** 공개 오류는 `{code, message, resource?, instanceId?, location?, input?, cause?}`다. code·message는 필수, resource는 `{kind,id}`, location은 해당 선언 문서의 JSON Pointer이며 변환 단계는 배열 인덱스로 식별한다. input은 문제 포트 이름이다. cause도 같은 정제된 오류 형태이며 원본 예외·stack·전체 입력·secret·Login 응답을 그대로 직렬화하지 않는다. value 자체를 메시지에 붙이지 않아도 경로·원인을 식별할 수 있어야 한다.

code는 INVALID_DEFINITION, REFERENCE_NOT_FOUND, TYPE_MISMATCH, TYPE_CONTRACT_MISMATCH, INVALID_EXPRESSION, INPUT_NOT_READY, VALUE_PENDING, EXECUTION_BLOCKED, QUERY_REFRESH_DISABLED, INVALID_RETRY_STATE, ACTION_RECURSION, ASSERTION_FAILED, HTTP_ERROR, TIMEOUT, CANCELLED, LIMIT_EXCEEDED, INTERNAL_ERROR를 기본으로 한다. 하위 실행 실패를 일반 성공값으로 치환하지 않고 cause와 location을 보존한다. 선택 모듈은 namespaced 코드를 명시 등록할 수 있으나 core 코드 의미를 덮어쓰지 않는다.

**오류 정제의 실패 격리(U23):** 외부 콜백이 던진 값은 안전한 오류 DTO라고 가정하지 않는다. code를 확인할 때 getter·상속된 속성·임의 문자열 변환을 실행하지 않고, 직접 저장된 알려진 문자열 코드만 사용한다. Proxy의 속성 검사 등 메타데이터 확인 자체가 실패하는 경우도 정제 경계 안에서 처리한다. HTTP 실행 경로의 알 수 없거나 안전하게 읽을 수 없는 예외는 값·원본 예외·stack을 포함하지 않는 고정 HTTP_ERROR로 반환한다. 이미 확정된 TIMEOUT/CANCELLED는 유지한다. 신뢰할 수 있는 내부 위치·원인의 정제된 진단을 제공하는 기존 계약은 유지하며, 외부 예외 객체를 그대로 복사·로그 출력하는 대체 경로를 두지 않는다.

**U22 문제의 수정·검증(U23):** [독립 HTTP 실험 P35–P38](../handoff/t2-http-boundary-2026-10-29.md)에서 직접 저장된 코드만 확인하고 속성 검사 실패도 고정 오류로 처리하도록 보완했다. getter·Proxy·형 변환·오염된 다른 필드·늦은 예외와 TIMEOUT/CANCELLED 경합을 검증했다. 수정 전 소스·결과는 별도 보존하며, 실제 core 전체 오류 처리의 완료를 뜻하지 않는다.

**U34 독립 State 실험:** 오류 정제 중 다시 발생하는 예외와 `null`·`false` 등의 reject 값도 실패로 처리한다. 알 수 없는 State/관찰 콜백 예외는 고정 INTERNAL_ERROR로 격리하며 다른 관찰자 통지를 막지 않는다. 폐기된 의존 셀의 결과를 현재 성공값으로 유지하지 않고 세대에 묶인 CANCELLED로 전파한다. [실행 범위와 회귀](../../experiments/t3-state/README.md)는 실제 core SDK 구현과 구별한다.

이 오류 표면과 값 snapshot은 서로 다른 계약이다. Action 관찰의 error와 Query 관찰의 error에는 같은 오류를 넣되 각 리소스의 status/data 의미는 유지한다. 네트워크·취소·동시 교체에서의 실제 적합성은 구현 후 검증해야 한다.
