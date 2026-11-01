# 독립 실험 기준선과 실제 core 검증 진행표

2026-10-30 시작, 2026-11-02 갱신. 사용자는 수정 한 건이나 일부 실험 통과마다 멈추지 않고, 사용자 결정이 필요한 경우에만 멈추며 모든 검증을 이어가도록 요청했다. 이 진행표와 [224개 항목별 목록](../../experiments/verification/coverage.json)을 유지한다. 기존 인수 216개와 선택 차트 8개를 누락하지 않는다.

## U37 실제 패키지 결과 · 2026-11-02

제품 증거는 [구현 범위·제한·검토 기록](core-implementation-2026-11-02.md), [인수 항목과 제품 테스트 연결](core-acceptance-coverage.json), [실제 실행 결과](core-verification-results.json)로 나눈다. 이 진행표는 현재 제품 검사 수를 복제하지 않는다. branch-preflight의 발견·수정 전 증거·커밋 상태도 구현 인수인계에서 확인한다.

## U34–U35 독립 실험 기록

이하 완료 기준·검사 수·잔여는 **U36 인계까지의 과거 기록**이다. 당시 core 미구현·보류 표기를 현재 상태로 적용하지 않는다. 날짜별 T1–T4 결과와 실패 archive는 원래 증거로 유지한다.

## 완료 기준

