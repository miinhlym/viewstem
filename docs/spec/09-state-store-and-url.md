# StateStore · reaction · URL 동기화

[명세 시작점](../VIEWSTEM-SPEC.md) · [공개 타입](../../packages/core/src/index.d.ts) · [초기 적용 완료](07-host-integration.md#최소-sdk와-적용-완료)

StateStore의 소유·구독·값 변경과 URL 연결은 이 문서에서 정의한다. 실행 가능한 최초 Query와 표시 완료는 호스트 연결 명세에서, 요청 입력의 컬렉션 변환은 [HTTP 전송 계약](01-datasource-auth.md#query-서비스-콜백의-컬렉션-변환)에서 다룬다. [이관과 이전 계약 기록](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/docs/spec/09-preserved-contracts.md#과거-승인-기능의-이관-체크리스트)을 참고할 수 있다.

## StateStore 주입의 확정 경계

서비스가 라이브러리 생성 StateStore를 소유하고 주입하는 것은 지원한다. 같은 메서드를 구현한 임의 외부 Store까지 호환된다는 뜻은 아니며 별도 확장 계약이 필요하다. 서비스용 공개 상태 등록과 View/Component 수명 소유 상태의 내부 등록을 구분한다. 값 변경 주체가 달라져도 등록 소유권은 바뀌지 않는다. 소비 renderer를 폐기해도 서비스 소유 State와 주입 Store 자체는 유지한다. [E51]

현재 상태 주소·공개/내부 SDK는 U13의 최소 SDK와 아래 관찰 매핑을 따른다. 같은 로컬 이름이 다른 Component에 있다는 이유로 과거 flat Store 충돌 규칙을 전역 적용하지 않는다.

## StateStore 관찰의 확정 의미

| 항목 | 확정 의미 |
|---|---|
| 구독 범위 | Store 전체, 단일 State, 여러 State 묶음. 객체 내부 필드·배열 원소 구독은 1차 제외 |
| values | 변경이 끝난 시점의 **구독 범위 전체 현재값**. 이번에 바뀌지 않은 구독 대상 값도 포함 |
| changes | 이번에 실제 변경된 구독 대상의 식별 정보와 kind 목록. 범위 밖 변경은 포함하지 않음 |
| kind | added=등록, updated=기존 값 변경, removed=제거, replaced=같은 논리적 이름의 새 정의·수명으로 교체 |
| 최초 통지 | 구독 직후 현재 values와 changes: []를 한 번 전달. 최초 관찰을 added로 만들지 않음 |
| 이후 통지 | 구독 범위의 실제 변경에만 통지. 한 원자 변경 묶음으로 여러 대상이 변해도 콜백 한 번, 중간 상태 통지 없음 |
| 제거와 null | 제거한 대상은 values에서 빠짐. 실제 null 저장은 해당 키와 null을 유지 |
| 수명 교체 | 값이 같아도 replaced를 통지. 이름 기준 구독은 제거·재생성 뒤에도 유지 |
| 해제 | 구독 해제를 제공하며 해제 뒤 새 변경 통지를 받지 않음 |

이벤트는 JSON 문자열이 아닌 런타임 객체다. State 값의 native Set/Map·원본 보호·안정 snapshot 정책을 따르며 Query 전송용 변환을 적용하지 않는다. 매번 전체 값을 깊은 복사한다는 보장은 아니다. [E45]

예를 들어 한 소유 범위에서 date와 selection을 묶어 관찰하고 한 원자 변경으로 둘을 바꾸면, values에는 두 변경 후 값이 있고 changes에는 두 대상의 updated가 들어가지만 콜백은 한 번이다. 그 뒤 date만 바꾸면 values에는 selection도 남고 changes에는 date만 있다. 같은 값의 새 date 셀로 교체하면 updated가 아닌 replaced다.

**새 이름 공간으로의 매핑:** 이름 기준 관찰의 대상은 해당 owner/scope 안의 논리적 State다. 폐기된 셀 핸들을 새 셀에 재사용한다는 뜻이 아니다. 주소·관찰·reaction의 현행 표기는 아래 U13을 따른다. 같은 로컬 이름의 서로 다른 Component State들을 하나로 합치지 않는다.

## Store 주소·관찰·reaction의 현행 매핑

**확정(U13):** 주소는 `{scopeId,name}`, 관찰 payload는 `{values, states, changes}`로 고정한다. values와 states는 `JSON.stringify([scopeId,name])`를 키로 하는 읽기 전용 레코드다. values는 해당 범위의 실제 읽기 값이며 missing/pending/error에는 JS undefined가 들어간다. states에는 같은 키별 상세 준비 snapshot을 넣어 이 셋을 구분한다. 관찰은 저장 입력이 아니므로 undefined 읽기 표식을 U03의 데이터 정규화로 지우지 않는다. 다른 언어·원격 어댑터에서는 states를 사용해 구분을 보존한다.

changes의 각 항목은 `{kind, target:{scopeId,name}, generation}`이다. kind는 기존 added/updated/removed/replaced이며 generation은 변경된 셀 수명을 식별한다. 초기 통지는 현재 values/states와 빈 changes다. 제거된 주소는 values/states에서 빠지고 changes에 removed로 남는다. 관찰자의 재진입 쓰기는 현재 통지 중인 snapshot을 바꾸지 않고 다음 원자 변경 묶음으로 처리한다. 대상 제거 뒤 같은 이름의 재등록은 동일 scope의 이름 구독으로 계속 관찰하지만 옛 셀 핸들이 되살아나지는 않는다.

Store 구독 콜백에서 시작한 `transaction()`은 동기로 실행되며, 그 안에서는 자신이 변경한 값·구조를 읽을 수 있다. 같은 알림을 받는 다른 구독자는 이전에 확정된 값을 읽는다. 콜백이 실패하면 후보와 예약된 변경을 함께 버린다. 성공한 변경은 앞서 큐에 들어간 작업 뒤에서 한 묶음으로 확정한다. 앞선 작업이 변경 대상의 세대를 무효화하면 그 묶음 전체를 버리고 Store 진단에 기록한다.

View/Component의 `spec.reactions`는 `{watch:[상태 @path, ...], target:상태 @path, value:고정 JSON 값}` 배열이다. watch는 비어 있지 않으며 읽기 가능한 State/Derived에 명시 연결한다. target은 같은 Store의 쓰기 가능한 State다. value는 대상 스키마로 등록 시 검증하고 표현식으로 실행하지 않는다. 현재 owner의 수명에 묶어 등록·해제하며, 해석된 실제 target 셀 기준으로 중복 reaction을 거절한다.

watch의 실제 값 변경으로만 작동하며 초기화·URL 복원은 reaction 실행을 만들지 않는다. 같은 원자 변경 묶음의 명시적 쓰기가 target에 있으면 그 값을 우선한다. reaction 연쇄와 Derived 의존을 함께 검증해 순환을 거절하고, 값 확정 뒤 Query 실행 판단으로 넘어간다. 일반적인 Action 오류 복구나 이벤트 버스로 이 구조를 확대하지 않는다.

동적 보간이 같은 변경 묶음에서 다른 State나 Derived를 선택하면, 새로 읽는 셀의 값을 그 묶음 안에서 확정한다. Reaction 판단과 구독 통지는 확정된 값을 사용한다. 값 계산 중 발견된 순환 읽기는 Derived 오류로 처리한다. View 적용은 후보의 Reaction 그래프를 함께 검증하며, 최종 그래프에 순환이 있으면 해당 적용을 취소한다.

명시적 State 쓰기를 포함한 View 적용 중 Reaction이 노드의 존재를 바꾸면, 처음 State 입력을 기준으로 후보에 남은 Reaction을 다시 계산한다. 값과 노드 구성이 일치하는 후보에서 초기값과 반복 키를 확정하고 공개한다. 서로 다른 후보를 반복해 확정할 수 없는 적용은 취소한다.

Reaction이 감시하는 값은 같은 View 후보의 바인딩으로 비교한다. 비교 기준에는 배치 전 State와 해당 후보가 수용한 초기화 결과를 포함한다. 명시적 쓰기와 Reaction의 직접 쓰기는 적용할 값에만 반영한다. 배치 전에 이미 쓴 셀의 비교 기준은 기존 저장값이다.

여러 View가 Store를 공유하면 이번 적용에 포함된 소유자의 Value 포트와 반복 항목을 비교 기준에 맞춰 해석한다. 다른 View는 자기 구성이 다시 계산될 때까지 비교 양쪽에서 확정된 Value 입력을 사용한다. 공유 State 핸들은 각 비교 측의 State를 읽으므로 다른 View의 감시값도 명시적 Store 쓰기에 반응할 수 있다.

기존 셀의 감시값은 입력이 잠시 대기했다가 같은 적용 안에서 준비되면 현재 후보의 바인딩으로 계산한다. 대기 또는 입력 오류가 유지되면 그 적용에서 후보 바인딩을 평가하지 않고 마지막으로 확정한 Derived 값을 사용한다. State 선언도 최종 소유자에 맞춰 한 번에 공개한다. 이후 독립적인 Store 쓰기는 유지된 State 연결을 따라 기존 계산과 서비스 소유 Reaction을 실행할 수 있다. 명시적 쓰기 뒤 처음 생긴 Derived 셀은 적용이 확정될 때 첫 값을 갖는다. 이 기준은 감시 대상의 셀 세대를 따른다.

비교 중 반복 항목을 읽을 때는 실제로 참조한 별칭의 키를 비교 기준에서 찾는다. 해당 키가 없으면 그 항목은 아직 읽을 수 없다. 최종 순환 검증은 현재 후보의 바인딩과 변경된 Reaction을 기준으로 시작하며, Value 포트와 반복 항목을 통해 실제로 읽는 State 및 Derived도 포함한다.

## URL 동기화의 확정 의미

### 연결 범위와 지원 값

URL 동기화는 opt-in이며 query parameter를 다룬다. URL path·hash와 다른 소유자의 parameter는 보존한다. 기본 prefix는 `p.`로 선택됐지만 최종 key 충돌은 오류다. 정확한 소유 key별로 관리하며 prefix 전체를 삭제하지 않는다. [E46]

한 Store에는 URL 연결을 하나만 둔다. 서비스가 Store를 소유·주입하면 서비스가 공용 연결을 관리하고, 내부 기본 Store의 renderer 편의 설정은 같은 연결 기능을 사용한다. 두 경로를 동시에 지정해 중복 연결하면 설정 오류다. 어댑터는 현재 query parameter 읽기, URL 변경 구독/해제, key 변경분의 push/replace 쓰기라는 세 기능을 제공한다. 과거 read/subscribe/write 등의 이름은 현행 함수 시그니처를 확정하지 않는다.

| URL 연결 값 | 1차 범위 |
|---|---|
| 단일 값 | string, number, boolean, date, time, datetime |
| 배열·Set | string 또는 number 원소의 배열·Set |
| 객체·Map·객체 Set 및 나머지 미지원 조합 | URL 연결 설정 오류. 일반 State 타입 지원을 금지하는 의미는 아님 |

JSON codec을 사용한다. 문자열 `"null"`·실제 null·빈 문자열·빈 배열·key 부재를 구별하며 선언 타입에 따라 배열/Set을 복원한다. 날짜 값은 U14의 정규 문자열, 스키마는 U13/U14의 프로필로 검증한다. 임의 객체나 중첩 컬렉션의 URL 지원을 이 표로 확대하지 않는다.

### 복원과 baseline

초기값 준비 → URL 복원 → 입력 안정화 → 최초 실행 가능한 Query 순서를 지킨다. URL을 적용하기 전 고정한 초기 snapshot이 baseline이다. **복원은 일반적으로 baseline에서 시작해 유효한 URL 값만 덮어쓴다.** 연결이 수집한 미반영 State 변경과 초기값 준비 중 명시적으로 쓴 값은 복원보다 우선한다. 직전 State 위에 URL 일부를 덮는 동작이 아니다. key가 없거나 값이 잘못됐으면 baseline을 사용하고 잘못된 값은 진단한다. baseline 자체가 missing이면 missing을 유지하며 임의 null·0·현재 날짜를 만들지 않는다. 초기 계산을 URL 변화마다 다시 실행하지 않는다. [E46]

복원 자체를 사용자 변경 reaction이나 새 push의 계기로 만들지 않는다. 같은 잘못된 URL은 직전 상태와 무관하게 같은 baseline 결과를 만든다.

URL은 전체 화면 상태의 snapshot이 아니라 초기 상태에 덮어쓸 값을 담는다. 같은 Store의 뒤로/앞으로 복원과 다른 시점·환경에서 공유 링크를 여는 것은 같은 보장이 아니다. 정확히 공유할 값은 URL에 명시해야 하며, 빠진 key는 새 실행의 baseline에 따라 다른 값이 될 수 있다. [E46]

### 쓰기·실패·정리

D150의 호스트 API는 Store와 View를 먼저 커밋한다. 이전 소유 키 정리와 새 URL 연결은 그 적용의 후처리로 실행된다. 새 Query는 URL 후처리와 입력 준비 순서를 지킨다. 후속 적용은 이전 키 정리가 끝난 뒤 평가한다. 적용 순서와 검증 기준은 [구현 계획](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/docs/designs/viewstem-host-api-implementation-2026-11-13.md#c-url-후처리와-첫-query)에서 확인한다.

- **D158:** 새 URL 연결은 커밋부터 키 예약, Store 관찰, 대기 변경과 취소를 소유한다. 이전 연결 유무와 관계없이 View 교체 중 커밋 알림이나 새 어댑터의 구독 등록에서 발생한 실제 State 변경을 모은다. 활성화 때 키별 최신 값을 한 번에 기록한다. reaction으로 바뀐 값도 포함하며 초기화·URL 복원·값이 같은 쓰기는 기록을 만들지 않는다. 시작 중 폐기하면 소유 키와 쓰기 자격을 즉시 해제하고, 어댑터가 뒤늦게 반환한 구독 해제 함수는 한 번 호출한다.
- 쓰기는 **최신 URL에 정확한 소유 key 변경분만** 적용한다. 오래된 전체 URL snapshot으로 다른 연결의 변경을 덮지 않는다.
- **값이 기본값 또는 baseline과 같다는 이유로 URL 값을 자동 생략하지 않는다.** 예를 들어 URL의 날짜를 현재 baseline 날짜로 변경해 기록할 때, 기본값과 같다는 이유만으로 그 날짜 key를 삭제하지 않는다. 이는 모든 초기 기본값을 최초 연결 때 반드시 URL에 기록하라는 요구가 아니다. key가 없는 링크의 baseline 복원과 URL 복원 자체의 재push 금지도 그대로 유지한다. [E46]
- 기본 기록 방식은 replace이며 상태별 push를 허용한다. 한 변경 묶음은 URL 한 번으로 반영하고, 실제 변경한 항목 중 push가 있으면 push한다. 같은 URL을 추가 기록하거나 URL 복원을 다시 push하지 않는다.
- URL 쓰기 실패는 유효한 State 변경을 되돌리지 않는다. State를 유지하고 URL 동기화 오류를 알린다. 설정/리소스 사전 검증 실패로 기존 화면을 유지하는 경우와 구별한다.
- **U33:** 유효한 새 View로 전체 교체할 때 이전 화면 소유 URL key 정리가 실패해도 새 화면 교체를 완료하고 URL 동기화 오류로 보고한다. 새 초기값을 유지하며 남아 있는 옛 URL을 복원해 덮지 않는다. URL 값은 남을 수 있으므로 정리 성공으로 표시하지 않으며, 이 오류를 Query 실패나 View 적용 전체 실패로 바꾸지 않는다. 이미 취소되거나 더 최신 소유자에게 대체된 교체 작업은 새 연결을 만들거나 그 소유자에게 옛 오류를 전달하지 않는다.
- 입력·출력 길이와 목록 크기에 유한한 제한을 둔다. 잘못되거나 초과한 입력을 진단하고, 출력 초과도 State 유지와 URL 동기화 오류로 처리한다. 조용한 잘라내기·유실은 허용하지 않는다. 숫자 한계·측정 단위는 아래 U13 제한 프로필을 따른다.
- URL 연결은 만든 쪽이 해제한다. **연결 해제 자체는 현재 URL을 지우지 않는다.** `view.replace()`에 의한 전체 교체의 이전 화면 소유 key 정리와 다르다. 교체 때는 이전 소유 key만 replace로 정리하고 서비스 소유 상태와 다른 key를 보존한다. 공유 Store의 소비 renderer 하나를 없앴다고 공용 URL 연결을 해제하지 않는다.

**늦은 쓰기의 실행 경계:** 라이브러리는 대기 작업의 취소·순서를 관리하고 서비스 어댑터는 **실제 URL을 반영하기 직전** 그 작업의 유효성을 확인해 오래된 쓰기를 차단한다. 예를 들어 A의 느린 쓰기가 대기하는 동안 B로 명시 교체됐다면, A의 쓰기가 나중에 B의 URL을 변경하면 안 된다. 취소 신호를 전달하거나 완료된 Promise의 결과만 무시하는 것으로 이 보장이 충족되지는 않는다. 이 경계를 보장하지 못하는 비동기 어댑터를 지원된다고 표시하지 않는다. 유효성은 아래 U13의 isCurrent를 사용하며 SPA 전환 조율 프로토콜을 새로 추가하는 의미는 아니다. [E46]

최초 성공 로드는 초기값에 URL을 복원한다. 같은 화면의 뒤로/앞으로 복원과 새 페이지·탭에서 공유 링크를 열 때의 복원을 지원한다. 호스트는 저수준 `connectUrl({ restore: false })`로 최초 자동 복원을 생략하거나 `connection.restore()`를 호출할 수 있다. SPA 라우터의 화면 전환 조율은 호스트가 담당한다.

선택한 키만 제거할 때는 선택 밖의 키에 대기 중인 State 쓰기를 다시 유효한 작업으로 전달한다. 지연된 최초 복원 자체가 실패하면 `UrlConnection.ready`는 `kind: 'connect'` 진단으로 거절한다. 명시적으로 준비를 닫으면 `ready`가 이행해도 `isReady()`는 false다. URL 단계와 키는 연결의 `UrlDiagnostic`으로 관찰한다.

### URL 어댑터와 제한 프로필

**확정(U13):** `store.connectUrl({adapter, bindings, limits})`로 연결한다. bindings는 `{target:StateHandle, key?, history?}` 배열이며 기본 key는 p. + 로컬 이름, history 기본값은 replace다. 같은 Store 또는 어댑터를 공유하는 활성 연결에서 최종 key가 중복되면 오류다. 선택적 `onError`는 연결 중 발생한 `UrlDiagnostic`을 받는다. 반환 핸들의 dispose는 연결만 해제하고 URL을 지우지 않는다.

adapter는 read()로 현재 URL, subscribe(listener)로 URL 변화 구독/해제, writeOwned(patch, {mode, isCurrent})로 정확한 소유 key 변경분의 쓰기를 제공한다. patch 값은 인코딩 전 JSON 문자열이며 null은 key 삭제다. 문자열 "null"과 삭제를 혼동하지 않는다. 어댑터가 최신 URL의 소유 key만 변경하고 percent encoding은 한 번만 적용한다.

구독 등록이 실패하면 어댑터가 자신이 등록한 리스너를 정리한다. 최초 baseline 복원에 필요한 읽기의 실패는 연결 실패로 처리한다. URL 쓰기 한도를 확인하기 위한 읽기의 실패는 쓰기 실패로 보고하며 연결은 유지한다.

writeOwned는 실제 URL 반영 직전에 isCurrent()를 검사하고 검사와 최종 변경 사이에 비동기 대기를 끼우지 않는다. 새 쓰기·URL 복원·교체·폐기는 이전 쓰기의 유효성을 폐기한다. 단순 Promise 완료 무시만 제공하는 어댑터는 부적합하다.

U18의 [URL 경합 독립 실험](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/docs/handoff/t2-url-races-2026-10-29.md)에서 이 경계를 Node 모형과 실제 Chromium History로 검증했다. 미반영 key 보존·최신 URL 병합·뒤로/앞으로 복원·한도·기록 방식의 대표 사례이며, 실제 StateStore/renderer·날짜 codec·다른 브라우저 통합 완료로 확대하지 않는다.

U32/U33의 [후속 경계 검증](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/docs/handoff/boundary-followup-2026-10-30.md)은 정규화된 baseline 보존, 교체 후보 사전 검증, 새 연결이 생긴 뒤 옛 정리 무효화, 교체 URL 실패 보고를 추가로 확인했다. 사전 검증 실패는 기존 연결을 보존하며 cleanup도 예약하지 않는다. 새 연결이 같은 Store 또는 관련 key를 차지하면 옛 정리의 유효성은 다시 살아나지 않는다.

기본 limits는 maxOwnedBytes:8192, maxValueBytes:4096, maxItems:1000, maxKeys:128이다. bytes는 percent-encoded key/value 및 그 구분자의 UTF-8 바이트 수이며, owned 한도는 이 연결이 소유한 query 부분만 합산한다. 호스트는 연결 시 유한한 양의 안전 정수로 조정할 수 있다. 읽기 전에 바이트 제한, JSON 파싱 후 목록 크기·타입을 검증한다. 같은 소유 key가 URL에 중복되면 잘못된 입력으로 진단하고 해당 상태의 baseline을 쓴다. 출력 초과는 State를 유지한 채 LIMIT_EXCEEDED이며 잘라내거나 일부 key만 쓰지 않는다. 날짜 codec은 [U14의 정규 문자열](10-value-contracts.md#날짜-값과-전송-형식)을 JSON 문자열로 기록하고, 복원 시 해당 날짜 스키마로 검증한다. date/time에 시간대를 덧붙이지 않고 datetime은 UTC 밀리초 문자열을 유지한다.
