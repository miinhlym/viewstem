# Patchboard 시기 승인 요구의 Viewstem 이관 행렬

이 문서는 **과거 기능 의미의 누락 방지용**이다. 과거 리소스 JSON·Widget·Channel·Layout 명칭을 현행 계약으로 복원하는 문서가 아니다. 현재 구조는 [최종 명세](../VIEWSTEM-SPEC.md), 변경 이유는 [결정 등록부](decision-register.md)를 따른다.

출처: [통합 명세](https://chatgpt.com/space/page_7842bb8bff0c8191be6cd5831e7e375f) 부록 A와 §5–13. 부록 원문은 CEL/URL/setResource/Query 조건/reaction을 재조회했다고 명시하고, 나머지는 이전 기록의 승인 식별자를 복구했다고 구분한다. 이 문서 역시 그 근거 수준을 유지하며 모든 원문을 새로 검증했다고 주장하지 않는다.

## 의미 보존과 새 담당 경계

| MIG | 과거 승인 의미 | 현재 담당 / 그대로 유지할 것 | 이관 구현·검증 포인트 | 근거 |
|---|---|---|---|---|
| 01 | Variable CEL·expression | Variable.spec.expression | CEL 선택을 다시 열지 않음; 구현체·언어 간 적합성 고정 | E21, E27 |
| 02 | State 쓰기 가능 / Derived 계산·쓰기 금지 | View/Component states, StateStore | 내부 spec 제거·variableRef 명명으로 이동; 의미는 유지 | E24, E33, `Sentinel_db3793dea34c8191b67ee56da4839b69` |
| 03 | reaction.value는 고정 JSON 상수 | 상태 반응 정책 | 계산식으로 실행 금지; 새 Action/event 문법과의 표기 매핑만 구체화 | `Sentinel_f97c2b5ea46481918b4022ea9e87d9af` |
| 04 | reaction 초기 미발화·실제 변경만 반응 | StateStore 변경 정착 과정 | 초기값/URL 복원을 사용자 변경으로 발화하지 않기 | E26 |
| 05 | 한 배치 명시 선택값 우선·그 뒤 Derived/Query | 코어 상태 갱신 순서 | reaction이 명시적 쓰기를 덮어쓰지 않기; 순환 검증 | E26 |
| 06 | 선택값 JSON은 중복 없는 배열 | State의 외부 표현 | 내부 Set 사용은 구현 선택; 일반 Set 지원 폐기 아님 | `Sentinel_cfb68b7da4008191b00d25fa6656832f` |
| 07 | URL 연결 opt-in·JSON codec·고정 baseline·기본값 자동 생략 금지 | 소유자 상태와 URL 연결 | 복원은 기본값 이후; reset baseline을 새 시각으로 재계산하지 않기; URL 기록값을 기본값과 같다는 이유로 생략하지 않으며 모든 초기값 기록 의무로 확대하지 않기 | `Sentinel_82ecb1089af88191b5ddec32762418bf`, `Sentinel_17bc982519d88191a6f8008eae95cb87`, E46의 후속 수락 `Sentinel_72f4f5f36bfc81919d39aa88144e0afd` |
| 08 | 소유 URL key만 정리·다른 값 보존 | View 교체/상태 수명 연결 | 전체 URL 삭제 금지; 서비스 소유 상태 보존 | `Sentinel_c3f93ce9e94c81919d176599664b79e3`, `Sentinel_ea12186e4e648191be977a4158718b51` |
| 09 | 같은 renderer의 setResource 허용 | 명시 전체 재주입 | 이전 화면 소유 상태/URL 정리 후 새 기본값; renderer detach와 owner dispose 구분 | [초기 적용/이관](../spec/09-preserved-contracts.md#초기-적용-완료의-확정-관찰-의미), E19 |
| 10 | SPA 라우팅 조정 제외 / 새 페이지 링크 상태 전달 | 서비스 라우팅 경계 | URL 동기화를 범용 router로 확대하지 않기 | [초기 적용/이관](../spec/09-preserved-contracts.md#초기-적용-완료의-확정-관찰-의미) |
| 11 | executeWhen은 모든 실행 계기 | Query 사용 인스턴스 gate | 초기·변경·수동 refresh에도 적용; 닫힘을 성공으로 가장하지 않기 | `Sentinel_f1a287e391948191ab7350b2ec8401f8`, E37 |
| 12 | autoRefreshWhen은 주기 갱신만 | Query 스케줄러 | manual refresh를 이 조건으로 잘못 차단하지 않기 | `Sentinel_e169eb15b0b881918294b112e63f7a71` |
| 13 | gate false→true 즉시 조회 / true→false 신규·대기 차단 | Query 스케줄러 | active 강제 취소 필수 아님; 반환의 현재 유효성은 확인 | `Sentinel_407c2d9bfb508191b6978b87cbdecfd1` |
| 14 | 1 active + 1 latest pending | Query 사용 인스턴스 조정 | 같은 generation/snapshot 유효 결과만 결합; 오래된 A와 새 B 무조건 혼합 금지 | [Query 정책](../spec/09-preserved-contracts.md#함께-보존할-실행api-이력) |
| 15 | refresh 주기는 사용 위치 선언·View 기본값, 완료 후 지연 | Query 사용 설정 | 숨은 전역 기본 주기 없음; 실패 즉시 무한 재시도 금지 | [실행·API 이력](../spec/09-preserved-contracts.md#함께-보존할-실행api-이력) |
| 16 | 동적 선택 항목별 Query fanout 제외 | 자동 조회 범위 | 에이전트 구조 변경과 동등하다고 자동 확대하지 않기 | `Sentinel_d96923d419488191a201caf2836439d6` |
| 17 | native Set/Map, JSON 경계 변환 | 값/Type/CEL 적합성 | JS 객체를 JSON에 그대로 보낼 수 있다고 가정 금지; Dart 의미 대조 | `Sentinel_6251753d31dc8191952863a03596da89` |
| 18 | 암묵 coercion 금지, nullable/missing/pending 분리 | 값 평가·타입 검증 | 오류/대기를 null·false·0으로 숨기지 않기 | [값 계약](../spec/10-value-contracts.md) |
| 19 | 원본 보호·안정 읽기 참조, 입력 격리 | Value 전달·StateStore | Value 객체 변이로 State 쓰기 우회 금지 | `Sentinel_4919af5980208191b2636a469a87c7c4` |
| 20 | 객체/배열 내용 비교·배열 순서 / Set native membership / Map string·number key·재귀 값 비교·삽입 순서 무시 | [값 상세](../spec/10-value-contracts.md) | JSON/CEL 매핑과 이미 승인된 equality 의미를 구분 | E58 |
| 21 | date/time/datetime 구분·format 검증, Day.js YY pivot | 날짜 값 적합성 | 날짜 계산·파싱의 구현체 차이 테스트; 임의 새 pivot 금지 | `Sentinel_48724c8802888191bbeb75871975b389` |
| 22 | LineChart와 TimeSeries 구분, ECharts vs Canvas 지원 subset | 선택 코드 Component/UI 패키지 | core 자동 등록 아님; 동일 options를 모든 엔진이 지원한다고 약속 금지 | `Sentinel_95373d3a9f3c8191aa6bb37518cbe251` |
| 23 | numeric Y·null 결측 보존 | 차트 입력 계약 | 결측을 0으로 바꾸지 않기 | `Sentinel_fe6ef0c3b7b481919e9e5150202f58a0` |
| 24 | LineChart 입력 순서·중복 X 보존 | 차트/변환 경계 | renderer의 암묵 정렬/중복 제거 금지 | `Sentinel_d1afe429b60081919a56289a90f09c8e` |
| 25 | series defaults/ID별 overrides·runtime data 소유 | 선택 차트 Component | 데이터 소유권과 options override 충돌 분리 | `Sentinel_df3903971fb481918593964d1e681415` |
| 26 | create/setResource/refresh/destroy와 resolveResource/executeQuery 논의 | 새 최소 SDK의 기능 대응 | 예전 API 의미 대조; 예시 createRuntime으로 폐기 확정하지 않기 | [실행·API 이력](../spec/09-preserved-contracts.md#함께-보존할-실행api-이력) |
| 27 | 같은 Store·대상에 reaction 하나만 허용 | 실제 State 셀 정체성 | 다른 owner도 명시 공유한 셀이면 중복 거절; 동명 별개 셀은 구별 | E44 |
| 28 | Store 관찰의 범위·초기 통지·values/changes | StateStore 관찰 | 전체/단일/묶음·원자 변경당 1회·removed/null·동일 값 replaced·해제; 주소/SDK만 매핑 | E45 |
| 29 | Store는 라이브러리 생성 객체만 주입 | 서비스 소유 StateStore와 내부 수명 관리 | 임의 외부 Store 자동 호환 금지; 서비스의 쓰기로 생성 owner 변경 없음 | E51 |
| 30 | URL 고정 baseline·잘못된 입력 진단·지원 타입 | 상태/URL 연결 | scalar와 string/number 배열·Set 범위, JSON codec, missing과 null 구별 | E46 |
| 31 | URL 쓰기 실패·유한 제한·정확한 소유 key | URL 어댑터 경계 | State 유지·오류 통지·잘라내기 금지·최신 URL patch; 연결 해제로 삭제하지 않음 | E46 |
| 32 | Query 콜백 전에 Set/Map 재귀 변환 | 라이브러리→서비스 콜백 입력 | Set→배열·Map→쌍 배열·원본 유지; 새 DTO/export 전체 직렬화는 별개 | E47 |
| 33 | 일반 수동 갱신도 refresh:false 존중 | Query 사용 인스턴스·RefreshQuery | executeWhen도 적용, autoRefreshWhen은 주기만; retry/제외 결과는 구체화 | E50 |
| 34 | 필요한 source/변환 실패는 Query 전체 실패, 정상 빈 결과는 성공 | Query 실패 범위와 위치 정보 | 부분 성공 데이터 반환 금지·실패 source/단계 식별 보존; 정확한 오류 DTO는 구체화 | E52 |
| 35 | 현재 시각 공급·시간 변화 재평가·다른 Variable 결과 재사용 | [값 상세](../spec/10-value-contracts.md)·Variable | 순수 계산/명시 inputs 유지; 숨은 시계나 선택 날짜 자동 변경을 강제하지 않음 | E53 |
| 36 | 일반 path/call literal·동적 영역 @@ escape | [값 상세](../spec/10-value-contracts.md) | 기본 의미와 남은 적용 위치/재귀/오류 처리를 구별 | E54 |
| 37 | 원본 비동결 격리·무변경 읽기 참조·과거 snapshot 안정 | [값 상세](../spec/10-value-contracts.md)·StateStore | 객체 Set 저장 참조 기준·원본 identity 비보장; 구체 보호 구현은 선택 | E59 |
| 38 | 정수 add·날짜 패턴·YY 경계 | [값 상세](../spec/10-value-contracts.md) | 00–68/69–99 경계와 나머지 날짜/CEL/Dart codec 매핑 구별 | E60 |
| 39 | 초기 적용 완료·점진 표시·정적 서비스 연결 선택성 | [초기 적용 상세](../spec/09-preserved-contracts.md#초기-적용-완료의-확정-관찰-의미) | 최초 실행 가능한 처리 정리·입력 대기 비차단·적용 실패 보존; SDK 이름은 별개 | E61, E68 |
| 40 | 선택 차트의 옵션/데이터 소유·엔진 경계·세 차트 Y 검증 | [선택 차트 상세](../spec/11-optional-charts.md) | core 기본 등록 의무 아님; 별도 X 인수 목록으로 검증 | E62, E63, E65, E66 |
| 41 | 실행 조건 불가 RefreshQuery는 이유와 함께 Action 중단 | [Query 실행](../spec/02-query.md)·[Action](../spec/04-action.md) | refresh:false 제외 결과와 혼동하지 않음 | E55 |
| 42 | 호출 관찰 ID·입력 준비 진단·완료한 State 비롤백 | [Action](../spec/04-action.md) | owner 내 ID 중복·입력 실패 원인 식별·순차 Action과 원자 변경 묶음 구별 | E56, E57, E67 |

27–33행은 2026-10-29 원문 재검증으로 요약 누락을 복원한 항목이다. 실제 동작은 [이전 승인 상세](../spec/09-preserved-contracts.md)에 공개했으며 원문 보관함의 유무에 의존하지 않는다. Action의 호출 연결 폐기·If/Assert와 Concat은 [결정 등록부](decision-register.md) 및 각 상세 계약에 복원했다. 새 API 이름을 승인했다는 뜻은 아니다.

34행은 후속 재평가에서 추가 확인한 기존 승인 복원이다. 등록 식별의 (kind, id) 명확화는 과거 복원 행에 포함하지 않고 현재 프로젝트의 U01·D37로 구별한다.

35–42행은 전체 원문 감사 및 방 기록 회수 뒤 보완한 의미다. 회수 요약/명시 인용의 보존 수준과 현재 계약의 전체 대응은 [원문→계약 대응표](../handoff/source-contract-matrix.md)에서 구별한다. 초기의 원문 부재 한계가 회수 후에도 승인 미확인이라는 뜻은 아니다.

## 명시적으로 대체된 것은 복원하지 않기

| 과거 | 현재 우선 규칙 |
|---|---|
| widget/layout/channel 중심 구조 | Component/View, 등록 레이아웃 Component, StateStore/ports |
| 서비스 채널은 언제나 readonly | 소유권과 쓰기 허용을 별도 판단 |
| renderer 재사용 금지 | 같은 renderer에서 명시 setResource 재주입 가능 |
| 배치 ID 없음/내부 key만 | View/재사용 Component 이름 공간의 명시 ID와 repeat 안정 key |
| 저장된 원본 Query를 서버가 반드시 재조회 | E23 현재 리소스 기반 요청; 필요한 secret만 안전한 서버 경로 |
| 과거 fitToHeight가 내용에 따라 자동 행 높이 증가 | 현행 Grid 계약 우선; 내용 기반 자동 높이는 후속 |
| 과거 자동 Query 정책을 모든 실행에 적용 | 명시 Action Query는 자동 재시도·캐시·구독·inflight 재사용 없음 |

## 구현자 체크

- 위 요구는 **이전 승인·통합 대조 필요**이지 모두 새 기능 요청이 아니다.
- 현행 구조와 충돌하지 않는 의미를 먼저 보존하고, 필드 배치·SDK·직렬화만 구체화한다.
- 차트는 별도 UI 모듈의 향후 구현 목록으로 이관한다. core 첫 배포에 차트 코드가 없다는 이유로 승인 의미를 삭제하지 않는다.
- 이관 완료 표시는 대응 타입/코드/테스트가 생겼을 때 근거 경로와 함께 갱신한다. 현재 모든 행은 구현 검증 미완료다.