- 각 인수 항목의 기대값을 실제 실행 증거와 대응시키고, 단일 성공 예시로 경합·실패·보존 조건 전체를 통과 처리하지 않는다.
- 기존 소스·설정·입력이 같은 결과는 재사용한다. 변경된 경계와 그 소비자만 필요한 회귀를 실행한다.
- 독립 실험으로 검증 가능한 계약은 모델·어댑터·fixture를 작성해 실행한다. 문서상의 기대값을 실행 결과로 표시하지 않는다.
- 확정 계약 위반은 자율 수정·회귀·문서화한다. 미결 중 담당자가 결정할 기술 세부는 위임에 따라 정하며, 관찰 결과나 지원 범위의 실질적인 제품 선택만 사용자에게 묻는다.
- 당시 검증 작업은 모든 목록의 증거 대조와 실행을 끝내야 완료하는 기준이었다. 일부 suite 통과·개별 수정·보고서 작성만으로 완료하지 않는다.
- U34–U35 수행 당시 core 본 구현·커밋·배포는 보류했다. U36은 완료된 문서·실험을 커밋해 새 채팅으로 인계하는 요청이며, 다음 구현 절차는 [현재 인수인계](implementation-start.md#새-채팅에서-시작할-때)를 따른다. 실험용 모형과 실제 core/renderer 적합성은 구별한다.

## 실행 순서와 잔여

| 묶음 | 현재 증거 | 이어서 검증할 내용 | 상태 |
|---|---|---|---|
| B01 값·스키마 | Schema 등록 78·실행 83·직접 날짜 39·Dart 교차 327 등 | Dart 추가 속성·native 원소 identity 결함 수정 및 독립 재검토 완료 | 독립 실험 통과 |
| B02 CEL·교차 언어 | JS patch 433·카탈로그 6·입출력 제한·native/날짜 연결·Dart VM 값 교차 | 선택한 JS 실험 프로필의 증거 대조 완료. 기존 Dart CEL 후보는 미적합이며 후속 Dart core에 채택하지 않음 | 독립 실험 대조 완료 |
| B03 State·입력·관찰 | State 27·ports 28·시간 9·URL 연결 6, Node 22/24 | 관련 인수 항목의 직접 증거 연결 완료, 생산 Store 통합은 별도 | 독립 실험 통과 |
| B04 HTTP·URL | HTTP 261·경로 304·Query–HTTP 39·URL 63·날짜 연결 62·인증 계약 62 | 실제 localhost HTTP·Chromium History 범위, 서비스 실제 권한/다른 브라우저는 미포함 | 독립 실험 통과 |
| B05 Query | 경합 36·polling 54·복합 65·UI 연결 2 | 입력/설정·stale/재사용·비배열 거절·무관한 UI 유지 직접 확인 | 독립 실험 통과 |
| B06 Action | 기본 23·하위 호출 16·추가 경계 8, Node 각 통과; Chromium 하위 호출 6 | U35 부모 스택·취소 연결, 실제 Query ticket·UI 수명 결합 통과 | 독립 실험 통과 |
| B07 UI 수명 | Node 각 158/158·Chromium 168/168 | 동적 값 7곳·초기 의존 순서·A14 실제 Action 관찰 포함, Action 조건/반복 수명은 별도 결합 11개 통과; 생산 renderer는 별도 | 독립 실험 통과 |
| B08 등록·SDK·초기 완료 | application Node 각 29/29·Chromium 4/4·TypeScript negative 56/56 | 종류별 등록·원자 변경·타입 계약·초기 projection/완료·교체 실패/취소 | 독립 실험 통과 |
| B09 교차 계약 | K01–K37의 항목별 직접 증거 | K05는 U35 문맥 하위 호출·독립 호출 구분으로 검증 | 독립 실험 대조 완료 |
| B10 선택 차트 | Node 각 139/139·Chromium 각 173/173·mutant 5/5 | X01–X08 제한 프로필과 실제 State/렌더링 증거 대조 완료, 제품 전체 옵션 지원으로 확대하지 않음 | 독립 실험 통과 |

위 숫자는 당시 실험 suite의 검사 수이며 인수 항목의 완료 개수가 아니다. 부분 증거를 항목별로 대조하기 전에는 coverage.json에 임의 완료를 입력하지 않는다. 전체 코드 구현을 했다고 주장하기 위한 진행표가 아니다.

## U34 진행 증거 — 스키마와 날짜

- 기존 직접 날짜 fixture의 `type`+`x-viewstem-type` 동시 선언 오류를 바로잡았다. [수정 전 소스·결과](../../experiments/t1-values/archive/u34-before-schema-profile/README.md)를 보존하고 유효한 선언으로 Node 22/24 각각 날짜 39/39를 다시 실행했다.
- [등록 검사](../../experiments/t1-values/schema-registration.mjs)는 허용 keyword 전수 목록·native 필수 필드·local ref의 URI/Pointer 해석·잘못된 dialect·문법·annotation 비재해석을 78/78로 검사했다. 두 Node 버전 결과가 같았다.
- [복합 스키마 실험](../../experiments/t1-values/schema-runtime-tests.mjs)은 83/83, 그 안의 일반 JSON 비교는 Ajv와 3,036개 입력/스키마 조합이 일치했다. native·날짜 조합/참조·safe integer·스키마 snapshot·입력 원본 보존을 추가했다. 임의 스키마 전체의 정규화 정적 분석 완전성을 주장하지 않으며, 분기 확장·깊이·노드·annotation 크기는 한도를 검사한다. 복잡한 부정 조건의 정적 분석 완전성은 계속 검증한다. [개발 중 실패 3건](../../experiments/t1-values/archive/u34-schema-runtime-development/README.md)은 수정해 회귀했다.
- [실제 HTTP/URL 날짜 연결](../../experiments/verification/date-integration.mjs)은 localhost HTTP와 Chromium History에서 실행했다. 유효 날짜 전송·대상 스키마 재검증·잘못된 URL 값의 baseline 보존·명시 쓰기 원자 거절·일반 string 보존·같은 시점 중복 history 방지를 포함한다. 최종 결과와 추가 환경은 연결 파일을 따른다.
- URL의 선택적 스키마 검사 연결 뒤 기존 63/63·mutant 9/9가 Node 22/24·Chromium에서 유지됐고 seed는 Node 각 100/100·Chromium 20/20, pageerror 0이었다. [이전 증거](../../experiments/t2-url-races/archive/u34-before-schema-connection/README.md)도 보존했다.
- 기존 T1 전체 294개 관찰의 판정은 유지됐다. 값 어댑터 93/93·CEL 크기 18/18이며, 기존 CEL/Dart 불일치를 해결한 것으로 표시하지 않는다.

## U34 진행 증거 — CEL 패치

[실험 patch와 실행 방법](../../experiments/t1-cel-patch/README.md)을 분리했다. 원본 8.0.0은 그대로 두고 원본/패치 후 hash·무오차 적용을 검사한다. 비용·날짜 기본 패치에 이어 concurrent parsed quantifier, 정수 overflow/변환, 기간의 음수 연산·밀리초 부분값·큰 날짜 차이 정밀도, 지역 날짜 getter 경계를 재현·수정했다. 이후 기본 노출 문자열/bytes 확장도 대조해 현재 Node 22/24는 각각 Chromium 포함 **433/433**이다. 입력·출력·표현식 크기와 AST 비용 제한을 함께 검사했다.

중첩 정규식은 첫 비용 패치에서도 300ms 계산 watchdog까지 완료되지 않아 [실패](../../experiments/t1-cel-patch/archive/u34-native-regex/README.md)를 보존했다. RE2JS를 고정하고 컴파일/프로그램 크기의 비용을 계량한 뒤 같은 입력이 정상 false로 끝나는 것을 확인했다. 이는 비용 가드·특정 공격 fixture의 증거이며 전체 sandbox/보안 인증을 뜻하지 않으며 이 결과만으로 전체 검증 완료를 주장하지 않는다.

기본 카탈로그는 108개 정의에 macro 10개가 포함된 목록이며 optional은 기본 비활성이다. 표준 CEL·공식 문자열 확장·패키지 확장을 구별했다. ASCII 변환·Unicode 검색/substring/split·trim·브라우저 bytes.json의 실제 결함을 [수정 전 80개 실패](../../experiments/t1-cel-patch/archive/u34-default-extensions/README.md)로 보존하고 수정했다. 최종 patch `62dd517376de54a08018f6166b250d9013b907e87b11ab75d0f07e264de0da63`에 대해 433개 회귀·regex 2개·catalog 6개와 의존 native/Dart/Clock/교차 suite를 다시 실행했다. 독립 리뷰의 확인 범위에서 추가 결함은 없었다. 이 목록을 v1 공개 함수 지원 승인이나 모든 overload의 완전한 검증으로 해석하지 않는다.

## U34 진행 증거 — State

[독립 State 실험](../../experiments/t3-state/README.md)은 27/27씩 Node 22/24에서 통과했다. 폐기된 의존 셀의 stale 성공 유지·관찰 콜백 오류의 전파·최초 통지 재진입을 수정했다. 최초 22개 성공만으로 수명 경계 전체를 완료 처리하지 않았으며 수정 전 5개 실패를 보존했다. 후속 포트·Action 연결 결과는 아래 증거를 따른다.

입력 포트 모형은 Node 22/24 각각 28/28이다. 호출한정 State 래퍼의 재연결도 상위 검증·취소를 유지하고 오류에 문제 input 키를 남긴다. [Query/HTTP/URL 초기 증거 대조](../../experiments/verification/query-http-evidence.json)와 [값/State/교차 초기 증거 대조](../../experiments/verification/value-state-evidence.json)는 당시 조사 기록이다. 이후 추가 결과는 coverage.json에 누적하며, 초기 조사에 남은 공백을 현재 공백으로 오인하지 않는다.

## U35 코드 Action 하위 호출 확정·검증

U34에서 코드 Action이 await 뒤 외부 invoke를 호출할 때 부모 관계를 알 수 없어 재귀를 거절하지 못한 결과를 보존했다. U35에서 사용자는 내부 호출은 부모 취소와 함께 취소하고 별도 버튼의 호출은 독립 유지하는 추천을 수락했다. 문맥 `invokeAction`이 부모 owner·호출 스택·취소를 이어받고 외부 runtime 호출은 독립 진입점으로 구분한다. 입력은 명시 전달하고 대상/권한/타입 검사를 우회하지 않는다. 부모 종료 뒤 보관한 함수와 대기하지 않은 자손은 취소한다. [현재 계약](../spec/04-action.md#재귀확장-실행의-경계)을 따른다.

[Action 실험](../../experiments/t3-action/README.md)은 Node 22/24 각각 기본 23/23·하위 호출 16/15·추가 경계 8/8이다. 실제 Chromium은 하위 호출/동기 취소 5개와 pageerror 검사까지 6/6다. 직접·상호·혼합 호출 재귀, 순차/병렬 재사용, 외부 독립성, 부모 취소·정상 종료, 보관한 호출 함수, 명시 입력과 권한, 실제 Query pending/active ticket 격리를 검사했다. 중첩 인라인 native 검증과 Query 래퍼의 자식 취소 신호 유실을 독립 리뷰로 발견해 수정했고 [수정 전 3개 실패](../../experiments/t3-action/archive/u35-child-review-before/README.md)를 보존했다. 리뷰의 수정 재현과 혼합 계보 추가 대조도 통과했다. 기존 두 native fixture는 미등록 인라인 실행 대신 등록 참조로 고쳤다. 이어 콜백이 동기적으로 자기 연결을 제거한 뒤 늦게 reject하면 unhandled 오류가 남는 문제를 재현했다. 취소 검사 전 Promise 실패 회수 경로를 붙여 native/Query/Variable 및 Chromium의 늦은 실패도 격리했다. [수정 전 15/16 증거](../../experiments/t3-action/archive/u35-synchronous-cancel-before/README.md)를 보존한다.

[UI–Action 결합](../../experiments/verification/action-ui-integration.mjs)은 Node 22/24 각 11/11다. 실제 UI 확장의 when/on 제거·동일 id 재생성·반복 재정렬/개별 제거·owner 격리·Row 이동·구조 검증 실패·actionRef/componentRef 교체를 Action 수명에 연결했다. 실제 StateProbe SetState→구독→자기 when 연결 제거에서 후속 단계 0회와 공유 State 보존을 확인했다. private adapter의 검사이며 생산 core/renderer나 일반 UI State 포트 구현은 아니다.

## U34 독립 UI 실행 증거

[UI 실험](../../experiments/t3-ui/README.md)은 U01–U13·K21에 이어 동적 표현·initial·A14·Component ref/inline을 검사했다. 현재 Node 각 158/158, Chromium 모형 158+DOM 9+pageerror 검사 1개가 통과했다. 공통 경로 규칙을 UI 7개 위치에도 적용하고, private owner 노출·배열 length/비정규 인덱스 수용·State.initial 미평가를 수정했다. 초기값은 JSON 선언 순서가 아닌 의존 순서로 평가하고 일반 @path·formatString·동적 보간의 앞/뒤 참조와 순환을 검사했다. 실제 ActionProbe snapshot의 idle→running→success를 표시했으며, 구조 변경/반복의 Action 수명은 U35 결합 실험으로 추가 검사했으며 생산 renderer 통합은 별도다.

## U34 추가 연결과 등록 증거

- [시간·날짜/State](../../experiments/t3-state/time-integration.mjs): 9개 묶음이 서로 다른 기기 시간대에서 통과했다. 명시 업무 시간대·Clock 입력만 계산을 바꾸며 선택 날짜/reset baseline은 고정된다. DST의 다음 날은 23/25시간 차이로 직접 비교했다.
- [State–URL–Query](../../experiments/t3-state/url-integration.mjs): Node 22/24 각 6개 묶음. 최초 안정 입력만 요청하고 초기/URL reaction·재push를 만들지 않으며, 같은 baseline 날짜도 링크에 명시해 새 baseline 실행에서 보존한다.
- [Action 추가 경계](../../experiments/t3-action/boundaries.mjs): Node 각 8/8. 후속 중단·취소 catch·retry·명시 Query 무공유를 검사했다.
- [application/registry](../../experiments/t3-application/README.md): Node 각 29/29, Chromium DOM/ack 3/3와 오류 검사 통과. 구조 실패 보존·동기 Query 콜백 throw의 개별 오류 보고·세대별 initial·실제 projection 반영 확인을 검증했다. [TypeScript 5.9.3 계약](../../experiments/t3-application/types/README.md)은 정상 사용 컴파일과 잘못된 사용 56개 각각의 정확한 오류 줄을 Node 22/24에서 확인했다. 타입을 지운 void callback의 반환값 등 런타임 검증이 필요한 한계도 따로 실행했다.
- [native CEL](../../experiments/t1-native-cel/README.md): Node 22/24 각각 Chromium 포함 55/55. private payload 보호·Set identity·Map 소수 키·타입별 숫자/날짜·크기/비용 제한을 직접 typed fixture에 연결했다. 리뷰에서 저장된 배열 Set 원소의 출처가 끊기는 문제를 수정하고 같은 저장 원소와 새 배열을 구별했다. 전체 JSON Schema 변환과 Dart CEL은 완료되지 않았다.
- [T4 차트](../../experiments/t4-charts/README.md): 명시 지원 프로필·State 포트·실제 Canvas/ECharts SVG를 실행하고 입력 순서·중복·ID·null/0·원본 보호를 확인했다. Node 각 139/139, Chromium 각 173/173, 고의 결함 5/5.
- [Dart 후보 대조](../../experiments/verification/dart-gap-evidence.json): 기존 cel 0.6.1의 7/22 불일치는 단순 결과 인코딩 문제가 아니다. timestamp 미지원으로 오류가 맞은 C18도 엄격 날짜 검증 통과로 세지 않는다. Dart 후보를 채택 가능하다고 표시하지 않는다.
- [JS–Dart VM 값 교차](../../experiments/t1-dart-values/README.md): 실제 native 값·직접 스키마·준비 상태·날짜의 hand-authored golden 109개를 각 언어 기대값과 교차 비교해 Node별 327/327 통과했다. 리뷰에서 배열/날짜 정규화 후 Set 원소 identity 손실과 additionalProperties 하위 스키마 누락을 재현·수정하고 독립 재확인했다. fixture 태그는 production 직렬화 API가 아니며 Dart CEL/Flutter 구현을 포함하지 않는다.
- [인증 계약 HTTP](../../experiments/t2-http-contracts/README.md): 문서의 인증 7유형을 실제 localhost 전송·권한 거절·비밀 별칭·Login 실패/동시성 경계로 연결해 Node 각 62/62 통과했다. API가 자체 응답에 넣은 값은 API 책임이라는 기존 구분을 유지한다.
- [남은 교차 경계](../../experiments/verification/README.md): Concat 입력/with의 비배열 거절, 명시 Query와 배열 입력의 요청 수, 정규화 전 host 키 보존, Derived ref/inline을 6개 묶음으로 실행했다. 별도 2개 묶음은 실제 복합 Query 게시를 UI 모형에 연결해 실패/부분 재사용 중 무관한 Query·UI 상태 보존을 확인했다.

## O01–O16 및 T1–T4 증거 지도

| 계약 | U34에서 연결한 실행 증거 |
|---|---|
| O01 인라인 | Query·Component·Derived ref/inline/XOR 및 명시 입력: K01 |
| O02 기본값 | ports-tests, State pending/명시 쓰기 경합, UI initial 의존 순서 |
| O03 State 연결 | ports-tests의 동일 스키마·권한·반복 연결·취소 래퍼 |
| O04 재귀 | Query/선언형 Action 정적 검사 및 U35 동적 하위 호출 재귀·독립 호출 구분 통과 |
| O05 복구 | Action 경계의 완료 효과 보존·실패 중단·취소 catch 후 부활 금지 |
| O06 날짜 | date-boundaries·time-integration·HTTP/URL 날짜·Dart VM 값 사례 |
| O07 값/CEL | schema-registration/runtime·JS patch·native adapter·UI/HTTP 표현식 대조 |
| O08 HTTP | http/transport/path-audit·query-http·인증 7유형 loopback HTTP |
| O09 갱신 | query-races·polling·composite 및 explicit Query·retry 추가 경계 |
| O10 확장/취소 | 실제 ActionProbe·자손 취소/Query ticket·UI 수명 결합·TypeScript 컴파일 |
| O11 Store/URL | State·URL 경합·날짜 codec·State–URL–Query 최초 안정화 연결 |
| O12 when/repeat | UI 전체 항목 key 선검사·조건·수명·순서/소유권 |
| O13 변환 | Concat/Join의 입력·순서·다중 매칭·실패·대량 입력 |
| O14 적용 완료 | application registry·원자 update/replace·세대별 initial·실제 DOM ack |
| O15 차트 | T4 명시 옵션 지원표·실제 State·Canvas/ECharts SVG |
| O16 실패 데이터 | Query 성공 쌍 보존·error/stale·복구·무관한 UI 유지 |

T1은 값/Schema/CEL/교차 언어, T2는 HTTP/URL/Query, T3은 State/Action/UI/application/타입, T4는 선택 차트 증거에 대응한다. `coverage.json`은 현재 224개 항목을 추적하며 [증거 무결성 검사](../../experiments/verification/audit-evidence.mjs)는 실제 ID·판정·파일·소스 hash를 대조한다. 검증 도중 보고서가 아직 갱신되지 않은 소스는 stale로 표시해 현재 증거처럼 쓰지 않는다. 항목별 `verified-experiment`와 이 표의 통과는 각 독립 실험 범위이며 생산 구현 완료가 아니다.

U36 인계 시점의 상태는 **독립 실험 증거 224개·결정 대기 0개**다. 최종 무결성 대조는 71개 보고서·1,536개 증거 연결이며, 소스 불일치·누락·알려진 미해결 실패는 0개다. 이 수치는 현재 연결한 보고서의 결과이며 과거 후보 실패 기록을 삭제하거나 통과로 바꾼 것이 아니다. 알려진 Dart CEL 후보 부적합·명시한 실험 프로필 밖 기능·생산 core/Svelte/Flutter 구현은 이 숫자로 완료 처리하지 않는다.

## 2026-11-02 완료 대조

O01–O16과 T1–T4를 위 증거 지도에, 인수 216개와 선택 차트 8개를 coverage.json에 모두 대응했다. 이전에 직접 대조한 증거는 소스·입력·환경이 유효한지 재확인해 재사용했다. U35로 달라진 Action·Query 래퍼·UI 소비자·타입 문맥은 영향 범위를 다시 실행했고, 기존 실패 증거는 archive에 보존했다. 단일 suite의 통과가 아니라 항목별 기대값과 실행 증거 대조, 추가 결합 경계, 발견 결함의 회귀를 마쳤다.

현재 확정 계약에 대해 수행한 구현 전 독립 실험 범위에는 남은 사용자 결정이나 재현된 미해결 결함이 없다. core 본 구현·공개 SDK·실제 서비스/renderer 통합은 이 실험의 완료로 승인되지 않는다. 전체 ECharts 옵션·모든 CEL 확장 overload·Dart CEL 적합성처럼 명시한 범위 밖의 지원을 통과로 주장하지 않는다. 기존 Dart CEL 후보는 7/22 불일치로 채택 불가 상태이며 JS 패치 및 Dart VM 값 교차 증거와 구별한다.
