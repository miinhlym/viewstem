# 결정 등록부

기준: 2026-10-28 [통합 명세 원본](https://chatgpt.com/space/page_7842bb8bff0c8191be6cd5831e7e375f), 2026-10-29 기존 승인 누락 복원 및 사용자 개선 요청에 따른 명확화. [E번호·U01과 실제 메시지 ID](evidence-index.md)를 함께 읽는다. 아래 ‘이유’는 근거와 최신 명세에 기초한 설계 목적의 요약이며 새 사용자 발언을 재구성한 것이 아니다.

**확정 / 대체 / 보류 / 구체화 필요 / 이전 확정·이관 필요**를 구분한다. 짧은 수락을 직전 제안보다 넓게 해석하지 않는다. 원문 전체 대화의 축어록이 아니라 결정 추적 문서다.

## A. 현재 채택한 결정

| ID | 의제·결정 | 이유·경계 | 근거 |
|---|---|---|---|
| D01 | 서비스 선언 화면과 에이전트 변경은 같은 엔진 | 별도 상태/조회 모델의 중복 방지; 에이전트 없이 실행 | E03, E05, E20 |
| D02 | 언어 독립 계약 / JS core / 렌더러 분리 | DOM 종속 방지; Dart는 후속 별도 구현 | E04, E41 |
| D03 | 개인 core는 도메인 중립, 회사 확장은 별도 | 회사→core 단방향 의존, 업무 로직 유출 방지 | E41 |
| D04 | Datasource·Query·Variable·Action·Component·View·Type 7종 | 데이터·계산·동작·화면·타입의 재사용 경계 | E06–E10 |
| D05 | 독립 리소스 kind/id/name?/spec, 내부 평탄화 | 실제 리소스 경계만 spec; 표시 name은 참조키 아님 | E25→E27, E33 |
| D06 | 독립 참조 xxxRef 문자열 ID | 일반 type과 구분, 대상 종류 검증 가능 | E12, E39 |
| D07 | Value/State/Query ports → 사용처 inputs → /ports/name | 값과 쓰기 셀 및 Query 인스턴스 정체성을 구분 | E32, E34 |
| D08 | Query/Variable Value만; Action/Component/View 세 kind; 나머지 ports 없음 | 계산 입력과 변경 가능한 대상의 명시적 전달 | E34 |
| D09 | State/Derived, 소유자별 수명, 명시 공유 | 같은 정의의 두 사용은 기본 독립; Derived 쓰기 금지; 같은 Store·같은 대상 reaction 중복 거절 | E07, E11, E24→E33, E44 |
| D10 | 인스턴스 이름 공간은 View/재사용 Component | 시각 컨테이너 이동과 수명 구분; repeat는 안정 key | E14, E41 |
| D11 | Query sources 맵 + transform 단일 구조 | 단일/복합 소비 계약 동일; 내부 source 우회 주입 금지; Concat.with 순서 보존 | E06, E29, E49, 통합 명세 §10.2 |
| D12 | CRUD Query 허용, Action에서 명시 실행 | 메서드가 부작용/보안의 판별 기준은 아님 | E29 |
| D13 | 현재 리소스 기반 요청, 직접 실행/필요시 서버 중계 | 미저장·동적 리소스도 실행; secret 사용권한과 목적지 검증 | E23 |
| D14 | secrets 별칭 + @path, Login만 auth kind | 기존 API Key/Bearer 기능을 일반 header/params로 표현 | E28 |
| D15 | CEL/spec.expression과 @path/@call 유지 | 계산 언어와 동적 연결 문법은 별개 | E21, E22, E31 |
| D16 | JSON Schema 또는 typeRef, 포트 required 분리 | 입력 존재와 객체 필수 속성을 혼동하지 않음 | E38→E39, E41 |
| D17 | 순차 Action·실패 중단·입력 스냅샷 | 실행 중 입력 변화와 후속 단계의 의미 안정화 | E16 |
| D18 | Query/Action/Variable/SetState/RefreshQuery/If/Assert | If.condition·필수 then/선택 else, Assert.condition·message 오류; 일반 RefreshQuery는 refresh:false 존중; 외부 효과 롤백 없음 | E29–E31, E41, E48, E50 |
| D19 | output.schema 또는 typeRef + 선언형 value | 코드 함수 반환과 선언형 평가가 같은 검증 실제값을 제공 | E42 |
| D20 | output 없음=void, false는 성공값, null은 명시 타입 | truthiness·UI 빈값·단계 결과 부재 혼동 방지 | E42, 통합 명세 §7.1 |
| D21 | 코드 Component/Action 등록 | UI/알림/이동 등의 호스트 기능을 리소스 호출에 연결 | E41, E42 |
| D22 | 실제 호출 연결 제거 또는 소유자 폐기 시 후속/하위 Action·늦은 결과 폐기 | View가 살아 있어도 연결 제거면 적용; native 협력 취소·호출 핸들 차단; 공유 대상 자체 파괴 아님 | E43, E42 |
| D23 | View/Component 단일 render 루트 + 트리 | 화면 진입점/재사용 단위와 레이아웃 책임 분리 | E41 |
| D24 | slots만 사용, 슬롯별 순서 있는 배열/전체 슬롯 전달 | 다중 영역과 forwarding의 한 문법; 작성자 scope 보존 | E41 |
| D25 | slots의 복수 노드는 수신 컴포넌트 DOM/CSS로 배치 | 암묵 Column 또는 일률 max1 강제 없음 | E41, 통합 명세 §10.6 |
| D26 | events 공개 계약, on은 Action 호출 또는 Component emit | payload 명시 연결; 전역 버스나 자동 bubbling 아님 | E41 |
| D27 | when false는 부재/폐기, repeat stablekey | 숨김과 수명 분리; reorder 시 코어 상태 보존 | E41 |
| D28 | Grid.inputs.layout에 직접 노드/템플릿 ID | 공통 node.layout/필수 GridItem 없이 배치 분리 | E41 |
| D29 | 상태·현재 구성·공용 정의 변경과 저장 분리 | 현재 화면 수정이 공용 원본 자동 수정 아님 | E17, E19 |
| D30 | 코어 소유 State+구성 일괄 검증·원자 적용 | 일부 적용 금지; 외부 DB/API 트랜잭션은 아님 | E18 |
| D31 | 저장된 공용 정의 자동 추종 없음 | 명시 주입/업데이트만 실행 화면에 반영 | E19 |
| D32 | 브랜드 Viewstem | 10/27 최종 명칭 수락; scope 확보와 별개 | E41 |
| D33 | StateStore 전체·단일·묶음 관찰, values/changes | 초기 통지·원자 변경당 1회·범위 제한·removed/null·같은 값의 replaced·해제 | E45 |
| D34 | 라이브러리 생성 Store의 서비스 소유·주입 | 임의 외부 Store는 별도 확장; 공개/내부 등록 분리; 쓰기가 소유권을 바꾸지 않음 | E51 |
| D35 | opt-in URL·고정 baseline·소유 key·실패 분리 | 승인 타입/JSON codec·정확한 key·유한 제한; 쓰기 실패에도 State 유지; 기본값과 같다는 이유의 자동 생략 금지; 모든 초기값의 URL 기록 의무는 아님; 연결 해제와 교체 정리 구별 | E46 |
| D36 | Query 서비스 콜백 직전 컬렉션 변환 | 라이브러리가 재귀 Set→배열·Map→쌍 배열 변환; 원본 유지; 모든 export/DTO 직렬화 확정 아님 | E47 |
| D37 | 등록 집합의 독립 정의는 (kind, id)로 식별 | 이번 개선 요청에 따른 명확화. 같은 종류 중복 거절·다른 종류 같은 ID 허용; 코드형/선언형 Component 및 Action은 각 종류 안에서 통합; xxxRef는 기대 종류만 조회 | U01 |
| D38 | Query 실패 범위·위치 정보 | 기존 승인 복원. 필요한 source/단계 실패는 전체 실패·부분 성공값 금지·정상 빈 결과 성공·실패 source/단계 식별; DTO 상세는 미결 | E52 |
| D39 | 시간 의존 계산과 Variable 결과 재사용 | CEL 도입이 현재 시각 공급·시간 변화 재평가·명시 inputs 재사용을 없애지 않음; clock API·빈도는 구체화 | E53 |
| D40 | literal/escape 기본 의미 | 일반 path/call은 데이터, 동적 영역의 실제 @ 키는 @@ escape; A2UI 전체와 재귀/허용 위치 상세는 별개 | E54 |
| D41 | RefreshQuery 불가 종료·fresh 완료 | 실행 조건 불가면 이유를 알리고 Action 중단; active 뒤 실제 새 요청 완료 대기; refresh:false 제외 결과는 별개 | E55 |
| D42 | 호출 관찰 ID·입력 진단 | 선택 ID·owner 내 중복 오류·다른 인스턴스 동명 허용·ID 없이 연결별 재호출 제한; 입력 실패 원인/문제 입력 식별 | E56, E57 |
| D43 | 타입별 동등성·격리·snapshot | 객체/배열 내용·배열 순서, Set native membership, Map string/number 키·재귀 값 비교; 원본 비동결 격리·안정 읽기/과거 snapshot | E58, E59 |
| D44 | 날짜 계산·YY 경계·형식 | 정수 add 입력·YY00–68/69–99와 승인 패턴 보존; 모든 내부/전송 codec의 단일 형식을 강제하지 않음 | E60 |
| D45 | 초기 적용 완료·서비스 연결 선택성 | 준비된 UI 점진 표시·실행 가능한 최초 처리 정리 후 완료·외부 입력 대기 비차단·적용 구조/타입 실패 보존; 정적 실행 콜백 불필요 | E61, E68 |
| D46 | 선택 차트의 범위·데이터 소유·검증 | 엔진 선택/전환 제외, 입력 순서/중복X, 안정 series ID·option.series/series.data 금지, 세 차트 number/명시null | E62, E63, E65, E66 |
| D47 | 동적 fanout 제외 한정·State 비롤백 | 여러 명시 Query/배열 inputs 허용; 목록 기반 자동 생성만 제외. 후속 실패가 완료한 SetState를 되돌리지 않음 | E64, E67 |
| D48 | 자동 결합의 입력 변경 대기 | 입력 불변의 유효 결과 재사용, 변경된 입력 결과 준비 후 결합, 기존 조합을 이전 결과임을 구별한 갱신 중 상태로 유지. 실패 후 보존 정책의 승인은 별도 확인 | E69 |
| D49 | State 값 전체에 명시적으로 undefined를 저장하는 쓰기 거절 | 초기값 미지정과 구별; 기존 값 유지·삭제로 해석하지 않음. null은 타입 허용 시 실제 값이며 코드 Action의 void는 별개. 객체 속성은 D50, 배열 원소는 D51, Set 원소는 D52, Map 값은 D53, 초기값 없는 State 읽기는 D54 | U02 |
| D50 | 객체 속성의 undefined 입력 허용·필드 생략 정규화 | 정규화 후 필수 속성 검증; null·빈 객체·원본 보존, 저장값 비교는 정규화 기준. 키 존재를 열 정보로 쓰는 호스트는 정규화 전 별도 보존 필요. 배열 원소는 D51, Set 원소는 D52, Map 값은 D53. [값 상세](../spec/10-value-contracts.md#객체-속성의-undefined-정규화) | U03 |
| D51 | 배열 원소의 undefined와 빈 슬롯 거절 | 자동 원소 제거·null 치환 금지; 명시 null은 원소 타입이 허용할 때 보존. 배열 안 객체의 속성 정규화는 D50 유지. [값 상세](../spec/10-value-contracts.md#배열-원소의-undefined와-빈-슬롯) | U04 |
| D52 | Set 원소 자체의 undefined 거절 | 자동 원소 제거·null 치환 금지; 실패 시 기존 State·원본 Set 유지. 객체 원소 속성의 정규화와 native membership은 유지. [값 상세](../spec/10-value-contracts.md#set-원소의-undefined) | U05 |
| D53 | Map 값 자체의 undefined 거절 | 자동 엔트리 제거·null 치환 금지; 실패 시 기존 State·원본 Map 유지. 객체 값의 속성 정규화 후에도 엔트리 보존, key는 기존 string/number 제한 유지. [값 상세](../spec/10-value-contracts.md#map-값의-undefined) | U06 |
| D54 | 초기값 없는 State는 missing, JS 읽기는 undefined | 등록된 미지정 State·명시 null·미등록 State를 구분; 미등록 이름은 참조 오류. 읽은 undefined의 명시 쓰기는 D49에 따라 거절. SDK 이름·Dart/전송 표현은 별도. [값 상세](../spec/10-value-contracts.md#초기값-없는-state-읽기) | U07 |
| D55 | core 데이터의 숫자는 유한한 수만 허용 | NaN·Infinity·-Infinity 거절; 중첩 값·Map 숫자 key·수용할 계산 결과에도 적용. 자동 치환·제거 금지, State 쓰기 실패 시 기존 값·원본 유지. integer 범위는 D56, number 표현은 D57. [값 상세](../spec/10-value-contracts.md#유한-숫자만-허용) | U08 |
| D56 | integer는 JS 안전 정수 범위만 허용 | 양 끝을 포함한 -(2^53-1)부터 2^53-1까지의 유한한 정수. 범위 밖·소수·문자열 입력은 오류; 자동 반올림·문자열 변환 없음. 큰 정수 식별자는 처음부터 string으로 선언. [값 상세](../spec/10-value-contracts.md#integer의-안전-정수-범위) | U09 |
| D57 | number는 binary64, 추가 자동 반올림 없음 | JS Number와 같은 표현에 유한성 검증 적용. 입력·중첩 숫자·Map 숫자 key·수용할 계산 결과를 임의 자릿수로 보정하지 않음. 이진 근사 자체는 존재하며 반올림·표시는 호출자가 명시. -0 정규화는 D58. [값 상세](../spec/10-value-contracts.md#number의-표현과-자동-반올림-금지) | U10 |
| D58 | 음수 0은 양의 0으로 정규화 | number·integer 및 중첩 숫자·Map 숫자 key·수용할 계산 결과에 적용. 정규화 후 스키마 검증·변경 비교, 기존 0에 -0을 써도 값 변경 없음. 원본 보호, 작은 음수·문자열은 그대로. [값 상세](../spec/10-value-contracts.md#음수-0의-정규화) | U11 |
| D59 | 위임에 따른 값 검증 기본 규칙 일괄 확정 | 데이터의 BigInt·Symbol·함수·Promise·WeakMap·WeakSet과 순환 구조 거절, 비순환 공유 허용. 검증 시 coercion·default 주입·불허 속성 자동 제거 금지. 정규화→검증→변경 비교·반영, 유한 숫자 정확 비교·객체 속성 순서 무시. [값 상세](../spec/10-value-contracts.md#값-검증의-공통-기본-규칙) | U12: 담당자 판단 위임 |


| D60 | 인라인·입력 기본값의 현행 문법 | 사용 위치별 ref/인라인 본문 XOR, Value 리터럴 default·required 배타·명시 missing/pending 보존. [기본 명세](../VIEWSTEM-SPEC.md#411-인라인-정의의-사용-위치) | U13 |
| D61 | State 포트의 선언 계약 일치 | 현재 값만으로 연결하지 않으며 typeRef·로컬 참조 해석 후 검증 구조 일치 확인. 일반 논리 포함 추론 제외, 매 쓰기 권한·타입·수명 검증 | U13 |
| D62 | Query 순환·Action 재귀 거절 | 미사용·인라인·조건 분기까지 정적 그래프 검사, core 경유 동적 Action 호출 스택 보호. 코드 함수 자체의 강제 종료 보장은 아님 | U13 |
| D63 | 스키마·값 평가·읽기 프로필 | JSON Schema 2020-12 subset과 native 확장, 동적 영역·한 번 평가·concat/formatString, missing/pending/ready/error snapshot. [Type](../spec/03-variable-type.md#v1-스키마-프로필)·[값](../spec/10-value-contracts.md#동적-값-평가-프로필) | U13 |
| D64 | Query 변환·갱신·관찰 구체화 | Join 필드·순서, Concat 빈 with, queryDefaults·status/stale·대기 결합·refresh 제외 오류·명시 retry. 당시 남긴 실패 뒤 data 보존은 후속 D68로 확정 | U13 |
| D65 | HTTP 프로필·현재 실행 계획 | 헤더/params/body·주소·응답·독립 Login·설정 가능한 timeout, HttpExecutionPlan·executeRequest·secret resolver. [현재 HTTP](../spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto) | U13 |
| D66 | 최소 SDK·오류·Store·URL·Clock | 적용 commit/initial 분리·호출별 핸들·정제 오류, 주소/준비 관찰·reaction 매핑·URL 제한과 commit 유효성. 실제 어댑터는 T1–T4 검증 | U13 |
| D67 | repeat 확장 뒤 항목별 when | key 전체 검증 후 when·inputs 평가. 중첩 as shadowing 거절·형제 별칭 허용, 반복 전체 gate는 바깥 노드 | U13 |
| D68 | 자동 조회 실패 후 마지막 전체 성공 보존 | data·dataInputs 보존과 error/stale 표시, 첫 성공 전 missing, 새 성공의 원자 교체. 부분 성공·명시 Action Query의 캐시 대체 없음. [Query](../spec/02-query.md#실패-후-마지막-성공-결과의-보존) | U14: Q1 추천 수락 |
| D69 | 날짜 문자열·명시 업무 시간대 | date/time/datetime 구별, datetime offset 필수·UTC 밀리초 정규화, 서비스의 명시 IANA Value 입력. 일반 문자열 추정·ambient 시간대 없음. [날짜](../spec/10-value-contracts.md#날짜-값과-전송-형식) | U14: Q2 추천 수락; 세부 프로필은 U12/U13 위임 |
| D70 | v1 선언형 복구 제외·코드 Action 복구 | Try/Catch/Finally 미지원 등록 오류, 기본 실패 중단·비롤백. 등록한 코드 Action에서 명시 복구·정리하되 취소 수명 준수. [Action](../spec/04-action.md#v1-오류-복구의-범위) | U14: Q3 추천 수락 |
| D71 | T1 독립 실험과 후보 판정 | [실험 결과](../handoff/t1-experiment-2026-10-29.md)에 따라 Ajv를 JSON 검증의 다음 우선 후보로 둠. CEL 최종 채택은 비용 계량·날짜/함수 경계·Dart 차이 때문에 보류. 실험 함수를 공개 SDK로 승격하지 않음 | U15: 실험 실행 승인 |
| D72 | cel-js의 계산 제한·날짜를 패치하는 전제로 진행 | `@marcbachmann/cel-js` 8.0.0을 검토 기준으로 두 문제의 대응 방향을 닫고 다음 논의로 이동. [현재 패치 범위](../spec/03-variable-type.md#cel-패치-전제)를 따르며 실제 수정·보안/적합성 검증·배포 방식은 후속 작업. D71의 미검증 결과를 통과로 바꾸거나 core 본 구현을 승인하는 결정은 아님 | U16: 패치 전제 수락 |
| D73 | T2 Query 경합 독립 실험의 부분 검증 | [실험 결과](../handoff/t2-query-races-2026-10-29.md)에 지연 응답·fresh 대기·취소·교체·timeout의 프로토타입 증거를 보존. 현재 계약 유지, T2 전체·실제 core/HTTP/URL/renderer 완료로 확대하지 않음 | U17: 후속 실험 진행 승인 |
| D74 | T2 URL commit 경계의 부분 검증 | [실험 결과](../handoff/t2-url-races-2026-10-29.md)에 Node/실제 Chromium의 지연 쓰기·복원·소유 key·history/한도 증거를 보존. 현재 계약 유지, core/renderer·날짜·실제 HTTP·전체 브라우저 적합성은 후속 | U18: URL 실험 검증 승인 |
| D75 | 연속 검증의 첫 문제에서 중단 | U19의 중단 조건에 따라 [HTTP Host 헤더의 브라우저 경계 누락](../handoff/t2-http-boundary-2026-10-29.md)을 재현한 뒤 후속 검증·수정 중단. 정책 보완은 권고이며 미확정, 잔여 검증 완료로 처리하지 않음 | U19: 연속 검증 및 조건부 중단 요청 |
| D76 | 전송 계층 관리 헤더의 공통 거절 | U20 수락으로 [HTTP 헤더 프로필](../spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto)을 보완. 직접/서버/Login에 같은 이름 제한을 적용하고 null·병합 우회도 전송 전에 INVALID_DEFINITION으로 거절. 기존 Host 실패 증거 보존, 독립 guard 검증 후 연속 검증 재개. core 본 구현·CEL 패치 보류는 유지 | U20: 헤더 거절 권고 수락 |
| D77 | API 응답 내용과 실행기 내부 인증정보의 책임 분리 | [U21 책임 경계](../spec/01-datasource-auth.md#비밀정보의-책임-경계): API의 응답 body/headers 내용은 API 책임. Viewstem의 기본 secret 문자열 검사·마스킹·응답 전체 거절을 요구하지 않음. 실행기는 내부 credential/로그인 응답의 직접 혼입 방지·평가 문맥 분리·신뢰 권한 검사 유지. U20 P21 결함 판정과 필터 권고를 철회하고 테스트 정정 | U21: 책임 구분 확정·후속 검증 요청 |
| D78 | auth.token의 Login 응답 전용 평가 문맥 | [U22 읽기 문맥](../spec/01-datasource-auth.md#1018-공통-값-문법과-서버-전용-평가-문맥): /response만 제공하고 요청 구성용 secret 해석 권한을 전달하지 않음. 중첩 표현에도 동일 제한, 금지 참조 시 추가 secret 조회·API 시작 금지. 독립 실험의 수정·회귀 검증이며 core 본 구현 승인 아님 | U22: 토큰 문맥 수정·검증 재개 요청 |
| D79 | 오류 정제 중 추가 예외 격리 | [U23 오류 정제](../spec/07-host-integration.md#공통-오류와-진단): 외부 예외의 직접 저장된 알려진 문자열 코드만 사용. getter·상속·형 변환을 실행하지 않고 속성 검사 실패도 HTTP_ERROR로 정제하며 확정된 TIMEOUT/CANCELLED 유지. HTTP 독립 실험의 보완이며 core 전체 구현 승인 아님 | U23: 오류 정제 수정·검증 재개 요청 |
| D80 | 배열 크기 계산과 원소 경로의 구분 | [U24 CEL 크기](../spec/03-variable-type.md#배열-크기-계산): size(items)/items.size()로 개수 계산, 안전 정수 결과 어댑터 유지. [배열 경로](../spec/10-value-contracts.md#동적-값-평가-프로필)는 존재하는 정수 인덱스만 허용하며 일반 객체의 length 필드는 유지. 독립 실험의 수정·검증이며 core 본 구현 승인 아님 | U24: CEL 크기 검증·배열 경로 수정·연속 검증 요청 |
| D81 | params 객체의 병합 전 검사 | [U25 params 검사](../spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto): Datasource·요청·Login params를 각각 평가한 뒤 일반 객체인지 검사하고 병합. 생략은 허용, 명시 null·배열·스칼라·native 컬렉션은 거절. 요청 우선·키 제거·반복 배열 값 유지. 독립 실험 보완이며 core 본 구현 승인 아님 | U25: params 검사 수정·문서 반영·연속 검증 요청 |
| D82 | headers 전체 @path와 금지 헤더 검사 유지 | [U26 동적 headers](../spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto): 정적 이름과 객체 참조 구분. 정적 금지 이름은 Login 전에, 참조 결과의 객체/이름/값/금지/중복은 해당 요청 전·각 선언별 병합 전에 검사. null 제거·반환 데이터 비재평가 유지. 독립 실험 보완이며 core 본 구현 승인 아님 | U26: headers 객체 참조 수정·금지 헤더 유지·연속 검증 요청 |
| D83 | request.path의 선평가와 주소·권한 검사 유지 | [U27 path 평가](../spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto): 경로 평가 후 기존 문자열/주소 문법·공통 경로·목적지 권한 검사. 목적지 확정 전에는 secret resolver 권한 없음. 최종 query URL 재검사와 취소/timeout 유지. 독립 실험 보완이며 core 본 구현 승인 아님 | U27: request.path 수정·주소/권한 유지·연속 검증 요청 |
| D84 | HTTP 동적 값 전체 적용과 확정 계약 버그의 자율 수정 | [U28 전체 경로 점검](../handoff/t2-path-audit-2026-10-30.md): baseUrl·method·Login request 전체·공통 표현식 문법/escape/문맥을 기존 계약에 맞게 보완. 현재 HTTP의 17개 위치와 미구현 core 범위를 구분. 첫 버그마다 멈추지 않고 확정 계약 위반은 수정·검증하며 실제 선택이 필요한 경우만 논의. 주소/권한/금지 헤더·API 책임·core 구현 보류 유지 | U28: baseUrl 수정·@path 전체 검사·기존 계약 버그 자율 해결 요청 |
| D85 | 복합 Query·완료 주기 계약의 실행 연결과 오류/수명 보완 | [U30 검증](../handoff/t2-composite-polling-2026-10-30.md): 하위 입력별 재사용과 전체 성공 반영, fresh 구분, source/transform 위치·정제 cause, owner cache 해제·전체 완료 후 polling 예약. 기존 계약 위반을 수정한 실험 증거이며 private metadata/캐시 전략·재개 deadline·production core를 새 공개 계약으로 승인하지 않음 | U30: 복합 Query/polling 검증·버그 자율 수정·문서화 요청 |
| D86 | autoRefreshWhen 재개 시 즉시 갱신과 완료 기준 새 주기 | [U31 재개 계약](../spec/02-query.md#완료-기준-주기-실행): false→true에서 조건을 만족하면 즉시 fresh 한 번, active 중이면 최신 pending 한 건으로 결합. 완료 뒤 새 interval을 시작하며 예전 완료 시각은 복원하지 않음. 재중단 시 주기 의도만 제거하고 입력·수동 요청 보존. [실험 검증](../handoff/t2-polling-resume-2026-10-30.md)과 core 구현을 구별 | U31: 재개 정책 수락·문서/실험 수정·결합 검증 요청 |
| D87 | 연속 경계 검증과 기존 계약 위반 보완 | [U32 후속 기록](../handoff/boundary-followup-2026-10-30.md): 복합 null/escape/Concat·취소, URL baseline/사전 검증/옛 cleanup 무효화, 날짜 스키마/UTC 범위 검증. 실제 결과·수정 전 증거를 구별하며 production core 완료로 확대하지 않음 | U32: 앞선 방식으로 검증 계속 요청 |
| D88 | View 교체 중 URL 정리 실패의 처리 | [U33 URL 실패 정책](../spec/09-preserved-contracts.md#쓰기실패정리): 유효한 새 화면 교체는 완료하고 새 초기값 유지, URL 동기화 오류 보고. 옛 URL을 복원해 덮거나 정리 성공으로 표시하지 않음. 사전 설정 오류는 기존 View 보존, obsolete 교체는 CANCELLED 유지 | U33: 새 화면 교체 완료·URL 오류 보고 선택 |
| D89 | 전 범위 검증의 지속·완료 기준 | [U34 진행표](../handoff/verification-ledger.md): 224개 인수 기대값에 실제 증거를 대응하고 실행 가능한 미검증 경계를 계속 검사. 부분 suite 통과로 종료하지 않으며 계약 버그는 자율 수정. 실제 제품 선택이 필요한 경우만 질문 | U34: 전체 검증 완료까지 지속 요청 |
| D90 | 날짜 Map key 정규화 충돌 | 서로 다른 string key가 날짜 정규화 후 같은 key가 되면 값 수용 전체 거절. 엔트리 선택/덮어쓰기로 데이터 유실하지 않음. [값 계약](../spec/10-value-contracts.md#날짜-값과-전송-형식), U34 실험 회귀 | U12/U13 위임에 따른 U34 기술 보완 |
| D91 | 코드 Action 하위 호출의 부모 수명 연결 | 문맥 invokeAction은 부모 스택·취소를 상속하고 외부 runtime 호출은 독립 유지. 명시 입력·권한·출력 검증과 비롤백 유지. 부모 종료 뒤 새 하위 호출 및 남은 자손 실행은 취소. [하위 호출](../spec/04-action.md#재귀확장-실행의-경계) | U35: 내부 호출 함께 취소 추천 수락; 종료 정리는 U12/U13 기술 위임 |

| D92 | 구현 착수 인계와 문서·실험 커밋 | U35 이전 선택 대기 표기를 최신 계약으로 정리하고 검증 기준선을 로컬 커밋. 새 채팅은 저장소 문서·실험을 읽고 JS/TS core 구현 요청에 따라 진행. [시작 절차](../handoff/implementation-start.md#새-채팅에서-시작할-때) | U36: 새 채팅 준비·문서 및 실험 커밋 요청 |
| D93 | JS/TS core 구현·실제 패키지 검증 | U37에서 기존 구현 보류 해제. 단일 StateStore에 Registry·Query·Action·headless View 연결, 실제 패키지 인수 216개, 타입·고정 CEL 빌드·브라우저·tarball 검증. SDK·패키지 구조·추가 CEL 수정 패치는 기술 위임에 따른 구체화이며 기존 실험 보존. Svelte/Dart/차트·공개 발행은 후속. [제품 인계](../handoff/core-implementation-2026-11-02.md) | U37: 실제 구현과 검증 요청 |
| D94 | 바닐라 core playground | JSON 편집·실행, 화면 미리보기, State·Query·Action 관찰을 제공하는 로컬 개발 도구. 실제 공개 core를 사용하고 DOM·HTTP fixture는 playground가 소유. 새 실행의 초기화·잘못된 구성의 기존 화면 보존·분할 화면은 요청을 구현하는 기술 구체화다. Svelte renderer·선택 차트·공개 배포는 후속. [구현 인계](../handoff/playground-implementation-2026-11-02.md) | U38: 바닐라 playground 구현과 작업 공간 중심 UI 요청 |
| D95 | Svelte 5 클라이언트 렌더러 | core 공개 API를 소비하고 호스트가 Component 계약과 Svelte 구현을 명시 등록. 자동 기본 UI·Action·테마 없음. projection·slots·이벤트·수명과 DOM 완료, 실제 패키지 소비 검증. API 시그니처와 오류 root 연결은 기존 계약의 기술 구체화. [구현 인계](../handoff/svelte-implementation-2026-11-02.md) | U39: Svelte 구현 요청과 기본 등록 경계 확인 |
| D96 | Svelte 단일 import와 간결한 API | `@viewstem/svelte`의 `createRenderer()`가 빈 Registry·Runtime을 생성·소유. `Renderer`·`Adapter`·`transformError` 등 중복 프레임워크 명칭을 제거하고 core 공통 타입을 재노출. 기존 Runtime 주입·외부 Store 소유권을 유지. core를 내부 dependency로 제공하며 UI 자동 등록은 없음. 옵션 혼용 거절·재진입 정리·로컬 소비자 설치는 요청에 따른 기술 구체화. [U40 인계](../handoff/svelte-implementation-2026-11-02.md#u40-단일-패키지-진입점) | U40: core 직접 import 제거와 Svelte 명칭 생략 요청 |
| D97 | 사용자용 공개 API와 내부 엔진 분리 | core 루트는 5개 실행 API, HTTP/CEL은 subpath, Svelte는 기존 3개 실행 API를 유지. 클래스 생성자·검증/실행 엔진·타입 추론 구현을 숨기고 동일 런타임에 위임하는 공개 핸들을 반환. 외부 Store 소유권·취소·공유 타입을 유지. 기존 내부 사용과 호환되지 않는 import/API 변경을 [U41 변경 안내](../handoff/public-api-refactor-2026-11-02.md)에 기록 | U41: 공개 API 축소 검토 후 리팩토링 요청 |
| D98 | 사용자용 공개 API 이름 정렬 | U42에서 네이밍 검토의 P1/P2 권고 전체를 적용. Registry 계약 등록·core View 생성·완료 Promise·snapshot/diagnostic getter·정의 export·Store 쓰기/반응 등록과 공개 타입을 명확히 하고 이전 별칭 제거. JSON State initial과 수명·취소·DOM 완료 의미 유지. 예제·playground·타입·패키지 검증을 [이행 인계](../handoff/public-api-naming-2026-11-02.md)에 기록 | U42: 권고 네이밍 적용과 통합 검증 요청 |
| D99 | Svelte UI 패키지와 shadcn 전체 지원 목표 | U43에 따라 기존 renderer와 분리된 UI 패키지를 계획하고 공식 카탈로그 전체를 인벤토리화. 패키지/subpath·등록 API·JSON 지원 방식은 [계획 제안](../handoff/svelte-ui-shadcn-plan-2026-11-02.md)에 기록. 구현·지원 완료나 API 확정으로 확대하지 않음 | U43: Svelte UI 계획과 shadcn 전체 지원 요청 |
| D100 | Svelte UI·shadcn 실제 패키지 구현 | U44에서 U43 계획 구현을 승인. 별도 `@viewstem/svelte-ui` 전체/선택 등록, 351 JSON 원본+6 조합, 35 native 문맥 부품을 구별. 원자적 일괄 등록과 UI callback microtask 경계를 추가하며 core DSL·상태 엔진은 유지. [구현·한계](../handoff/svelte-ui-shadcn-implementation-2026-11-03.md) | U44: 계획대로 전체 shadcn·예제·테스트·문서 구현 및 검증 요청 |
| D101 | 오픈소스 라이선스·기여·운영 정책 | 자체 코드·예제·문서는 [MIT](../../LICENSE), 저작권 표기는 miinhlym. 외부 고지는 유지. 기여 장벽을 낮추기 위해 외부 Issue·PR, 영·한 소통, 별도 CLA/DCO 의무 없는 동일 라이선스 기여를 채택하고 maintainer가 최종 병합·릴리스 판단. 새 커뮤니티 문서는 영어 기준. [기여](../../CONTRIBUTING.md)·[지원](../../SUPPORT.md)·[보안](../../SECURITY.md)·[행동강령](../../CODE_OF_CONDUCT.md)이 현재 정책을 소유하며 npm 발행 승인은 포함하지 않음 | 2026-11-03: 사용자가 MIT·계정명과 3–7번 권고를 수락하고 비공개 신고 이메일을 제공 |
| D102 | 사용자 문서의 영문 기본·한국어 병행 | 루트·패키지·예제·플레이그라운드 README, 문서 안내, 커뮤니티 정책은 기본 파일을 영어로 제공하고 같은 경로의 `*.ko.md`와 상호 연결. 패키지에 한국어 README도 포함. 상세 명세·인수인계·과거 증거는 기존 언어·기준 위치를 유지하고 영문 안내에서 링크 언어를 표시. 라이선스 원문은 유지. 범위와 동시 갱신 규칙은 [기여 안내](../../CONTRIBUTING.ko.md#문서-언어)가 소유 | 2026-11-03: 사용자가 실제 사용자용 페이지의 영문 기본·별도 KR 문서를 요청 |
| D103 | 임시 playground·shadcn 갤러리 제거 | U46에서 임시 확인용 앱·편집기·서버·사용자 실행 안내를 제거한다. 패키지 공개 계약과 shadcn 지원은 유지하고, 제품 동작 검사는 직접 마운트하는 내부 fixture로 이관한다. 폐기한 도구 전용 검사는 제품 검증과 구분하고 기존 증거를 보존한다. D94의 상시 개발 도구 제공과 D100의 사용자 갤러리 안내 부분을 대체한다. [제거·검증](../handoff/temporary-tools-removal-2026-11-04.md) | 2026-11-04: 사용자가 임시 확인용 playground·갤러리 제거를 요청 |
| D119 | 외부 앱 개발용 공통 스킬의 Codex·Claude Code 첫 지원 | **동시 첫 지원 조건은 D129에서 대체.** 당시에는 두 에이전트를 처음부터 동등한 지원 대상으로 정했다. 라이브러리 계약·예제·작업 흐름은 공통으로 관리하고 실제 에이전트별 설치·발견·호출·도구 연결 차이만 분리한다. 각 환경의 검증을 별도로 확보하며 실행 환경·설치 배포 정책·나머지 설계 제안·구현 발행 승인은 포함하지 않는다. [현재 계약](../VIEWSTEM-SPEC.md#85-외부-앱-개발용-공통-스킬)·[설계](../../design_draft.md) | 2026-11-05: 사용자가 Codex와 Claude Code를 처음부터 지원하고 특정 에이전트에 종속되지 않는 공통 스킬과 에이전트별 차이 분리를 확정 |
| D120 | 공통 스킬의 실행 환경을 파일 접근·Node.js 실행으로 정의 | 로컬·클라우드 위치로 구분하지 않고 프로젝트 파일 접근과 Node.js 실행이 가능한 환경을 첫 지원 범위로 한다. 파일·실행 도구가 없는 대화 환경을 위한 원격 계약 조회는 첫 범위에서 제외한다. 설치·배포 정책이나 실제 지원 검증 완료를 뜻하지 않는다. [현재 계약](../VIEWSTEM-SPEC.md#85-외부-앱-개발용-공통-스킬)·[설계](../../design_draft.md) | 2026-11-05: 사용자가 로컬·클라우드 구분 없이 프로젝트 파일 접근과 Node.js 실행이 가능한 환경으로 확정 |
| D121 | 라이브러리와 공통 스킬의 별도 설치 | 라이브러리와 스킬을 별도로 명시 설치한다. 라이브러리 설치가 스킬 설치·에이전트 설정 변경을 자동 수행하지 않으며 통합 설치 흐름은 제공 범위에서 제외한다. 실제 설치·발행이나 구체적인 설치 도구의 검증 완료를 의미하지 않는다. [현재 계약](../VIEWSTEM-SPEC.md#85-외부-앱-개발용-공통-스킬)·[설계](../../design_draft.md) | 2026-11-05: 사용자가 별도 설치를 선택 |
| D123 | 소비자 스킬 최종 리뷰 보완과 최소 구현·초기 평가 | 최종 EGM F1–F7을 실행 계약에 반영한다. 공통 최소 스킬과 Codex 초기 비교부터 구현하고, 참조와 UI helper는 관찰 근거에 따라 추가한다. Claude Code는 이번 실행에서는 준비만 수행하고 미실행으로 기록한다. 지원 목표나 공개 릴리스 완료를 뜻하지 않는다. [실행 계획](../designs/viewstem-skills-implementation-2026-11-05.md)·[초기 결과](../handoff/viewstem-skills-initial-2026-11-05.md)·[후속 확장 검증](../handoff/viewstem-skills-extended-2026-11-05.md) | 2026-11-05: 사용자가 리뷰 보완의 설계·실행 계획 반영과 최소 스킬·초기 비교 실행을 요청하고 Claude Code는 준비만 하도록 지정 |
| D129 | 소비자 스킬의 현재 지원을 Codex로 한정 | Claude Code CLI를 제거하고 현재 지원·실행 검증 및 첫 배포 필수 조건에서 제외한다. D119의 두 호스트 동시 첫 지원 조건을 대체하며, 공통 본문·호스트 차이 분리와 D120·D121은 유지한다. Claude 준비 자료는 미검증 참고 자료로 보존한다. Codex의 실제 검증 범위, 런타임 미해결 문제와 공개 ref 조건은 별도로 유지한다. [현재 명세](../VIEWSTEM-SPEC.md#85-외부-앱-개발용-공통-스킬)·[설치 제거와 현재 범위](../handoff/viewstem-skills-scope-2026-11-06.md) | 2026-11-06: 사용자가 CLI 제거와 Claude Code 제외를 요청 |
| D131 | View 투영 중 재진입 State 변경의 후속 갱신 | 진행 중인 투영에서 구독자가 State를 쓰면 재계산 요청을 기존 microtask 큐에 합친다. 현재 snapshot 통지를 마친 뒤 현재 View 수명으로 갱신하고, 예약 갱신이 남으면 초기 완료를 먼저 확정하지 않는다. 폐기·교체·같은 값 쓰기 회귀와 원본 실패 앱의 수정 core 패키지 검증을 완료했다. [현재 계약](../spec/07-host-integration.md)·[원인·수정·검증](../handoff/view-subscription-projection-fix-2026-11-06.md) | 2026-11-06: 사용자가 정확한 원인 확인, 런타임 수정, 재현 회귀 테스트와 수정 패키지로 원본 앱 재검증을 요청 |

## B. 대체·기각된 방향

| 이전 | 현재 / 대체 이유 | 근거 |
|---|---|---|
| Widget/Dashboard 별도 체계 | Component/View로 일반화; 옛 요구 자체 삭제 아님 | E09 |
| Channel / 서비스 채널 무조건 readonly | StateStore; 소유권과 쓰기 권한 분리 | E07 |
| Calculation·DataPipeline 별도 리소스 | Variable·복합 Query에 책임 배치 | E06, E08, 통합 명세 §4 |
| 전체 리소스 외피 평탄화 | 최상위 spec 유지, 내부만 불필요 중첩 제거 | E25→E27 |
| bare query/component 등 참조 | queryRef/componentRef 등으로 변경 | E39 |
| 공통 ref:{kind,id} 객체 강제 | 필드별 종류 + 문자열 ID | E12, E39 |
| State/Derived 내부 spec | 평탄한 kind·initial 또는 variableRef·inputs | E24→E33 |
| Ref/refType/QueryInstance 포트, 별도 targets/bindings | Value/State/Query와 inputs로 통합 | E32 |
| 수신 경로 /inputs/name | 수신 `/ports/name`; inputs는 호출 위치 연결 | 통합 명세 §5.1 |
| 저장 원본 target{kind,id,path} 재조회가 필수 | 현재 리소스로 요청 구성; 옛 방식은 선택 서비스의 참고 이력 | E15→E23 |
| 전용 Bearer/ApiKey auth kind, auth.secret | secrets/@path/headers/params; 기능은 보존 | E28 |
| Login tokenPath/apply/내부 secrets | 공통 secrets, token @path, /auth/token 적용 | E28 |
| Request/Composite Query 분리, Http/Mutation Action 구분 | 통합 Query와 Action의 Query 단계 | E29, E30 |
| returns/outputType/bare output 표현식 | output 타입 계약 + 선언형 output.value | E42 |
| children와 slots 병행 | slots만 지원 | E41 |
| 필수 GridItem, x/y/w/h 표기 | Grid.inputs.layout, row/column/rowSpan/columnSpan | E41 |
| renderer 재사용 금지 / 배치 ID 없음 | setResource 허용 / 명시적 인스턴스 식별 | 부록 A, E14 |
| CEL이 다시 후보라는 중간 설명 | CEL 승인 유지. 실행기는 이후 JS cel-js 패치 경로 U16/U34, Dart 별도 | E21, U16/U34 |
| A2UI 전체 적용을 제거했으므로 @path도 폐기 | 표현 문법은 자체 계약으로 유지 | E22, E31 |

## C. 보류 또는 1차 제외

| 항목 | 지금 하지 않을 일 | 근거 |
|---|---|---|
| Port access | public 필드로 추가하지 않음; 실제 대상 권한 검증은 유지 | E32 |
| Action EmitEvent / 전역 이벤트 버스 | on.emit과 혼동하지 않음 | E41, 통합 명세 §7·13 |
| Theme 독립 리소스, Bundle 독립 종류 | Theme 필수 제외; 전달은 리소스 배열 | E10 |
| scoped slot 데이터·동적 슬롯 이름 | 단순 UI 영역 전달까지만 | E41 |
| Grid drag·항목별 고정 repeat·내용 기반 자동 높이 | 초기 배치 의미에 몰래 추가하지 않음 | E41 |
| 모든 리소스의 코드형 확장 | Component/Action 등록을 전 리소스로 확대하지 않음 | E42 |
| 선언형 Try/Catch/Finally | v1 제외, 업무별 복구·보상·정리는 등록한 코드 Action에서 명시 | U14, D70 |
| OAuth/MFA/쿠키세션/토큰 캐시 | 제한된 Login을 전체 인증 플랫폼으로 확대하지 않음 | E28 |
| Flutter 구현·Rust/WASM 통합 코어 | 우선 JS/Svelte; 전자는 후속, 후자는 현재 경로 아님 | E04 |

## D. 현재 남은 논의와 기술 검증

U13에서 [O01–O16 전체 현황](../handoff/open-contracts.md#o01o16-전체-처리-현황)을 대조해 D60–D67을 위임에 따른 현재 결정으로 기록했다. 기존 U02–U12의 값 계약도 유지한다. 과거 미결 목록을 현재의 사용자 승인 대기 목록으로 다시 사용하지 않는다.

- Q1–Q3은 U14의 사용자 수락으로 D68–D70에 확정했다. 이 세 항목의 추가 승인을 기다리지 않는다. U35 코드 하위 호출도 확정됐으며 현재 구현 인계는 U37의 실제 패키지 결과를 따른다.
- 기술 검증 T1–T4는 U34–U35에서 독립 실험 범위를 완료했다. 실제 라이브러리에 이식할 때 같은 기대값으로 재검증한다. 담당자가 기술 세부를 정하며 사용자에게 패키지·필드 선택을 대신 요구하지 않는다.
- 초기 설계 정리에서 npm scope·라이선스·배포/CI 등 운영 사항은 범위 밖이었다. 이후 D101에서 MIT와 커뮤니티 정책을 확정했다. npm scope 권한·발행은 별도이며 설계 위임이나 패키지 명명은 공개·배포 승인이 아니다.

세 결정과 남은 영향은 [논의 결과](../handoff/open-contracts.md#중요한-논의-사항)에 있다. 현재 독립 실험의 실제 결과는 [검증 진행표](../handoff/verification-ledger.md)를 따른다. U36의 문서·실험 커밋이 실제 core 구현이나 배포 완료를 뜻하지 않는다.

## E. 2026-10-29 의미 복원 기록

U34의 자율 버그 수정에서는 `states`가 이름별 맵이라는 기존 계약에 따라 초기값을 의존 순서로 평가하도록 명확히 했다. JSON에서 뒤에 나열된 State를 참조했다는 이유만으로 비순환 초기값을 거절하지 않는다. 새 제품 기능 선택이 아니라 선언 순서에 따른 실험 제한의 제거이며, 순환·없는 참조·암묵 부모 캡처 거절은 유지한다. 실행 증거는 [U34 진행표](../handoff/verification-ledger.md)를 따른다.

적대적 리뷰에서 통합 요약의 누락·축소 9건을 확인했다. E43–E51로 실제 제안·수락을 추가 대조하고 [현재 명세](../VIEWSTEM-SPEC.md), [이전 승인 상세](../spec/09-preserved-contracts.md), [인수 목록](../handoff/acceptance-matrix.md)에 복원했다. 위 D33–D36은 새 기능 선택이 아니라 기존 승인 의미를 찾기 쉽게 등록한 것이다. Join 전체 문법·새 SDK/DTO·CEL 및 부재 원문을 추정 확정하지 않았다. [복원 범위와 실제 검증](../handoff/semantic-review-2026-10-29.md)은 이전 파일 이관 검사와 별도다.

추가 재평가 후 사용자 개선 요청에 따라 D38의 Query 실패 의미를 E52로 복원하고, D37의 등록 식별 범위를 U01로 명확히 했다. D37을 과거 승인 복원으로 소급하지 않는다. 전역 id 유일성을 새로 강제하거나 참조 객체·버전 접두사를 추가하지 않는다. [추가 보완과 검증](../handoff/semantic-review-2026-10-29.md#추가-재평가-후-두-항목-보완)을 따른다.

전체 원문 감사에서 추가로 확인한 승인 의미는 D39–D48/E53–E69에 보존했다. 과거 미수록 9개와 초기 완료 승인은 부모가 방 기록에서 직접 회수했으며, 로컬에는 요약/명시 인용을 원 transcript와 구별해 추가했다. 공개 계약·이유·예외·대체 관계와 인수 위치의 [전체 대응표](../handoff/source-contract-matrix.md)를 유지한다. HTTP의 최초 승인 미확인 회고는 확정으로 올리지 않는다.
