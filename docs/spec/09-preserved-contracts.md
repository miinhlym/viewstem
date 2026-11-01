<a id="이전-승인-의미--새-계약으로의-이관"></a>

# StateStore 관찰 · reaction · URL과 보존 계약

기준일: 2026-10-28 · Viewstem v1 설계 계약

[명세 시작점](../VIEWSTEM-SPEC.md) · 이 문서는 최종 명세의 주제별 상세다. **확정**과 **구체화 필요/구현 제안/이전 승인 이관**을 구분해 읽는다. JSON은 계약 설명이며 실행 검증 완료를 뜻하지 않는다.

**상태: 현행 계약.** StateStore 주입·관찰·reaction·URL 동기화와 Query 콜백의 컬렉션 변환은 이 문서의 현재 기준이다. 파일명의 `preserved`와 앞부분의 이관 이력은 기능이 보류됐다는 뜻이 아니다. 실제 JS/TS 시그니처는 [공개 타입](../../packages/core/src/index.d.ts), 현재 잔여는 [후속 작업](../handoff/open-contracts.md#실제-남은-작업)을 따른다. 과거 API 이름은 현재 SDK를 강제하지 않으며 차트는 별도 모듈이다.

## 과거 승인 기능의 이관 체크리스트

이 절은 현행 계약을 보존한 이유와 대체 관계를 기록한다. 기능별 기준은 아래 현행 상세 또는 연결된 명세를 따른다. [원문 대응표](../handoff/source-contract-matrix.md)는 이관 추적 자료다.

새 리소스 체계로 바뀌었다고 다음 승인까지 자동 폐기하지 않는다. 보관 transcript 직접 대조와 방 기록의 회수 검증 요약을 [근거 색인](../history/evidence-index.md)에서 구별한다. 회수 요약은 원문 전문이 아니지만 확인된 승인 의미는 아래 공개 계약에 보존하여 로컬 대화가 없는 구현자도 읽을 수 있게 한다. 이름·주소·SDK 매핑과 실제 미결만 구체화한다.

1. **CEL 계산:** Variable 내부 계산 언어는 CEL, 필드명은 expression이다. 최신 리소스 공통 외피 결정에 따라 위치는 spec.expression이다. @path/@call 값 연결과 별개이며 실행기 선정은 당시 미확정이었으나 JS는 U16/U34의 [cel-js 고정 패치와 독립 검증](03-variable-type.md#cel-패치-전제)을 현재 기준으로 적용한다. Dart CEL은 별도다. 근거: 10/16 `Sentinel_2fdbbfff4bc88191afddfacbfbcd2b3d`, `Sentinel_178b7c6012f88191b60f96472025ac91`, `Sentinel_9a725e20c8e4819188b9c8013ec20301`, E27. 10/21의 “CEL 제안” 설명으로 되돌리면 안 된다.

2. **State/Derived·reactions:** State는 쓰기 가능, Derived는 의존 입력으로 계산되고 직접 쓰기 금지다(10/16 `Sentinel_db3793dea34c8191b67ee56da4839b69`). 10/23 states/initial/inputs 및 /states 읽기 합의는 유지하며 10/26 결정으로 State/Derived 내부 spec은 제거하고 variableRef로 명명한다. 독립·실제 인라인 리소스 spec은 유지한다. [E24, E27, E33, E39] reaction.value는 고정 JSON 상수로 해석하며 계산식으로 실행하지 않는다(`Sentinel_f97c2b5ea46481918b4022ea9e87d9af`). **기존 승인 실행 정책:** 초기에는 reaction을 발생시키지 않고 실제 변경 시에만 발생시킨다. 같은 배치의 명시적 선택값이 우선하며, 선택값을 확정한 뒤 Derived와 Query를 실행한다. **같은 Store의 같은 대상 셀에 둘 이상의 reaction 등록은 거절**한다. 등록한 Component가 달라도 명시 공유한 동일 셀에는 이 규칙이 적용되고, 별개 로컬 셀은 같은 이름이어도 다른 대상이다. [E26, E44] 이 정책은 미결이 아니다. 현행 매핑은 아래 U13의 spec.reactions를 따른다.

3. **URL 상태 동기화:** 선택적 URL 연결·JSON codec·고정 baseline 복원·소유한 key만 정리·다른 URL 값 보존 승인. 최초 성공 로드는 기본값 후 URL 복원, 같은 renderer의 setResource는 이전 화면 소유 상태/URL key를 정리하고 새 기본값, 서비스 소유 상태 유지. renderer 재사용 금지 아님. SPA 라우팅 조정 제외와 명시적 새 페이지 링크 상태 전달을 구별. 근거: 10/14 `Sentinel_82ecb1089af88191b5ddec32762418bf`, `Sentinel_17bc982519d88191a6f8008eae95cb87`, `Sentinel_c3f93ce9e94c81919d176599664b79e3`, `Sentinel_ea12186e4e648191be977a4158718b51`. 이름·소유 범위는 View/StateStore로 이관할 부분.

4. **Query 실행 정책:** executeWhen은 모든 실행 계기에 적용, autoRefreshWhen은 주기 갱신 조건. false→true 즉시 현재 입력으로 조회, true→false 신규/대기 차단, active 강제 취소 불필요하나 응답 유효성 확인. 근거: 10/14 `Sentinel_f1a287e391948191ab7350b2ec8401f8`, `Sentinel_e169eb15b0b881918294b112e63f7a71`, `Sentinel_407c2d9bfb508191b6978b87cbdecfd1`. 일반 자동·수동 갱신은 refresh:false인 사용 인스턴스를 제외하며 RefreshQuery도 이를 존중한다. 복구용 retry와 제외 시 단계 결과는 U13의 Query 상세에서 구체화했다. [E50] 1 active+1 latest pending, 같은 generation/snapshot의 유효 결과 결합이라는 기존 정책을 복합 Query 그래프에 이관해야 하며 모두 신규 미결로 재개하지 않는다. 동적 선택 항목별 Query fanout 제외도 당시 승인(`Sentinel_d96923d419488191a201caf2836439d6`); 에이전트 구조 변경과 같은 기능이라고 자동 취소하지 않는다. 이 항목은 자동 조회/갱신 사용 인스턴스 정책의 이력이다. 10/26 명시 Action Query 실행에 자동 재시도·구독·캐시 공유를 되살리는 근거로 사용하지 않는다. RefreshQuery는 현재 [Action 계약](../VIEWSTEM-SPEC.md#7-action-실행과-이벤트-연결)과 [Query 사용 인스턴스 계약](02-query.md)의 명시 갱신 계약으로 연결한다. 세부 시간 테스트와 오류 형식은 구현 시 구체화한다.

5. **타입·날짜·컬렉션:** [값·비교·snapshot·날짜 상세](10-value-contracts.md)를 따른다. 객체/배열은 내용 비교하되 배열 순서는 의미가 있고, Set은 native membership·삽입 순서 무시, Map은 **string/number 키**와 값의 타입별 재귀 비교·삽입 순서 무시다. 원본을 freeze하지 않는 격리·무변경 읽기 참조 안정·과거 snapshot 안정·객체 Set의 저장 참조 기준을 보존한다. 날짜의 정수 add 검증·합의된 datetime 패턴·YY 00–68/69–99 경계는 유지하고, 후속 U14가 날짜 공개 문자열·직렬화·업무 시간대를 확정한다. [E58–E60] **Query 서비스 콜백 직전의 Set→배열·Map→쌍 배열 재귀 변환은 별도 확정 경계**이며 [아래 상세](#query-서비스-콜백의-컬렉션-변환)를 따른다. [E47]

6. **차트·그리드:** [선택 차트 계약과 별도 인수 목록](11-optional-charts.md)에 LineChart/TimeSeries 구분·엔진 범위와 선택/자동 전환 제외·입력 순서/중복 X·동적 series 안정 ID·option.series/series.data 금지·세 차트 Y 검증을 보존한다. [E62–E63, E65–E66] core 자동 등록 의무가 아니다. Grid는 [현재 배치 계약](05-component-view.md)을 따르며 옛 fitToHeight로 자동 내용 높이를 되살리거나 옛 내부 key로 현재 인스턴스 ID를 없애지 않는다.

**해석 원칙:** 기능 요구 보존 / 이름·위치 이관 / 명시적 최신 변경으로 대체 / 충돌만 검토를 분리한다. 날짜·타입·URL·Query 규칙이 이미 결정됐는데 새 문서에서 통째로 ‘추후 결정’으로 나열하면 이번 정리 목적을 다시 어기게 된다.

### 함께 보존할 실행·API 이력

- Query 갱신 정책은 사용 위치에서 선언하고 View 기본값을 상속한다. 숨은 기본 주기는 만들지 않는다. 완료 후 주기 지연, 실패 시 즉시 무한 재시도하지 않는 기존 방향을 유지한다. U30의 [완료 기준 실행 상세](02-query.md#완료-기준-주기-실행)와 [실제 검증 범위](../handoff/t2-composite-polling-2026-10-30.md)를 함께 읽는다. 자동 조회의 결합은 현재 입력에 유효한 결과만 사용하며, 입력이 바뀌지 않은 결과는 재사용한다. 입력이 바뀐 결과를 기다리는 동안 기존 조합을 이전 결과임을 구별할 수 있는 갱신 중 상태로 유지한다. 관련 결합만 기다리며 무관한 화면을 막지 않는다. [상세와 실패 후 정책의 근거 한계](02-query.md#자동-조회-결합의-입력-변경-대기)를 구별한다. [E69]

- 예전 create/setResource/refresh/destroy와 resolveResource/executeQuery의 이름·반환 시그니처는 새 SDK를 확정하지 않는다. 다만 **전부 inline/static인 화면은 서비스의 리소스 조회·Query 실행 콜백 없이 동작**하고, 실제 필요한 연결이 빠진 구성은 명확한 오류로 처리한다. 옛 setResource가 리소스 객체만 받는 진입점이었다는 승인 이력은 유지하며 새 SDK에 ID 진입점을 추가할지/함수명을 무엇으로 할지는 이 기록으로 고정하지 않는다. [E68]

- 초기 기록의 ‘renderer 재사용 금지’는 이후 같은 renderer에서 setResource를 사용하는 결정으로 대체됐다. 반대로 예전 ‘배치 ID 없음’은 최신 명시적 인스턴스 식별 결정으로 대체됐다. 오래된 기록이라고 일괄 유지하거나 일괄 폐기하지 않는다.

## 초기 적용 완료의 확정 관찰 의미

방 기록의 직접 승인 E61을 회수하여 이전의 ‘최초 승인 확인 필요’ 상태를 해소했다. 최신 View/Component 이름과 SDK에 이관할 의미는 다음과 같다.

| 관찰 경계 | 확정 의미 |
|---|---|
| 점진 표시 | 준비된 화면 부분은 다른 부분의 조회 완료를 기다리지 않고 표시한다 |
| 초기 완료 | 초기 구성과 **실행 가능한** 최초 Query·화면 반영이 성공 또는 개별 오류로 정리되면 최초 처리 사이클은 완료된다 |
| 개별 조회 실패 | 해당 부분에 조회 오류를 제공하고 초기 작업은 종료된 것으로 본다. 화면 적용 전체를 자동 실패·롤백하지 않음 |
| 외부 입력 대기 | 오류/빈 성공 데이터로 가장하지 않는다. 입력을 기다리는 Query 때문에 초기 완료를 계속 붙잡지 않으며 입력이 준비되면 이후 실행한다 |
| 적용 자체 실패 | 리소스 구조·상태 타입 충돌 등 적용 자체가 불가능하면 실패시키고 기존 화면·Store를 보존한다 |

현재 실행 조건으로 실행할 수 없는 Query를 초기 완료 때 무한 대기하지 않는 의미와, 이미 시작한 Action의 RefreshQuery가 실행 조건 때문에 불가하면 이유를 알리고 중단하는 의미는 서로 다른 호출 경계다. [E55, E61] 완료 핸들·Promise의 의미는 [호스트 계약](07-host-integration.md#최소-sdk와-적용-완료), 실제 JS/TS 시그니처는 [공개 타입](../../packages/core/src/index.d.ts)을 따른다. 새 SDK 이름을 승인했다는 뜻이 아니다.

같은 renderer의 명시 교체 때 이전 화면 소유 상태·요청·구독·자동 갱신을 정리하고 새 소유 상태를 만들며 서비스 소유 상태는 유지한다. 코어 인스턴스 폐기와 일시 렌더 분리는 구별한다. 새 인스턴스 모델의 취소·세대 SDK를 이 옛 API 이름으로 강제하지 않는다. [E46, 회수 R05]

여러 명시 Query 정의와 배열 inputs는 허용된다. v1 제외인 동적 fanout은 목록으로 Query 사용들을 자동 생성하는 기능이며, 최신 repeat Component의 명시 구성이나 에이전트의 명시 변경을 포괄 금지하지 않는다. [E64]

## StateStore 주입의 확정 경계

서비스가 라이브러리 생성 StateStore를 소유하고 주입하는 것은 지원한다. 같은 메서드를 구현한 임의 외부 Store까지 호환된다는 뜻은 아니며 별도 확장 계약이 필요하다. 서비스용 공개 상태 등록과 View/Component 수명 소유 상태의 내부 등록을 구분한다. 값 변경 주체가 달라져도 등록 소유권은 바뀌지 않는다. 소비 renderer를 폐기해도 서비스 소유 State와 주입 Store 자체는 유지한다. [E51]

현재 상태 주소·공개/내부 SDK는 U13의 최소 SDK와 아래 관찰 매핑을 따른다. 과거 createChannelStore 등의 함수명이나 WeakMap 같은 구현 방법을 현재 계약으로 강제하지 않는다. 같은 로컬 이름이 다른 Component에 있다는 이유로 과거 flat Store 충돌 규칙을 전역 적용하지 않는다.

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

View/Component의 `spec.reactions`는 `{watch:[상태 @path, ...], target:상태 @path, value:고정 JSON 값}` 배열이다. watch는 비어 있지 않으며 읽기 가능한 State/Derived에 명시 연결한다. target은 같은 Store의 쓰기 가능한 State다. value는 대상 스키마로 등록 시 검증하고 표현식으로 실행하지 않는다. 현재 owner의 수명에 묶어 등록·해제하며, 해석된 실제 target 셀 기준으로 중복 reaction을 거절한다.

watch의 실제 값 변경으로만 작동하며 초기화·URL 복원은 reaction 실행을 만들지 않는다. 같은 원자 변경 묶음의 명시적 쓰기가 target에 있으면 그 값을 우선한다. reaction 연쇄와 Derived 의존을 함께 검증해 순환을 거절하고, 값 확정 뒤 Query 실행 판단으로 넘어간다. 일반적인 Action 오류 복구나 이벤트 버스로 이 구조를 확대하지 않는다.

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

초기값 준비 → URL 복원 → 입력 안정화 → 최초 실행 가능한 Query 순서를 지킨다. URL을 적용하기 전 고정한 초기 snapshot이 baseline이다. **매 URL 복원은 이 baseline에서 시작해 유효한 URL 값만 덮어쓴다.** 직전 State 위에 URL 일부를 덮는 동작이 아니다. key가 없거나 값이 잘못됐으면 baseline을 사용하고 잘못된 값은 진단한다. baseline 자체가 missing이면 missing을 유지하며 임의 null·0·현재 날짜를 만들지 않는다. 초기 계산을 URL 변화마다 다시 실행하지 않는다. [E46]

복원 자체를 사용자 변경 reaction이나 새 push의 계기로 만들지 않는다. 같은 잘못된 URL은 직전 상태와 무관하게 같은 baseline 결과를 만든다.

URL은 전체 화면 상태의 snapshot이 아니라 초기 상태에 덮어쓸 값을 담는다. 같은 Store의 뒤로/앞으로 복원과 다른 시점·환경에서 공유 링크를 여는 것은 같은 보장이 아니다. 정확히 공유할 값은 URL에 명시해야 하며, 빠진 key는 새 실행의 baseline에 따라 다른 값이 될 수 있다. [E46]

### 쓰기·실패·정리

- 쓰기는 **최신 URL에 정확한 소유 key 변경분만** 적용한다. 오래된 전체 URL snapshot으로 다른 연결의 변경을 덮지 않는다.
- **값이 기본값 또는 baseline과 같다는 이유로 URL 값을 자동 생략하지 않는다.** 예를 들어 URL의 날짜를 현재 baseline 날짜로 변경해 기록할 때, 기본값과 같다는 이유만으로 그 날짜 key를 삭제하지 않는다. 이는 모든 초기 기본값을 최초 연결 때 반드시 URL에 기록하라는 요구가 아니다. key가 없는 링크의 baseline 복원과 URL 복원 자체의 재push 금지도 그대로 유지한다. [E46]
- 기본 기록 방식은 replace이며 상태별 push를 허용한다. 한 변경 묶음은 URL 한 번으로 반영하고, 실제 변경한 항목 중 push가 있으면 push한다. 같은 URL을 추가 기록하거나 URL 복원을 다시 push하지 않는다.
- URL 쓰기 실패는 유효한 State 변경을 되돌리지 않는다. State를 유지하고 URL 동기화 오류를 알린다. 설정/리소스 사전 검증 실패로 기존 화면을 유지하는 경우와 구별한다.
- **U33:** 유효한 새 View로 전체 교체할 때 이전 화면 소유 URL key 정리가 실패해도 새 화면 교체를 완료하고 URL 동기화 오류로 보고한다. 새 초기값을 유지하며 남아 있는 옛 URL을 복원해 덮지 않는다. URL 값은 남을 수 있으므로 정리 성공으로 표시하지 않으며, 이 오류를 Query 실패나 View 적용 전체 실패로 바꾸지 않는다. 이미 취소되거나 더 최신 소유자에게 대체된 교체 작업은 새 연결을 만들거나 그 소유자에게 옛 오류를 전달하지 않는다.
- 입력·출력 길이와 목록 크기에 유한한 제한을 둔다. 잘못되거나 초과한 입력을 진단하고, 출력 초과도 State 유지와 URL 동기화 오류로 처리한다. 조용한 잘라내기·유실은 허용하지 않는다. 숫자 한계·측정 단위는 아래 U13 제한 프로필을 따른다.
- URL 연결은 만든 쪽이 해제한다. **연결 해제 자체는 현재 URL을 지우지 않는다.** 명시적 setResource 교체의 이전 화면 소유 key 정리와 다르다. 교체 때는 이전 소유 key만 replace로 정리하고 서비스 소유 상태와 다른 key를 보존한다. 공유 Store의 소비 renderer 하나를 없앴다고 공용 URL 연결을 해제하지 않는다.

**늦은 쓰기의 실행 경계:** 라이브러리는 대기 작업의 취소·순서를 관리하고 서비스 어댑터는 **실제 URL을 반영하기 직전** 그 작업의 유효성을 확인해 오래된 쓰기를 차단한다. 예를 들어 A의 느린 쓰기가 대기하는 동안 B로 명시 교체됐다면, A의 쓰기가 나중에 B의 URL을 변경하면 안 된다. 취소 신호를 전달하거나 완료된 Promise의 결과만 무시하는 것으로 이 보장이 충족되지는 않는다. 이 경계를 보장하지 못하는 비동기 어댑터를 지원된다고 표시하지 않는다. 유효성은 아래 U13의 isCurrent를 사용하며 SPA 전환 조율 프로토콜을 새로 추가하는 의미는 아니다. [E46]

최초 성공 로드는 기본값 뒤 URL을 복원하고, 같은 renderer의 명시 전체 교체는 이전 화면 소유 상태를 정리하고 URL key 정리를 시도한 뒤 새 초기값으로 시작한다. URL 정리 실패는 위 U33을 따른다. 같은 화면의 뒤로/앞으로 복원과 새 페이지·탭의 공유 링크 복원은 지원 의미에 포함된다. 살아 있는 renderer의 다른 화면 목적 URL과 리소스를 함께 조율하는 SPA 전환·reset/restore 옵션은 현재 범위에 복원하지 않는다. URL 연결·어댑터는 아래 U13, 오류 DTO는 공통 오류 계약을 따른다. [E46]

### URL 어댑터와 제한 프로필

**확정(U13):** `store.connectUrl({adapter, bindings, limits})`로 연결한다. bindings는 `{target:StateHandle, key?, history?}` 배열이며 기본 key는 p. + 로컬 이름, history 기본값은 replace다. 서로 다른 scope라도 최종 key 중복은 오류다. 반환 핸들의 dispose는 연결만 해제하고 URL을 지우지 않는다.

adapter는 read()로 현재 URL, subscribe(listener)로 URL 변화 구독/해제, writeOwned(patch, {mode, isCurrent})로 정확한 소유 key 변경분의 쓰기를 제공한다. patch 값은 인코딩 전 JSON 문자열이며 null은 key 삭제다. 문자열 "null"과 삭제를 혼동하지 않는다. 어댑터가 최신 URL의 소유 key만 변경하고 percent encoding은 한 번만 적용한다.

writeOwned는 실제 URL 반영 직전에 isCurrent()를 검사하고 검사와 최종 변경 사이에 비동기 대기를 끼우지 않는다. 새 쓰기·URL 복원·교체·폐기는 이전 쓰기의 유효성을 폐기한다. 단순 Promise 완료 무시만 제공하는 어댑터는 부적합하다.

U18의 [URL 경합 독립 실험](../handoff/t2-url-races-2026-10-29.md)에서 이 경계를 Node 모형과 실제 Chromium History로 검증했다. 미반영 key 보존·최신 URL 병합·뒤로/앞으로 복원·한도·기록 방식의 대표 사례이며, 실제 StateStore/renderer·날짜 codec·다른 브라우저 통합 완료로 확대하지 않는다.

U32/U33의 [후속 경계 검증](../handoff/boundary-followup-2026-10-30.md)은 정규화된 baseline 보존, 교체 후보 사전 검증, 새 연결이 생긴 뒤 옛 정리 무효화, 교체 URL 실패 보고를 추가로 확인했다. 사전 검증 실패는 기존 연결을 보존하며 cleanup도 예약하지 않는다. 새 연결이 같은 Store 또는 관련 key를 차지하면 옛 정리의 유효성은 다시 살아나지 않는다.

기본 limits는 maxOwnedBytes:8192, maxValueBytes:4096, maxItems:1000, maxKeys:128이다. bytes는 percent-encoded key/value 및 그 구분자의 UTF-8 바이트 수이며, owned 한도는 이 연결이 소유한 query 부분만 합산한다. 호스트는 연결 시 유한한 양의 안전 정수로 조정할 수 있다. 읽기 전에 바이트 제한, JSON 파싱 후 목록 크기·타입을 검증한다. 같은 소유 key가 URL에 중복되면 잘못된 입력으로 진단하고 해당 상태의 baseline을 쓴다. 출력 초과는 State를 유지한 채 LIMIT_EXCEEDED이며 잘라내거나 일부 key만 쓰지 않는다. 날짜 codec은 [U14의 정규 문자열](10-value-contracts.md#날짜-값과-전송-형식)을 JSON 문자열로 기록하고, 복원 시 해당 날짜 스키마로 검증한다. date/time에 시간대를 덧붙이지 않고 datetime은 UTC 밀리초 문자열을 유지한다.

## Query 서비스 콜백의 컬렉션 변환

**확정 경계:** Query 서비스 콜백을 호출하기 전에 라이브러리가 inputs를 JSON 전송 가능한 값으로 재귀 변환한다. 서비스가 같은 변환을 다시 구현할 책임을 지지 않으며 원본 State의 native Set/Map은 보존한다. [E47]

| 런타임 입력 | 콜백에 전달하는 전송용 값 |
|---|---|
| new Set(["a", "b"]) | ["a", "b"] |
| new Map([["a", 1], ["b", 2]]) | [["a", 1], ["b", 2]] |
| 객체·배열 안의 중첩 Set/Map | 같은 규칙으로 재귀 변환한 복사 값 |

변환된 inputs에서 Map을 임의 객체로 바꾸지 않는다. 이후 API별 요청 body/params 형태로 가공하는 것은 별도다. 이 승인은 StateStore 관찰값·정의/State export·CEL 값 표현·Dart 내부 표현이나 **새 서버 DTO 전체**의 직렬화를 확정하지 않는다. 현재 콜백 경계는 U13의 HttpExecutionPlan.inputs로 연결하며, 과거 저장 원본 target 프로토콜을 되살리지 않는다.
