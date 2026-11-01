<a id="계약-인수-테스트-백로그"></a>

# 계약 인수 기대값

이 문서는 [현재 명세](../VIEWSTEM-SPEC.md)의 **인수 ID별 기대 동작**을 소유한다. 전체 목록에는 JS/TS core와 별도 선택 차트 항목이 함께 있으므로 실행 상태를 단일 ‘전체 core 완료/미완료’로 표시하지 않는다.

- 실제 제품 테스트 파일·이름과 후속 범위: [제품 인수 대응표](core-acceptance-coverage.json).
- 실행 환경·통과/실패·해시: [제품 검증 결과](core-verification-results.json).
- 구현 전 독립 실험: [진행표](verification-ledger.md)와 [원래 항목별 증거](../../experiments/verification/coverage.json). 원래 기준선과 실패 기록은 보존한다.

기대값 표는 실행 결과가 아니다. 아래 U15 이후 날짜별 실험은 해당 시점의 증거이며 그때의 ‘미구현’을 현재 제품 상태로 적용하지 않는다. 정확한 오류와 SDK는 연결된 현행 명세·공개 타입을 따른다.

출처: [통합 명세](https://chatgpt.com/space/page_7842bb8bff0c8191be6cd5831e7e375f) §12 및 [근거 색인](../history/evidence-index.md). 외부 원문 없이 이 문서와 현재 명세로 기대값을 이해할 수 있어야 한다. 테스트 작성 시 ID와 부정 경로를 유지하고 실제 실행 증거에 연결한다.

## A. 계약·값·소유권

| ID | 입력/행동 | 기대 결과 | 근거 |
|---|---|---|---|
| C01 | schema와 typeRef 동시 제공 / 둘 다 없음(타입 필수 위치) | 계약 검증 실패; 임의 우선순위 없음 | E39, E41 |
| C02 | 포트 required:true, 내부 객체 required 배열 | 입력 키와 객체 속성을 서로 다른 단계에서 검증 | E41 |
| C03 | Component만 있는 ID를 queryRef로 지정 / 어떤 종류에도 없는 ID | 기대 종류의 Query가 없어 참조 오류; 다른 종류로 fallback 없음 | E39, U01 |
| C04 | Query/Variable에 State 또는 Query 포트 | 허용 행렬 위반 | E34 |
| C05 | Value에 State 읽기 연결 후 전달 객체를 변이 | 값만 전달, 원본 셀 변경 우회 불가 | E32, [값 계약](../spec/10-value-contracts.md) |
| C06 | 동일 State 셀을 두 State 포트로 연결 | 복제/상호 동기화 아닌 동일 대상 공유 | E32 |
| C07 | 같은 Component 정의 A/B 생성 | 로컬 State 별도; 명시 공유 셀만 함께 변경 | E11 |
| C08 | 초기값 pending 중 명시 유효 쓰기 | 늦은 initial이 덮어쓰지 않음 | §5.2 |
| C09 | reset 시 날짜/시간 변화 | 최초 확정 baseline 복원, 현재 시각 재계산 아님 | [초기화·reset](../VIEWSTEM-SPEC.md#52-초기화와-수명에서-유지하는-기존-결정) |
| C10 | Derived 실패 / 순환 / Derived에 SetState | 원본 변경은 유지, 의존 대상 오류·쓰기 거절·순환 검증 | §5.2 |
| C11 | initialization/URL 복원 / 실제 변경 / 같은 배치에 현재와 같은 선택값도 명시 | 초기 미발화; 실제 변화만 반응; 명시한 선택값은 기존 값과 같아도 reaction보다 우선하고 최종 상태 뒤 Derived/Query 계산 | E26 |
| C12 | null/missing/pending/undefined, Set/Map, 날짜 fixture | 확정 의미 보존; 정확한 직렬화 프로필 결정 후 교차 테스트 | [값 계약](../spec/10-value-contracts.md) |
| C13 | 두 owner가 같은 Store의 동일 대상에 reaction 등록 / 동명 별개 로컬 셀 | 전자는 두 번째 등록 거절, 후자는 이름만으로 중복 처리하지 않음 | E44 |
| C14 | 라이브러리 생성 Store / 같은 메서드의 임의 외부 Store 주입 | 전자 지원, 후자는 별도 확장 계약 없이 호환으로 취급하지 않음 | E51 |
| C15 | 서비스가 View/Component 소유 State 값을 변경 후 해당 owner 폐기 | 쓰기가 생성 소유권을 바꾸지 않음; 서비스 소유 State와 주입 Store는 유지 | E51 |
| C16 | Query와 Component를 같은 ID로 등록 후 각각 queryRef/componentRef 사용 | 둘 다 등록 가능; 필드가 기대하는 종류의 정의로 각각 해석 | U01 |
| C17 | 같은 종류·ID의 두 정의 등록; 코드형/선언형 Component 또는 Action 중복 포함 | 모두 등록 오류; 구현 방식별 별도 중복 허용·fallback 없음 | U01 |
| S01 | 전체·단일·여러 State 묶음 구독 | values/changes는 구독 범위만 포함; 범위 밖 변경으로 통지하지 않음 | E45 |
| S02 | 구독 직후 / 그 뒤 실제 변경 | 현재 values + changes: [] 한 번 / 변경 후 값과 실제 변경 목록 | E45 |
| S03 | 원자 변경 하나로 구독 대상 둘 변경 | 최종 values와 changes로 콜백 한 번, 중간 상태 통지 없음 | E45 |
| S04 | 등록·값 변경·제거·같은 값의 새 수명 교체 | added/updated/removed/replaced 구별, 제거는 values 키 부재·실제 null은 키 유지 | E45 |
| S05 | 같은 논리적 이름의 제거·재생성 / 구독 해제 | 이름 기준 관찰 유지·폐기 핸들 재사용 아님 / 해제 후 새 통지 없음 | E45 |
| S06 | Store 관찰값에 native Set/Map 포함 | 런타임 타입·원본 보호 유지, Query 전송용 변환 적용 안 함 | E45, E47 |

## B. Query·HTTP·인증

| ID | 입력/행동 | 기대 결과 | 근거 |
|---|---|---|---|
| Q01 | 등록만 한 미사용 Query/Component | 요청 0건 | E13 |
| Q02 | 참조 Query를 같은 인라인 정의로 대체 | 동일 입력/검증/실행 의미 | E12 |
| Q03 | 복합 Query source 필수 inputs 누락 | 자동 이름 매칭 없이 실행 전 오류 | §10.2 |
| Q04 | 형제 sources 순서 변경 | 순서가 쓰기 의존성이 되지 않음 | §10.2 |
| Q05 | join 중복 키/타입 불일치/null/키 누락 | 모든 매칭 조합/엄격 비교/null 비매칭/누락 오류 | §10.2 |
| Q06 | transform.input [1], Concat.with에 [1,{label:"x"}], [null] | [1,1,{label:"x"},null], with의 추가 배열 순서·중복·항목 보존 | E49 |
| Q07 | 이전 입력 요청 늦게 반환 | 현재 데이터로 덮어쓰지 않음; 유효 snapshot만 결합 | [Query 정책](../spec/09-preserved-contracts.md#함께-보존할-실행api-이력) |
| Q08 | active 중 여러 입력 변경 | active 1 + latest pending 1; 중간 pending을 순서대로 모두 실행하지 않음 | [Query 정책](../spec/09-preserved-contracts.md#함께-보존할-실행api-이력) |
| Q09 | executeWhen:false인 사용 인스턴스에 Action의 RefreshQuery | 요청 0건; 실행 조건으로 실행할 수 없다는 원인을 포함한 오류로 Action 중단, 뒤 단계·정상 output 평가 0회; 성공이나 무기한 대기로 처리하지 않음 | E37, E55 |
| Q10 | autoRefreshWhen false, manual refresh 요청 | 주기 조건과 명시 갱신 구분 | [Query 정책](../spec/09-preserved-contracts.md#함께-보존할-실행api-이력) |
| Q11 | active 진행 중 RefreshQuery를 호출하고 옛 active만 먼저 완료 | 옛 active 결과로 갱신 호출을 완료하지 않음; 1 active + 1 latest pending 조정으로 실제 새 실행을 수행하고 그 실행의 완료를 기다림 | E37, §10.6 |
| Q12 | 명시 Action Query 호출 | 자동 재시도/구독/캐시/inflight 공유 없음 | E29 |
| Q13 | refresh:false 사용 인스턴스에 일반 자동/수동 갱신·RefreshQuery 요청 | 신규 일반 갱신 실행하지 않음; RefreshQuery는 QUERY_REFRESH_DISABLED로 실패하며 Action 후속 단계 중단(U13/K12) | E50 |
| Q14 | Concat 입력 또는 with의 추가 값이 비배열 | Query 오류, 빈 배열로 대체하거나 암묵 변환하지 않음 | E49, §10.2 |
| Q15 | Query 콜백 inputs에 중첩 Set/Map | 콜백 전에 라이브러리가 Set→배열·Map→쌍 배열 재귀 변환, 원본 State 유지 | E47 |
| Q16 | 복합 Query에서 필요한 source 하나 실패, 다른 source는 성공 | Query 전체 실패; 일부 성공 데이터를 Query 성공값으로 반환하지 않음; 실패 source 식별 정보 유지; 무관한 Query/View 유지 | E52 |
| Q17 | transform 단계 실패 / 정상적으로 빈 결과 반환 | 전자는 Query 실패·실패 단계 식별 정보 유지·빈 성공값으로 대체 안 함; 후자는 성공 | E52 |
| Q18 | executeWhen false→true와 입력 변경을 한 원자 변경으로 적용 | 주기와 무관하게 현재 입력으로 요청 한 번; gate 전이와 입력 변경을 각각 중복 실행하지 않음 | [Query 정책](../spec/09-preserved-contracts.md#함께-보존할-실행api-이력) |
| Q19 | active와 latest pending이 있는 동안 executeWhen true→false | 신규·대기 요청 실행 0건; active 강제 취소는 필수 아님; 현재 입력·조건에 유효하지 않은 늦은 결과는 현재 성공값으로 반영하지 않음 | [Query 정책](../spec/09-preserved-contracts.md#함께-보존할-실행api-이력) |
| Q20 | join의 미매칭 행 / 유입 필드와 기존 필드 충돌 | 선택한 left/right/inner 의미대로 행을 구성; 미매칭 필드를 임의 null로 생성하지 않고 유입 필드가 충돌 필드를 덮어씀 | §10.2 |
| Q21 | 명시한 여러 Query·배열 입력 / 선택 목록에 따라 Query를 자동 생성하도록 기대 | 기존 여러 Query와 배열 입력은 허용; 목록 기반 자동 Query fanout은 1차 제외이며 두 기능을 혼동하지 않음 | E64 |
| Q22 | 자동 결합의 A 입력만 변경되고 B 입력은 같음; 새 A가 아직 진행 중 | 현재 조건에도 유효한 B 결과는 재사용; 새 A 준비 뒤 결합을 갱신; 대기 중 기존 조합은 이전 결과임을 구별한 갱신 중으로 유지, 새 조건 성공으로 가장하지 않음; 무관한 Query/UI는 유지 | E69 |
| H01 | 미저장 리소스, 비밀정보 없는 접근 가능 요청 | 사전 저장·서버 원본 없이 현재 정의 실행 가능 | E23 |
| H02 | 저장소 원본 변경 후 현재 화면에서 요청 | 현재 정의 사용; 원본 재조회로 몰래 변경 없음 | E23 |
| H03 | 비밀정보 포함 요청의 공격자 목적지 / 사용권한 없음 | 서버 거절; UI 선언이 권한 부여하지 않음 | E23, E28 |
| H04 | auth 없이 headers/params에서 secret 사용 | 서버 평가 필요; 실행기 내부 비밀값을 클라이언트·로그·agent에 직접 노출하지 않음. 최종 API 응답 내용은 API 책임 | E28, U21 |
| H05 | Login token 누락/비문자열/실패 | 실제 데이터 요청 진행 금지 | E28 |
| H06 | Login 요청 구성 | 외부 headers/params/auth 상속 없음; baseUrl만 생략 fallback | E28 |
| H07 | Datasource/Query 같은 키와 공통 URL 경로 | Query 키 우선; /v1 + /items → /v1/items | §10.1 |
| H08 | 로그인 HTTP redirect | 자동 추종하지 않음 | §10.1.9 |
| H09 | 공개·API Key(header/params)·Bearer·Login 3적용 위치 | 7개 인증 사례 각각 요청 구성과 비밀 경계 검증 | §10.1.1–7 |

## C. Action·확장·수명

| ID | 입력/행동 | 기대 결과 | 근거 |
|---|---|---|---|
| A01 | 첫 단계 실패 | 후속 0회, 이미 성공한 외부 효과 자동 롤백 없음 | E16 |
| A02 | 호출 뒤 폼 Value 변경/포트 연결 교체 | 기존 호출 스냅샷/대상 정체성 유지 | E16 |
| A03 | queryRef와 inline spec 모두 / 둘 다 없음 | XOR 검증 오류 | E30 |
| A04 | 코드·선언 Action이 false 반환 | 같은 `/steps/id` 원시 boolean; 성공 판단은 status | E42 |
| A05 | output 생략 선언형 마지막 단계에 값 있음 | 암묵 반환 없음, void | E42 |
| A06 | output 없는 native가 값 반환 / 선언 output에 undefined | 계약 오류·후속 중단 | E42 |
| A07 | nullable output에 null / void 단계 경로 읽기 | 전자 타입 허용 시 성공, 후자 참조 오류 | E42 |
| A08 | output 평가 또는 타입 검증 실패 | Action 실패; 앞 외부 효과 유지 | E42 |
| A09 | If 비boolean / Assert false | truthiness 허용 없음 / 즉시 오류, 정상 output 안 탐 | E41 |
| A10 | 미래 단계/다른 분기 로컬 단계 읽기 | 성공 결과로 읽지 못함 | §7 |
| A11 | 실행 중 동일 on 다시 호출 | 추가 무시; 큐·자동 취소 없음 | §7.2 |
| A12 | 실제 호출 연결 제거 또는 실행 소유자 폐기 뒤 native 반환/쓰기 | 늦은 결과·하위/후속 폐기, 호출 핸들 새 쓰기/refresh 거절 | E43, E42 |
| A13 | 다른 호출이 같은 shared State 사용 중 | 폐기 호출만 무효; 공유 대상/다른 호출은 파괴하지 않음 | E42 |
| A14 | UI 입력이 /actions/id 참조 | 연결 등록과 초기 상태 후 평가; JSON 속성 순서 무관 | §7.2 |
| A15 | View 유지 중 on 연결 제거·같은 id 재생성 | 이전 실행·늦은 결과를 새 연결에 반영하지 않음; 다른 호출/공유 대상 유지 | E43 |
| A16 | 실행 중 SetState가 자기 호출 연결을 실제 제거 | 남은 단계·하위 Action·output 계속 실행 안 함, 앞 외부 효과 롤백 안 함 | E43 |
| A17 | If.condition false, else 없음 / then 누락 / 분기 단계 실패 | 무작업 후 다음 단계 / 필수 필드 오류 / Action 중단, else를 catch로 실행 안 함 | E48 |
| A18 | 분기 안에서 바깥 앞선 성공 결과 읽기 / 분기 결과의 외부·반대 분기 읽기 | 전자 허용, 후자 불가; If 자체 반환 결과 없음 | E48 |
| A19 | Assert.condition false, 문자열 message 제공 | message 포함 오류, 뒤 단계·output 평가 0회; 생략 기본값·실패 때만 평가하는 정책과 오류 DTO는 U13/K15 적용 | E48 |
| A20 | 같은 owner 범위의 두 on 연결에 같은 관찰 id; 같은 슬롯 내용을 여러 번 투영한 경우 포함 | 실제 중복 연결이면 오류; 하나의 실행 상태로 자동 공유하지 않음 | E56 |
| A21 | 서로 다른 Component 인스턴스가 같은 on id 사용 / id 없는 연결 실행 중 다시 호출 | 전자는 독립 관찰 상태; 후자는 id가 없어도 해당 연결의 추가 호출 무시; 같은 Action 정의를 호출하는 다른 연결과 상태를 합치지 않음 | E56 |
| A22 | Action 호출 inputs 평가 실패 또는 required 입력 누락·타입 오류 | steps 0개, 정상 output 평가 0회; status:error/running:false/data:null; error에 입력 평가·검증 실패 원인과 문제 입력 식별 정보 유지 | E57 |
| A23 | SetState 성공 뒤 Assert·Query 단계 또는 output 평가/검증 실패 | Action은 실패하고 후속 실행을 중단하지만 완료된 State 변경은 유지; Action 전체를 자동 롤백하지 않음 | E67 |
| A24 | 기존 객체 State {a:1,b:2}에 SetState로 {a:3} 기록 | 결과는 {a:3}; 객체 자동 병합·전체 Store 교체 없음 | E31, E67 |
| A25 | SetState 대상이 없음·미연결·쓰기 금지·Derived·Query data·일반 입력값·계산 결과이거나 새 값 타입 불일치 | 쓰기 오류; 없는 State 자동 생성·Derived 쓰기·Value 변이로 우회하지 않음 | E31, E67 |

## D. UI·구성·서비스 경계

| ID | 입력/행동 | 기대 결과 | 근거 |
|---|---|---|---|
| U01 | required slot에 [] / 선택 slot 생략 | 유효 빈 슬롯 / 빈 내용 | E41 |
| U02 | 외부 슬롯 노드가 /states 값을 읽음 | 작성자 문맥; 수신자 상태로 재바인딩 금지 | E41 |
| U03 | 슬롯에 여러 노드 | 수신 DOM/CSS 배치; 암묵 Column/max1 없음 | E41 |
| U04 | 이벤트 payload 타입 오류 | Action 호출 0회; DOM 이벤트/핸들 비공개 | E41 |
| U05 | when false→true | 폐기 후 새 내부 수명; 외부 State 유지 | E41 |
| U06 | repeat reorder / remove-readd / duplicate key | 상태 유지 / 새 수명 / 오류 | E41 |
| U07 | 단순 Row 간 재배치 / 다른 owner로 이동 | 같은 owner·ID·definition이면 유지 / 새 인스턴스 | E14 |
| U08 | Grid 고정 겹침·범위초과·한 좌표만 | 오류, 자동 밀기 없음 | E41 |
| U09 | Grid repeat·auto 배치 | 고정 먼저 예약, 원래 확장 순서로 전진 전체 사각형 검색 | E41 |
| U10 | when:false 선언 layout ID / 없는 ID | 공간 없음·선언 유효 / 오류 | E41 |
| U11 | 미사용 선언형 Component에 자기 포함 또는 A→B→A 포함 순환을 등록 | 참조/인라인 위치와 무관하게 등록의 정의 검증에서 오류; 실제 인스턴스 생성까지 미루지 않으며 Query 실행 0건 | E13 |
| U12 | 같은 owner의 서로 다른 Row에 동일 노드 id / 서로 다른 Component 인스턴스 안의 동일 로컬 id | 전자는 범위 내 중복 오류, 후자는 독립 인스턴스; Row/Column 배치가 새 이름 공간을 만들지 않음 | E14 |
| U13 | 중첩 repeat에서 바깥·안쪽 항목 별칭을 inputs에 명시하고 부모별로 같은 항목 key 사용 | 서로 다른 별칭의 항목을 함께 읽음; key는 반복 템플릿·부모 항목 아래에서 구분; 항목을 자식 Component에 암묵 주입하지 않음 | E41 |
| M01 | 유효하지 않은 State+구성 일괄 변경 | 부분 적용 0건 | E18 |
| M02 | 구성 적용 후 Query 실패 | 구성 유지, 데이터 오류로 표시 | E18 |
| M03 | A 인스턴스만 변경 | B·공용 원본 자동 변경 없음 | E17, E19 |
| M04 | 공용 정의 DB 수정 | 기존 실행 화면 자동 추종 없음 | E19 |
| M05 | 같은 renderer setResource | 이전 화면 소유 상태/URL 정리, 서비스 상태 유지 | [초기 적용/이관](../spec/09-preserved-contracts.md#초기-적용-완료의-확정-관찰-의미) |
| M06 | 상태 변경 / 현재 화면 구성 변경 / 재사용 리소스 정의 수정 후 변경 정의 추출 | 세 변경 대상 모두 지원; 추출과 실제 DB 저장은 구별하고 서비스의 명시적 저장 연결 없이는 자동 저장하지 않음 | E17 |
| M07 | 에이전트가 목록·설명에서 본 Action 또는 변경 기능 호출 | 서비스가 정한 노출·호출 권한을 같은 코어 경로에서 검사; 목록에 보인다는 이유로 실행 허용하지 않음; 별도 에이전트 상태 엔진을 만들지 않음 | E20, E05 |

## E. URL 연결

아래는 [URL 확정 의미](../spec/09-preserved-contracts.md#url-동기화의-확정-의미)의 인수 항목이다. 실제 실행한 URL 모형·Chromium History·State/날짜 연결의 범위는 항목별 증거에서 확인한다.

| ID | 입력/행동 | 기대 결과 | 근거 |
|---|---|---|---|
| L01 | 서로 다른 직전 State에서 같은 URL을 복원, key 부재/잘못된 값 포함 | 고정 pre-URL baseline에서 유효 값만 덮음; 잘못된 값 진단; baseline missing을 null로 만들지 않음 | E46 |
| L02 | 최초 로드의 초기값·URL·Query·reaction | 초기값 뒤 URL 복원·입력 안정화 후 Query, 중간 조건 조회·초기 reaction 없음 | E46, E26 |
| L03 | URL 지원 scalar·string/number 배열/Set, 객체·Map·객체 Set·미지원 조합 | 전자 codec/타입 복원, 후자 URL 설정 오류; 일반 State 타입 지원과 구별 | E46 |
| L04 | 문자열 "null"·실제 null·빈 문자열·빈 배열·key 부재 | 각 의미 보존, Array/Set 선언 타입에 따라 복원 | E46 |
| L05 | 두 연결이 같은 URL에 쓰기 / 최종 key 충돌 | 최신 URL의 정확한 소유 key patch로 다른 연결·path/hash 보존 / 충돌 오류 | E46 |
| L06 | URL 쓰기 실패 / 길이·목록 크기 초과 | State 유지·동기화 오류, 입력 진단, 조용한 truncation 없음 | E46 |
| L07 | URL 연결 해제 / 명시 setResource 교체 / 교체 URL 정리 실패 | 해제 자체는 URL 보존 / 교체는 이전 소유 key만 replace 정리 시도 / 정리 실패도 새 화면 완료·URL 오류 보고, 새 초기값 유지 | E46, U33 |
| L08 | replace/push 항목 혼합 원자 변경·같은 URL·뒤로/앞으로 복원 | 변경 묶음당 기록 1회, 실제 변경에 push가 있으면 push; 동일 URL 추가 기록·복원 재push 없음 | E46 |
| L09 | A의 느린 URL 쓰기 대기 중 B로 명시 교체 | 라이브러리의 대기/순서 관리와 어댑터의 실제 쓰기 직전 유효성 검사로 A 쓰기 차단; Promise 결과 무시만으로 통과 불가 | E46 |
| L10 | 같은 Store에 서비스 URL 연결과 renderer 편의 연결 중복 | 중복 설정 오류; 공용 연결은 소비 renderer 하나의 폐기로 해제하지 않음 | E46 |
| L11 | 날짜 initial을 기본 시간대 기준으로 계산한 뒤 URL에서 시간대만 다른 값으로 복원 | 최초 계산한 날짜를 유지하고 URL 적용 뒤 날짜 initial을 재계산하지 않음; 날짜·시간대를 정확히 공유하려면 두 값을 URL에 명시 | E46 |
| L12 | 날짜 baseline은 10/14이고 URL은 10/13인 실행에서 사용자가 10/14로 변경해 URL 기록 | 기본값과 같다는 이유로 날짜 key를 삭제·생략하지 않음; 기록한 링크를 새 baseline 10/15인 실행에서 복원해도 명시된 10/14 유지 | E46 |
| L13 | 날짜 key가 없는 링크를 최초 로드하고 초기값·URL 복원만 완료 | key 부재는 해당 실행의 baseline으로 복원; L12의 금지가 모든 초기 기본값의 최초 URL 기록이나 복원 재push를 요구하지 않음 | E46 |

## F. 값 표현·시간·컬렉션·날짜

아래는 기존 승인 의미와 현재 프로젝트 결정의 적합성 사례다. 실행 상태는 항목별 증거를 따르며 [값 계약](../spec/10-value-contracts.md)의 지원 범위와 열린 상세를 함께 적용한다. 예시가 새 시계 API·주기·일반 직렬화 규칙을 확정하지 않는다.

| ID | 입력/행동 | 기대 결과 | 근거 |
|---|---|---|---|
| V01 | 현재 시각을 명시 입력으로 받는 시간 의존 Variable에서 해당 시각 입력 변경 | 의존 계산을 재평가하고 무관한 상태를 변경하지 않음; 특정 시계 API·갱신 빈도는 fixture에서 임의 계약으로 만들지 않음 | E53 |
| V02 | 일반 데이터의 path·call 키 / 동적 값 영역에서 데이터 키 @path를 나타내는 @@path | 전자는 일반 데이터로 보존하고 후자는 값 참조를 실행하지 않고 @path 데이터 키로 해석; 승인되지 않은 위치·재귀 규칙으로 확대하지 않음 | E54 |
| V03 | @path로 숫자·boolean·객체 값을 읽고 같은 값을 formatString에 전달 | 직접 참조는 원래 값 타입을 유지하고 formatString은 문자열을 만듦; 문자열 암묵 보간으로 두 의미를 합치지 않음 | E22, E31 |
| V04 | UI·Query·Datasource의 동적 필드에서 같은 @path/@call 표현 사용 | 공통 값 표현으로 평가하되 해당 리소스 문맥에 허용된 데이터·함수만 사용; HTTP request.path와 값 참조 @path를 혼동하지 않음 | E22, E28 |
| V05 | string "1"과 number 1 / 내용이 같은 객체·배열 / 배열 순서 변경 | 암묵 coercion 없이 타입별 비교; 객체·배열은 내용 비교하고 배열 순서는 비교에 포함 | E58 |
| V06 | Set 삽입 순서 변경 / 저장된 같은 객체 참조와 내용만 같은 별도 객체 원소 비교 | 순서는 무시하며 native membership 적용; 별도 객체를 내용만으로 같은 원소로 취급하지 않음; 격리 전 외부 원본으로 has/delete가 동작한다는 보장은 추가하지 않음 | E58, E59 |
| V07 | Map의 string/number 키·같은 내용의 값·삽입 순서 변경 / 그 밖의 키 타입 | 허용 키와 값은 타입별 재귀 비교하고 순서 무시; string/number 외 키는 오류 | E58 |
| V08 | 객체·배열·Set·Map을 Store에 전달한 뒤 원본 또는 읽기 결과를 직접 변이 | 원본은 동결하지 않고 격리; 읽기 결과는 보호되어 직접 변이로 Store를 변경하지 못하며 오류; 외부 원본과 저장값의 객체 동일성은 보장하지 않음 | E58, E59 |
| V09 | 변경 없이 반복 읽기 / 이후 새 쓰기 뒤 이전 snapshot 읽기 | 변경 없는 읽기는 같은 보호 참조를 유지하고 이전 snapshot은 새 쓰기로 바뀌지 않음; 같은 외부 객체 재입력의 무변경 여부를 객체 동일성만으로 보장하지 않음 | E59 |
| V10 | 유효하지 않은 날짜 입력 / 날짜 덧셈의 소수 증감값 | 날짜 유효성과 정수 증감값을 검증해 오류 처리; 잘못된 입력을 조용히 보정하지 않음 | E60 |
| V11 | YY 파싱 경계 00·68·69·99 | 각각 2000·2068·1969·1999; 임의 새 pivot을 적용하지 않음 | E60 |
| V12 | 승인된 datetime 포맷으로 출력 | YYYY-MM-DD[T]HH:mm:ss.SSS[Z] 형식 적용; 이 포맷 사례를 모든 런타임 State·DTO의 강제 저장 형식으로 확대하지 않음 | E60 |
| V13 | 기존 State 값 전체를 undefined로 명시 교체 / 초기값 미지정 / 타입이 허용한 null 저장 | undefined 쓰기는 오류·기존 값 유지이며 삭제로 해석하지 않음; 초기값 미지정과 구별; null은 실제 값. 객체 속성은 V14–V18, 배열 원소는 V19–V22, Set 원소는 V23–V26, Map 값은 V27–V30, 초기값 없는 State 읽기는 V31–V35 | U02 |
| V14 | 선택 속성 name을 가진 객체 `{ name: undefined, age: 20 }` 입력 | `{ age: 20 }`으로 정규화하여 검증·저장; 원본 객체의 name 속성은 삭제하거나 원본을 freeze하지 않음 | U03, E59 |
| V15 | 필수 속성 name을 `{ name: undefined }`로 전달하여 기존 State 교체 | 정규화 후 필수 속성 누락 오류; 기존 State 값 유지 | U03 |
| V16 | nullable name에 `{ name: null }` 입력 / null을 허용하지 않는 name에 같은 입력 | 전자는 name:null 보존, 후자는 타입 오류; null을 필드 생략으로 바꾸지 않음 | U03 |
| V17 | `{ profile: { name: undefined } }` 또는 `[{ name: undefined }]` 입력; 해당 빈 객체를 허용하는 타입 | 각각 `{ profile: {} }`, `[{}]`; 빈 객체·배열 길이·원소 위치 보존. 배열 원소 자체의 undefined를 허용한 사례가 아님 | U03 |
| V18 | 선택 속성 name에 대해 `{ name: undefined }`와 `{}` 저장값 비교 / 입력 키를 열 목록으로 사용하는 호스트 | 두 입력의 정규화된 저장값은 같고 name 키를 유지하지 않음; 열 목록이 필요한 호스트는 정규화 전에 별도로 보존 | U03, E58 |
| V19 | `[10, undefined, 30]` 입력; 원소 타입은 null도 허용 | 오류; 원소 제거·null 치환 없음, 호출자의 원본 배열 유지 | U04, E59 |
| V20 | `[10, , 30]`, `new Array(2)` / `[]` 입력 | 빈 슬롯이 있는 앞의 두 배열은 오류; 빈 배열은 해당 타입이 허용하면 유효 | U04 |
| V21 | `[10, null, 30]`을 null 허용·불허 원소 타입에 각각 입력 | 허용 타입에서는 길이·위치·null 보존; 불허 타입에서는 타입 오류 | U04 |
| V22 | `{ rows: [[10, undefined]] }`로 기존 State 교체 | 중첩 배열도 오류·쓰기 전체 거절·기존 State 유지; 일부 정규화 결과를 적용하거나 원본을 수정하지 않음 | U04, E59 |
| V23 | `new Set([1, undefined])`로 기존 State 교체; 원소 타입은 null도 허용 | 오류·쓰기 전체 거절·기존 State 및 원본 Set 유지; 원소 제거·null 치환 없음 | U05, E59 |
| V24 | `[{ selected: new Set([undefined]) }]` 입력 | 중첩된 Set도 undefined 원소 오류; 빈 Set으로 바꾸어 수용하지 않음 | U05 |
| V25 | `new Set([null])`을 null 허용·불허 원소 타입에 각각 입력 | 허용 타입은 명시 null 원소 보존, 불허 타입은 타입 오류 | U05 |
| V26 | `new Set([{}, { name: undefined }])` 입력; 정규화된 빈 객체를 허용하는 원소 타입 | 두 번째 객체의 name 속성만 생략하고 두 객체 원소 유지; 정규화 후 내용이 같다고 병합하지 않으며 원본 객체도 수정하지 않음 | U03, U05, E58, E59 |
| V27 | `new Map([["a", undefined]])`로 기존 State 교체; 값 타입은 null도 허용 | 오류·쓰기 전체 거절·기존 State 및 원본 Map 유지; 엔트리 제거·null 치환 없음 | U06, E59 |
| V28 | `new Map([["a", null]])`을 null 허용·불허 값 타입에 각각 입력 | 허용 타입에서는 a 키와 명시 null 보존, 불허 타입에서는 타입 오류 | U06 |
| V29 | `new Map([["a", { name: undefined }]])` 입력; 빈 객체를 허용하는 값 타입 | a 키와 엔트리 한 개를 유지하고 객체 값만 `{}`로 정규화; 원본 Map·객체 유지 | U03, U06, E59 |
| V30 | `{ lookup: new Map([["a", undefined]]) }` 입력 | 중첩된 Map 값도 오류; 빈 Map으로 바꾸거나 일부만 적용하지 않음 | U06 |
| V31 | initial을 생략한 State를 등록하고 값을 쓰기 전에 JS에서 읽기 | 정상 읽기로 undefined 반환; core는 등록된 State의 missing을 유지하며 임의 기본값을 생성하지 않음 | U07 |
| V32 | string 또는 null을 허용하는 State에 `"device-1"`, 이어서 null을 쓰고 각각 읽기 | 각 쓰기 뒤 실제 문자열·명시 null 반환; null을 missing으로 해석하지 않음 | U07 |
| V33 | 해당 소유 범위에 등록하지 않은 State 이름을 읽기 | 참조 오류; undefined 반환으로 오류를 숨기거나 State를 자동 생성하지 않음 | U07 |
| V34 | missing State의 JS 읽기로 얻은 undefined를 State 값 전체로 쓰기 | 쓰기 오류; 대상이 missing이면 missing 유지, 값이 있었다면 기존 값 유지 | U02, U07 |
| V35 | 각 타입이 허용하는 State에 0·false·빈 문자열을 쓰고 읽기 | 각각 실제 값 반환; truthiness로 missing 또는 undefined로 바꾸지 않음 | U07 |
| V36 | NaN·Infinity·-Infinity를 각각 State에 쓰기; 선언 타입은 number 또는 null | 모두 오류·쓰기 전체 거절·기존 값 또는 missing 유지; 0·null·문자열로 치환하지 않음 | U08 |
| V37 | `{ ratio: NaN }`, `[Infinity]`, `new Set([-Infinity])`, `new Map([["ratio", NaN]])` 입력 | 중첩 비유한 숫자도 오류; 필드·원소·엔트리 제거 및 원본 수정 없음 | U08, E59 |
| V38 | Map의 숫자 key로 NaN·Infinity·-Infinity 각각 입력 / string key `"Infinity"` 입력 | 숫자 key는 오류; 문자열 key는 문자열로 보존하며 숫자로 변환하지 않음 | U08, E58 |
| V39 | 표현식·변환의 결과가 NaN 또는 양·음의 Infinity이며 이를 core 데이터로 수용 | 결과 검증 오류; 해당 계산의 기존 실패 전파 계약 적용, 정상 성공 데이터로 수용하거나 기본값으로 치환하지 않음 | U08 |
| V40 | 유한한 0·-1·1.25 / 문자열 `"NaN"`·`"Infinity"` 입력 | 숫자는 유한성 검사를 통과하고 나머지 스키마를 검증; 문자열은 문자열 허용 타입에서 그대로 유지 | U08 |
| V41 | integer로 -9007199254740991·0·9007199254740991 입력 | 공통 integer 범위 검사 통과; 선언 스키마의 추가 제약도 적용 | U09 |
| V42 | integer State에 -9007199254740992·9007199254740992·1.5 각각 쓰기 | 범위 또는 정수 타입 오류; 기존 값 또는 missing 유지, 반올림·잘라내기·범위 제한·문자열 치환 없음 | U09 |
| V43 | integer에 `"42"` / string에 `"9007199254740993"` 입력 | 전자는 타입 오류; 후자는 해당 문자열 스키마를 만족하면 정확한 문자열로 보존; 암묵 숫자 변환 없음 | U09, E58 |
| V44 | integer 속성 count 또는 integer 배열 원소에 9007199254740992를 포함한 State 교체 | 중첩 위치도 범위 오류·쓰기 전체 거절·기존 State 및 원본 유지 | U09, E59 |
| V45 | 계산 결과 9007199254740992를 integer로 수용 | 결과 검증 오류; 실행기의 더 넓은 정수 지원 여부와 무관하게 공통 범위 적용 | U09 |
| V46 | number State에 JS `0.1 + 0.2`의 결과 / 호출자가 명시적으로 반올림한 `0.3`을 각각 쓰고 읽기 | 각각 `0.30000000000000004` / `0.3`을 유지; core가 자릿수를 자동 보정하지 않음 | U10 |
| V47 | 객체 속성·배열/Set 원소·Map 값·숫자 key에 `0.30000000000000004`를 포함한 값 수용 | 중첩 위치도 해당 binary64 숫자 유지; 추가 소수 반올림·절사 없이 원본 보호 | U10, E59 |
| V48 | 유한한 `1e100`을 number / integer로 각각 수용 | number 표현·유한성 검사는 통과하고 나머지 스키마 검증; integer는 안전 정수 범위 오류 | U08, U09, U10 |
| V49 | JS `Number.MAX_VALUE * 2`의 결과를 number State에 쓰기 | Infinity로 U08 오류·쓰기 전체 거절·기존 값 또는 missing 유지; 최댓값 제한·null 치환 없음 | U08, U10 |
| V50 | 0을 허용하는 number·integer State에 `-0`을 초기값 또는 쓰기로 전달한 뒤 읽기 | 양의 `0` 반환; JS Object.is로 읽은 값과 -0을 비교하면 false | U11 |
| V51 | 기존 값이 `0`인 State에 `-0` 쓰기 | 값 변경 없음; 이 차이만으로 updated 통지·의존 계산·reaction·Query 재실행 없음. 정의·수명 교체의 replaced는 별도 계약 유지 | U11, E45, E58 |
| V52 | 객체·배열·Map 값의 `-0`, 서로 다른 `{ x: -0 }`·`{ x: 0 }` 객체를 원소로 갖는 Set 수용 | 중첩 숫자는 0으로 정규화하고 원본은 수정하지 않음; 객체 Set 원소 두 개는 같은 내용이 되어도 합치지 않음 | U11, E58, E59 |
| V53 | `new Set([-0, 0])`, `new Map([[-0, "numeric"], ["-0", "text"]])` 수용 | Set에는 숫자 0 하나; Map에는 숫자 0과 문자열 "-0"의 두 엔트리 유지 | U11, E58 |
| V54 | JS `Math.round(-0.1)`의 결과 / 숫자 `-0.0001` / 문자열 `"-0"` 수용 | 각각 숫자 0 / 숫자 -0.0001 / 문자열 "-0"; 실제 -0만 정규화하며 추가 반올림·coercion 없음 | U10, U11 |
| V55 | 0보다 큰 값만 허용하는 State에 `-0` 쓰기 | 정규화한 0에 대한 스키마 오류; 쓰기 전체 거절·기존 값 또는 missing 및 원본 유지 | U11 |
| V56 | BigInt·Symbol·함수·Promise·WeakMap·WeakSet을 State 값 전체나 객체·배열·Set·Map 값 안에 전달 | 미지원 값 오류·쓰기 전체 거절·기존 값 또는 missing 및 원본 유지; 변환·삭제·데이터 함수 호출·Promise 대기 없음 | U12 |
| V57 | 등록된 코드형 Action 함수와 실행 완료 Promise / 데이터 필드에 담긴 동일 종류의 값 | 전자는 기존 실행 계약을 따르고 완료된 실제 출력값을 검증; 후자는 미지원 데이터 오류. 함수 등록·비동기 실행을 데이터 거절과 혼동하지 않음 | U12, E42 |
| V58 | 자기 자신을 속성·원소·Map 값으로 포함하는 객체·배열·Set·Map, 상호 순환 구조 | 순환 데이터 오류·부분 수용 없음; 무한 순회나 순환 부분 자동 삭제 없음 | U12 |
| V59 | 같은 객체 a를 두 위치에서 사용하는 비순환 배열 `[a, a]` | 두 위치를 가진 유효 데이터로 수용하고 나머지 스키마 검증; 순환 오인·원소 합치기 없음, 기존 격리·snapshot 계약 유지 | U12, E59 |
| V60 | number State의 `0.3`을 `0.30000000000000004`로 교체 / 객체의 속성 나열 순서만 바꿔 재입력 | 전자는 값 변경으로 판정하고 기존 반응·실행 조건 적용; 후자는 내용이 같으면 값 변경 없음. epsilon·속성 순서를 변경 기준으로 추가하지 않음 | U12, E58 |
| V61 | number에 문자열 `"42"`, boolean에 문자열 `"false"` 전달 | 타입 오류; 숫자 변환·truthiness 변환 없이 기존 값 유지 | U12, E58 |
| V62 | default가 있는 필수 객체 속성 누락 / 스키마가 금지한 추가 속성 포함 | 각각 누락 / 추가 속성 오류; default 주입·속성 삭제로 성공시키지 않고 원본과 기존 State 유지. 선택 속성의 default도 자동 주입하지 않음 | U12, E41 |

## G. 정적 연결·최초 적용 완료

아래의 적용 완료는 이전 API의 승인된 관찰 의미다. application·DOM ack의 독립 실행 상태는 항목별 증거를 따른다. 새 SDK 함수명·필수 Promise 시그니처·이행 프로토콜은 이 표가 추가 확정하지 않는다.

| ID | 입력/행동 | 기대 결과 | 근거 |
|---|---|---|---|
| N01 | 모든 정의가 inline이고 정적 데이터만 쓰는 화면을 서비스 조회 콜백 없이 적용 | 리소스 조회·Query 실행 콜백이 없다는 이유만으로 실패하지 않음 | E68 |
| N02 | 실제 참조 조회 또는 서비스 Query 실행이 필요한 구성인데 해당 연결이 없음 | 필요한 연결 누락을 명확한 오류로 알림; 임의 데이터·성공값으로 대체하지 않음 | E68 |
| N03 | 최초 실행 가능한 Query 중 하나는 먼저 성공하고 다른 하나는 아직 진행 중 | 준비된 UI는 먼저 표시; 적용 완료 통지는 실행 가능한 최초 조회·화면 반영의 첫 주기가 정리될 때까지 기다림 | E61 |
| N04 | 최초 Query 일부 오류 / 외부 입력 미준비 또는 executeWhen으로 대기하는 Query | 개별 Query 오류는 해당 화면의 오류로 정리하며 구조 적용 실패로 취급하지 않음; 실행할 수 없는 대기 Query 때문에 적용 완료를 무기한 막지 않음 | E61 |
| N05 | 새 리소스 준비 중 구조·참조·타입·소유 충돌로 적용 실패 | 기존 화면·Store를 유지하고 새 구성을 부분 적용하지 않음; 전환 후 개별 Query 실패와 구별 | E61, E18 |

선택 차트 모듈의 인수 백로그와 제한 프로필의 실행 증거는 [차트 계약](../spec/11-optional-charts.md)을 따른다. core 인수 통과나 전체 차트 옵션 지원으로 합산하지 않는다.

## 실행 준비와 기록 형식

1. fake clock·제어 가능한 Promise/HTTP 실행기를 사용해 순서·늦은 응답·dispose를 재현한다. 이는 테스트 도구 제안이다.
2. fixture의 기대값과 의미를 먼저 고정한다. SDK 미결을 해결하면서 ID는 유지한다.
3. JS core를 DOM 없이 검증한다. Svelte 통합 테스트는 별도이며 UI 성공만으로 core 계약 통과로 보지 않는다.
4. 라이브 인증정보 없이 가짜 secret resolver로 유출·권한 경계를 검증한다.
5. 각 항목의 `구현 파일 / 테스트 파일 / 실행 명령 / 결과 / 남은 공백`을 항목별 증거에 기록한다. 없는 실행 증거를 문서 기대값으로 대신하지 않는다.
6. 과거 요구의 누락 검사는 [MIG 행렬](../history/patchboard-migration.md)을 사용한다. 선택 차트 모듈의 적합성은 core 테스트와 별도다.


## H. U13 일괄 구체화 인수 사례

**설계 기대값이며 실행 상태는 항목별 증거를 따른다.** Q1–Q3은 U14에서 승인한 현재 규칙을 적용한다. K05 동적 코드 Action은 U35에서 부모에 연결된 문맥 호출과 독립 외부 호출로 구분했다. 제품 검증은 [대응표](core-acceptance-coverage.json)와 [실행 결과](core-verification-results.json)를 따른다.

| ID | 입력/행동 | 기대 결과 | 근거 |
|---|---|---|---|
| K01 | 같은 Component/Query/Derived를 ref와 해당 인라인 본문으로 각각 사용; 둘 다 지정 | 전자는 같은 입력·검증 의미, 후자는 XOR 오류. 주변 상태 암묵 캡처 없음 | U13, O01 |
| K02 | optional Value 입력 생략·default 있음 / 명시 null / required:true+default / State default | 생략에만 default. null은 실제 값 검증. 뒤 두 선언은 오류 | U13, O02 |
| K03 | required 입력 연결이 missing/pending인 자동 Query와 명시 Action | 자동은 waiting, 명시 호출은 INPUT_NOT_READY·단계 0회. default로 덮지 않음 | U13, O02 |
| K04 | 현재 값 1인 number 셀→integer State 포트 / 같은 공통 Type의 missing 셀 | 전자는 계약 불일치, 후자는 연결 후 준비 상태를 별도 판정. 후속 쓰기에도 검증 | U13, O03 |
| K05 | 미사용·조건 분기·인라인 안의 Query 순환/Action 재귀 / 코드 하위 호출 / 비순환 공통 하위 참조·외부 독립 호출 | 선언형 순환은 등록 오류; 문맥 하위 호출은 await 이후에도 부모 스택의 재귀 거절. 비순환 재사용·외부 독립 호출 허용. 정의 검사 중 실행 없음 | U13, U35, O04 |
| K06 | 미지원 스키마 키워드·외부 $ref·native 확장을 모르는 일반 검증기 | 등록 오류 또는 부적합 판정; 조용히 검증을 생략하지 않음 | U13, O07 |
| K07 | @path가 `{"@call":"..."}` 데이터를 반환 / @@ 해제 후 예약 키 / 혼합 연산자 객체 | 반환 데이터·해제 결과 재실행 없음; 원래 문법이 잘못된 혼합 객체는 오류 | U13, O07 |
| K08 | missing·pending·ready:null·error의 상세/간단 읽기 | 상태 구별; 간단 읽기는 undefined·VALUE_PENDING·null·원인 오류 순으로 처리 | U07, U13 |
| K09 | Header 대소문자 충돌·요청 null 제거 / params 빈 문자열·배열·중첩 객체 | 동명 비교·명시 제거, 빈 문자열 보존·키 반복, 미지원 params 오류 | U13, O08 |
| K10 | body 생략·명시 null·잘못된 JSON 응답·3xx·GET body | 본문 없음/JSON null 구별; 나머지는 정해진 요청·응답 오류. redirect 추종 없음 | U13, O08 |
| K11 | 독립 호출 두 개의 Login / Login 실패·계획 timeout·늦은 응답 | 진행 중 Login 공유 없음; Login 실패이면 실제 API 요청 시작 없음. TIMEOUT 뒤 결과 미반영·secret 비노출 | U13, O08 |
| K12 | refresh:false Query에 RefreshQuery / gate false의 명시 갱신 | QUERY_REFRESH_DISABLED / EXECUTION_BLOCKED, 후속 Action 중단·이전 외부 효과 비롤백 | U13, O09 |
| K13 | active 중 refresh 두 번, pending 시작 후 다시 refresh, 도중 입력 변경 | 시작 전 두 호출은 같은 후속 실행, 시작 후 호출은 그 다음 실행. 오래된 입력의 완료로 성공시키지 않음 | U13, O09 |
| K14 | error Query의 retry·refresh:false / 닫힌 gate·폐기된 호출의 retry | error 상태의 1회 재시도만 갱신 제외 우회. gate·수명·권한은 그대로 거절 | U13, O09 |
| K15 | Assert true의 실패 가능한 message 표현식 / false의 생략 message | true면 message 미평가. false면 ASSERTION_FAILED와 기본 문자열, 후속 단계 없음 | U13, O10 |
| K16 | 취소된 코드 Action이 보유한 State/Query 핸들로 새 요청; 늦은 반환 | 새 쓰기·갱신 거절·늦은 결과 폐기. 다른 호출·공유 대상은 살아 있음 | U13, O10 |
| K17 | 같은 name의 다른 scope 관찰, 셀 replace/remove 뒤 옛 핸들 사용 | 주소별 격리·replaced/removed 구별·옛 핸들 거절·새 논리 주소 구독 유지 | U13, O11 |
| K18 | 별개 owner가 동일 셀 target reaction 등록 / 초기·URL 복원 / 명시 target 쓰기 | 중복 거절, 초기·복원 reaction 없음, 같은 배치 명시 쓰기 우선 | U13, O11 |
| K19 | URL 중복 소유 key·한도 초과·다른 소유자 key·동일 baseline 값 쓰기 | 잘못된 입력 진단·baseline, 출력 초과는 State 유지·부분 URL 쓰기 없음. 외부 key 보존·동일 baseline 자동 생략 없음 | U13, O11 |
| K20 | URL 비동기 쓰기 대기 중 새 쓰기·복원·View 교체 | 실제 commit 직전 isCurrent가 옛 쓰기를 차단. 완료 Promise 무시만으로 통과 처리하지 않음 | U13, O11 |
| K21 | 같은 노드 repeat+when, 숨겨질 항목의 중복 key, 중첩/형제 as 중복 | 항목 문맥에서 when 평가·false의 inputs/Query 없음. 전체 key 중복·중첩 shadowing 오류, 형제 별칭 허용 | U13, O12 |
| K22 | Join의 복합키·다중 매칭·null/누락 키·필드 충돌 / 빈 Concat.with | 정해진 엄격 매칭·행 순서·오른쪽 덮어쓰기, null 비매칭·누락 오류. 빈 Concat은 항등·snapshot 보호 | U13, O13 |
| K23 | mount/update/replace의 구조 실패·개별 Query 실패·완료 전 교체 | 구조 실패는 기존 화면 보존·데이터 Query/Action 실행 없음. Query 오류는 initial 보고에 포함, 옛 initial은 CANCELLED | U13, O14 |
| K24 | 명시 Clock 입력 갱신·owner 폐기·State reset | 관련 입력 의존만 갱신, 구독 해제, reset은 고정 초기 snapshot. 숨은 tick/현재 시각 재초기화 없음 | U13, O06 |

## U14. 세 중요 결정의 추가 인수 기준

아래도 구현·실행 전의 기대값이다. Q1–Q3의 사용자 수락과 실제 테스트 통과를 구별한다.

| ID | 입력/행동 | 기대 결과 | 근거 |
|---|---|---|---|
| K25 | 자동 Query의 입력 A 성공 후 B 실패 / 최초 실행 실패 | 전자는 A의 data·dataInputs 보존, error/stale:true와 이전 결과 표시. 후자는 data·dataInputs missing, stale:false | U14, D68 |
| K26 | null·false·0·빈 문자열·빈 배열 성공 후 갱신 실패 | 각 실제 성공값을 보존. truthy 검사로 missing으로 바꾸지 않음 | U14, D68 |
| K27 | 실패 후 retry running→성공 / 다시 실패 | 실행 시작 시 error:null, 이전 snapshot/stale 유지. 성공 시 data·dataInputs 원자 교체·stale:false, 재실패 시 이전 쌍과 새 오류 | U14, D68 |
| K28 | source 일부만 성공 / 보존 data가 있는 refresh·명시 Action Query 실패 | 부분 결과를 전체 성공에 승격하지 않음. fresh 호출은 오류로 종료하고 Action 후속 단계 중단. 명시 호출에 옛 data 반환 없음 | U14, D68 |
| K29 | 입력 변경·취소·owner 폐기 뒤 오래된 실행의 성공/실패 | 현재 data·dataInputs·status·error 오염 없음. 새 수명에 옛 성공 snapshot 자동 승계 없음 | U14, D68 |
| K30 | date `2026-10-29`, time `09:30`, datetime `2026-10-29T09:30:00+09:00` | 날짜 유지, `09:30:00.000`, `2026-10-29T00:30:00.000Z`. JS Date는 명시 호스트 변환 없이 날짜 값으로 수용하지 않음 | U14, D69 |
| K31 | 잘못된 달력 날짜·offset 없는 datetime·초과 정밀도 / 일반 string의 날짜 유사 값 | 날짜 타입에서는 거절·기존 값 유지. 일반 string은 자동 날짜 검증·정규화하지 않음 | U14, D69 |
| K32 | 같은 절대 시점의 서로 다른 offset 쓰기 / 날짜 HTTP·URL 왕복 | 날짜 정규화 후 같으면 State 변경 없음. 문자열 codec 왕복 및 대상 스키마 재검증, date/time의 임의 시간대 변환 없음 | U14, D69 |
| K33 | 지역 날짜 계산의 시간대 인자 누락·미준비·잘못된 이름 / 기기 시간대 변경 | 정의 오류·기존 입력 대기/INPUT_NOT_READY·값 오류로 구별. 명시 업무 시간대가 같으면 기기 시간대가 결과를 바꾸지 않음 | U14, D69 |
| K34 | `America/New_York`의 2026-03-08 02:30 / 2026-11-01 01:30을 지역 시각으로 변환 | 각각 존재하지 않거나 모호해 오류. 지역 다음 날 경계를 고정 24시간 덧셈으로 대체하지 않음 | U14, D69 |
| K35 | 날짜 x-viewstem-type / 표준 format 사용 / null 허용 anyOf | 날짜 형식 검사·정규화, format 등록 오류, 명시 null 분기는 null 보존. 분기별 정규 값이 다른 모호한 조합은 등록 오류 | U14, D69 |
| K36 | 선언형 Try/Catch/Finally 또는 catch/finally 필드 / 등록 코드 Action의 정상 복구·미처리 오류 | 선언형 미지원은 INVALID_DEFINITION. 코드 복구는 유효 output까지 성공하면 성공, 미처리 오류·정리 실패는 실패 | U14, D70 |
| K37 | State 쓰기 후 단계 실패 / 취소를 catch한 코드의 늦은 반환·핸들 쓰기 | 완료한 쓰기·외부 효과 유지, 후속 단계 중단. 취소는 정상 반환으로 회복되지 않고 호출 핸들 쓰기는 거절 | U14, D70 |

## 독립 실험의 날짜별 기록

이하 U15–U33은 구현 전 증거다. 당시의 검사 수·실패·미구현 범위를 보존하며 최신 제품 결과로 해석하지 않는다.

## U15. T1 부분 실험의 실행 증거

실행 명령·정확한 결과는 [T1 보고서](t1-experiment-2026-10-29.md)와 [실험 README](../../experiments/t1-values/README.md)를 따른다. 아래 대응은 인수 항목 전체를 통과 처리하는 표시가 아니다. 예를 들어 정규화 함수의 거절을 확인해도 State의 기존 값 보존·통지 억제까지 증명한 것은 아니다.

| 관련 인수 범위 | 실제 실행한 범위·위치 | 아직 검증하지 않은 부분 |
|---|---|---|
| V13–V30, V36–V59, V61–V62의 값 수용 부분 | run.mjs의 value/nested/object/array/set/map/cycle/graph/integer/number, schema-probe.mjs의 S03–S11 | State 원자 쓰기·기존 값/준비 상태 유지·모든 중첩 스키마·통지·snapshot 수명 |
| K06 스키마 subset | profile guard의 미지원 키워드/외부·순환 ref 거절, raw native 키워드 무시 재현 | 모든 native 확장·조합·로컬 참조 컴파일, 선언 계약 동등성 |
| K08 준비 상태와 계산 | run.mjs의 지연 missing/pending/error 입력 접근 결과/횟수 | State read/snapshot DTO·참조 오류·오류 분류·의존 재평가 |
| K30–K34 날짜 | 날짜 문자열·잘못된 입력·같은 시점·JSON 왕복·시간대/DST를 실제 실행 | State 변경 감지, 실제 HTTP/URL 경계, Dart 날짜 및 전체 지역·연도 |
| K35의 일부 | nullable 날짜와 format 등록 거절 | 날짜 정규화가 포함된 모든 분기·스키마 조합 등록 검증 |
| T1 CEL 계산·실행 제한 | fixtures/cel.json의 JS/Dart 비교, 등록 검사, opaque 타입 함수, Worker 실종료 | 기록한 불일치, 실제 비용 계량·중단, 브라우저, 전체 함수 카탈로그 |

## U17. T2 Query 경합 부분 실험의 실행 증거

[T2 Query 보고서](t2-query-races-2026-10-29.md)와 [실험 코드](../../experiments/t2-query-races/scenarios.mjs)에 실제 결과를 연결한다. 36개 시간순 사례, 4개 보호 장치 제거 대조군, 100개 seed 반복은 독립 프로토타입 검증이며 아래 인수 ID 전체를 통과로 바꾸지 않는다.

| 관련 인수 범위 | 실제 실행한 범위 | 아직 검증하지 않은 부분 |
|---|---|---|
| Q07–Q08, K29 | R01–R05·R12–R14·R17·R29: 오래된 성공/실패, ABA, pending 축약, 같은 주소의 수명 교체, 완료 직전 폐기 | 복합 Query 결합, 실제 owner/renderer 교체·등록 연결 |
| Q09–Q11, Q18–Q19, K03, K12–K14 | R06–R11·R23–R25·R30–R32: fresh 대기 결합, gate·입력 준비, 갱신 제외·retry, 초기 실행 대기 | 실제 Action·권한·입력 검증, polling interval 타이밍 |
| K11의 timeout 일부 | R16–R19: 단일 가짜 전송의 deadline과 늦은 완료 폐기 | 실제 Login+HTTP 전체 계획·secret 비노출·fetch·응답 파싱 |
| K16의 Query 핸들 일부 | R14–R15·R26: 호출 한정 취소와 공유 Query/다른 owner 보존 | State 쓰기·native Action·하위 호출·권한 |
| K25–K27 | R20–R22: 마지막 성공 쌍·falsy 값·stale·retry·최초 실패 | UI의 이전 결과 표시, 전체 native 값·스키마·Store 연결 |
| K28의 fresh 실패 일부 | R28: refresh를 await한 후속 코드가 실패 시 실행되지 않음 | 복합 source 부분 성공 차단·실제 Action 단계기·명시 독립 Query |

## U18. T2 URL 경합 부분 실험의 실행 증거

[URL 결과](t2-url-races-2026-10-29.md)와 [fixture](../../experiments/t2-url-races/scenarios.mjs)를 따른다. Node 22/24와 실제 Chromium에서 36개 대표 사례·6개 대조군을 실행했다. 전체 core 인수 ID의 완료로 변경하지 않는다.

| 관련 인수 범위 | 실제 실행한 범위 | 아직 검증하지 않은 부분 |
|---|---|---|
| L09, K20 | U01–U02·U05–U09·U31·U34: 최신 쓰기, 미반영 key 합치기, 복원/폐기/교체, 비동기 준비 뒤 검사, ABA | 실제 Store·renderer의 수명/변경 묶음 연결, 서비스 router |
| L01, L04, L08, K19 | U16–U18·U20–U22·U27·U32·U35–U36: baseline·missing/null·동일값·기록 방식·실제 뒤로/앞으로 | 날짜와 초기 계산, 전체 schema·reaction/Query 순서 |
| L03, L06, K19 | U11–U15·U19·U24–U26·U28·U30: 지원 값 일부·byte/item 제한·실패 시 State 보존·한 번 인코딩 | 날짜 codec·모든 nullable/스키마 조합·실제 StateStore 원자성 |
| L05, L07, L10, M05의 일부 | U03–U04·U06–U08·U23·U29: 최신 URL·정확한 소유 key·서비스 연결 보존·중복 연결 거절 | 전체 renderer 교체 사전 검증·URL 정리 실패·공유 Store 소비 수명 |

## U19. HTTP 환경 대조의 첫 실패

[HTTP 헤더 검증](t2-http-boundary-2026-10-29.md)에서 Node/Chromium의 사용자 정의 헤더와 Node의 Host 보존 대조는 통과했지만 Chromium의 명시 Host는 오류 없이 무시됐다. 당시 headers 프로필에 실행 환경의 금지/관리 헤더 처리가 빠져 있었고, 발견 즉시 후속 검증을 중단했다. 이 헤더 경계는 아래 U20에서 보완했다. HTTP·인증 인수 항목을 통과로 변경하지 않는다. 실험의 `H04-browser-host-header`는 이 표의 H04(비밀값 경계)와 별개의 사례 ID다.


## U20–U28. HTTP·오류 정제·동적 값과 CEL 크기 검증

[HTTP 실험 기록](t2-http-boundary-2026-10-29.md)의 코드·명령·환경·결과를 따른다. U20의 P21 실패는 API 책임을 실행기 책임으로 잘못 정한 기대값으로 U21에서 정정했다. Node 22/24 각각 기존 헤더 126/126 증거 유지, 현재 HTTP 261/261 통과이며 별도 Node/Chromium 실제 전송 대조는 각 실행에서 174/174 통과다. P71 baseUrl까지 수정했고 [U28의 17개 동적 위치 점검](t2-path-audit-2026-10-30.md)은 각 실행 304/304, 고의 결함 검사는 Node 24에서 6/6 탐지했다. CEL 배열 크기는 별도 18/18 통과다. 기존 인수 ID의 전체 통과로 바꾸지 않는다.

| 관련 인수 범위 | 실행한 부분 | 남은 범위 |
|---|---|---|
| K09, H07 | 헤더 금지 이름·접두사·null·병합 우회 차단, 허용 헤더 병합/제거/수신; H07 공통 경로·요청 우선 | 실제 core/서버 adapter 통합, 전체 입력 값 프로필 |
| H05–H08 | P03–P06: Login 독립 구성·호출별 토큰·누락/비문자열/빈 토큰/실패/redirect 차단 | 전체 공통 표현식/날짜·서비스 인증 구현 |
| K10–K11 일부 | P09–P19 및 T01–T07: Login+API timeout·취소, Node/실제 Chromium의 본문·응답·redirect·native timer 대조 | 실제 core 상태 반영, 다른 브라우저·CORS/서비스 통합 |
| H03–H04 일부 | P02/P07/P14/P20/P23–P28: 내부 결과/로그 혼입 없음, resolver/권한/전송 오류 정제, 거절된 참조·목적지·경로·최종 query의 전송 차단 | 실제 서비스 권한·secret 저장소 |
| U21 책임 구분 | P21–P22: API가 반환한 body/headers는 값이 secret과 같아도 기본 필터 없이 전달 | API 자체 응답 보안은 API 책임이며 Viewstem 결함으로 합산하지 않음 |
| H05 및 평가 문맥 일부 | P29–P33: 금지 루트·중첩 함수 접근 차단, 잘못된 Pointer 거절, 정상 응답 body/header·이스케이프 키의 토큰 추출 | 전체 표현식/리소스 문맥과 실제 core 통합 |
| 공통 오류 일부 | P34–P38: opaque 예외·getter·Proxy·형 변환·늦은 예외 정제, TIMEOUT/CANCELLED 유지 | 실제 core 전체 오류/진단 표면 |
| V04 경로 일부 | P39–P44 및 T08 정상 객체 속성·배열 인덱스 유지, 배열 length·추가 속성·비정규 인덱스 거절 | 전체 표현식·core 통합 |
| CEL 크기 일부 | array-size-tests.mjs: 고정 cel-js의 두 size 문법·조건식·필터 결과·안전 정수 변환 18/18 | 실제 Variable/Derived·Dart·브라우저 CEL·전체 컬렉션 |
| HTTP params 일부 | P45–P49 및 T09: 각 선언을 병합 전 검사해 잘못된 컨테이너 거절, 정상 객체·요청 우선·반복 값·키 제거 유지 | 전체 DTO·core 통합 |
| V04 동적 headers 일부 | P50–P60 및 T10: 전체 참조 정상, 정적/동적 금지 이름·중복·값 검사, null 제거·반환 데이터 비재실행 | 전체 표현식과 실제 core 통합 |
| V04 동적 request.path 일부 | P61–P70 및 T11: 경로 참조·기존 주소/공통 경로/권한 검사·Login·secret 문맥·취소 유지 | 실제 core 통합 |
| V04 동적 baseUrl·method·Login 전체 | P71·T12 및 17개 위치 양성/혼합문법 음성: 선택한 baseUrl 평가·fallback·method·Login 전체 request, 기존 주소/권한/헤더 유지 | 실제 core·서비스 연결 |
| V02–V04, K08 공통 표현식 일부 | U28 경로 점검: @@·재귀·반환 데이터 비재실행·Pointer·문맥·missing/타입 오류·concat/formatString, 고의 결함 6종 탐지 | State/Action/UI·대상 핸들·반응형 snapshot·추가 함수 등록 |

P21의 기존 실패는 책임 정정, P30/P35/P41/P46/P51/P61/P71은 수정·검증으로 현재 실패에서 제외하고 이전 소스·결과를 보존했다. U28은 현재 HTTP 실험의 모든 동적 위치를 조사한 범위이며 미구현 SDK·core·renderer 전체 통과가 아니다. 기존 계약의 버그는 추가 질문 없이 수정·검증한다.

## U29. Query와 실제 HTTP 연결 검증

[연결 실험 기록](t2-query-http-2026-10-30.md)의 39개 사례·4개 고의 결함을 Node 22/24에서 각각 확인했다. 기존 Query·HTTP 독립 실험의 소스는 그대로이며, 단일 직접 HTTP source를 연결한 범위다. 인수 ID 전체의 통과가 아니다.

| 관련 인수 범위 | 실행한 부분 | 남은 범위 |
|---|---|---|
| Q07–Q08, Q11, K13, K29 일부 | I02–I14, I19, I23, I26, I28: 실제 Login/본문 지연·입력 세대·fresh 대기·소유 수명/호출자 취소·후속 완료 차단 | 실제 core·Action 호출 수명·복합 Query |
| K25–K26 일부 | I01 7종, I13, I18, I21, I24: 실제 성공/실패의 data/dataInputs·stale·snapshot 보호·대기자 오류 전파 | 복합 source/transform의 원자 결과·서비스 표시 |
| H03–H05, K11 일부 | I10–I16, I18, I20, I25, I27: Login 독립·실패·계획 deadline·secret 비혼입·HTTP abort와 Query의 결합 | 실제 서비스 권한·secret 저장소·브라우저/Dart |
| K03, K12, K14 일부 | I06–I07, I17, I29: 미준비/gate의 전송 0건·refresh 제외·retry와 실제 HTTP 연결 | 포트 스키마·전체 Action 후속 단계 |
| U21 책임 구분 | I22: API가 명시한 credential echo를 Query data로 보존 | API 응답 내용의 결정은 API 책임 |

현재 연결 범위에 실패는 없다. 완료 기준 polling·URL/날짜 통합·일반 Query DSL·core/renderer는 미검증이며 새로 구현하지 않았다.

## U30. 복합 Query·완료 기준 polling

[전체 범위와 증거](t2-composite-polling-2026-10-30.md)에 따라 Node 22/24 각각 복합 48/48·고의 결함 5/5, polling 34/34·고의 결함 7/7, 실제 timer/HTTP 1/1을 확인했다. 복합 48건에는 실제 HTTP 요청 7건의 H01 연결 시나리오가 포함된다. 기존 Query 36개·100 seed와 Query–HTTP 39개도 공유 소스 변경 뒤 다시 통과했다.

| 관련 인수 범위 | 실행한 부분 | 남은 범위 |
|---|---|---|
| Q01–Q06, Q14, Q20, K05 일부 | 복합 C01/C15–C22/C25·S01–S11: 명시 입력·ref/inline·형제 독립·필수 입력/순환 거절·Concat/Join 타입/순서/다중매칭 | 전체 등록/스키마·모든 입력 프로필·Action 재귀 |
| Q07–Q08, Q11, Q16–Q17, Q22, K13, K25–K29 일부 | 복합 C02–C14/C16/C23: 유효 하위 결과 재사용·전체 성공·source/transform 오류 위치·fresh 구분·owner 정리 | 직접 HTTP source 의존성 최적화·core/renderer |
| Q09–Q10, Q12–Q13, Q18–Q19 일부 | polling P01–P27: 완료 기준 interval·실패/timeout·active/pending·조건·fresh·교체/종료·늦은 완료·긴 timer 분할 | 재개 정책은 U31에서 후속 검증·설정 상속·브라우저/Dart |
| 복합과 주기 연결 | 복합 C12/C13/H01: 전체 완료 기준 예약·부분 실패 보존·회복·fresh 재실행, 실제 HTTP | 실제 서비스 권한/네트워크·StateStore/Action/URL |

현재 범위에 남은 실패는 없고 source hash·원시 결과·수정 전 archive를 연결했다. 인수 ID 전체 또는 T2 전체 완료로 바꾸지 않는다.

## U31. autoRefreshWhen 재개와 대기 결합

[계약·범위·결과](t2-polling-resume-2026-10-30.md)에 따라 Node 22/24 각각 polling 54/54·고의 결함 10/10·실제 timer/HTTP 1/1, 복합 51/51·고의 결함 5/5를 확인했다. Query 36개·100 seed와 Query–HTTP 39개 회귀도 통과했다.

| 관련 인수 범위 | 실행한 부분 | 남은 범위 |
|---|---|---|
| Q09–Q10, Q12–Q13, Q18–Q19 일부 | P08/P23/P28–P39: false→true 즉시 fresh·active 뒤 한 건 결합·최신 입력/수동과 결합·완료 후 interval·재중단/취소·gate/refresh/준비 보호 | 설정 상속·실제 반응형 평가·브라우저/Dart |
| Q07–Q08, Q11, Q16–Q17 일부 | C28–C30/H01: 재개의 전체 자식 fresh 실행·최신 입력/수동과 한 번 결합·재중단 후 입력 변경 재사용·실제 HTTP | 전체 그래프·등록/스키마·core/renderer |
| 실제 timer 연결 | N01: 진행 중 재개를 다음 한 건으로 결합하고 완료 뒤 full interval, 폐기 시 timer 0개 | 운영 성능·background throttling |

기존 인수 ID를 추가하거나 전체 완료로 바꾸지 않는다. 이번 재개 계약의 실행 증거를 해당 범위에 연결한다.

## U32/U33. 복합·URL·날짜 후속 경계

[실행·실패 전후·범위](boundary-followup-2026-10-30.md)에 따라 복합 65/65·고의 결함 5/5(Node 22/24), URL 63/63·고의 결함 9/9(Node 22/24·Chromium), 직접 날짜 39/39(Node 22/24)를 확인했다. URL seed는 Node 각 100개·Chromium 20개다. 기존 T1 어댑터 93/93·CEL 크기 18/18 회귀와 기존 후보 불일치를 구분한다.

| 관련 인수 범위 | 추가 실행 | 남은 범위 |
|---|---|---|
| Q01–Q08, Q11–Q13 일부 | C31–C36/S12–S17: 형제 실패/취소·중첩 재사용·명시 null·escape·많은 배열 Concat·원본 격리 | 전체 정의/스키마·실제 core |
| L01, L03, L05–L09 일부 | U37–U55: baseline 정규화·격리, 늦은 cleanup·ABA, 교체 사전 검증, 정리 실패 후 새 연결 완료/진단/후속 쓰기 | 전체 View/StateStore·초기 완료·renderer 연결 |
| 값·날짜 계약 일부 | date-boundaries 39건: 정규화 후 const/enum/pattern/길이·nullable, UTC 연도 범위·DST gap/overlap | 전체 날짜 함수·스키마 조합·Dart/HTTP/URL 날짜 codec |

L07 기대값에 수락된 U33을 반영했으며 인수 ID 전체 완료로 바꾸지 않는다.
