<a id="구현-구체화-작업-목록"></a>

현재 공개 API 이름과 변경 후 검증은 [U42 네이밍 적용](public-api-naming-2026-11-02.md), [검증 기록](public-api-naming-verification-results.json)을 따른다. U41 및 이전 기록의 API 이름·해시는 당시 증거로 보존한다.

# 후속 구현과 미결 범위

이 문서는 **현재 남은 작업**을 소유한다. 구현한 기능과 검증 결과는 [U37 구현 인수인계](core-implementation-2026-11-02.md)와 [제품 실행 결과](core-verification-results.json)를 따른다. 아래 O01–O16·Q1–Q3·T1–T4는 결정과 실험의 이력이며 현재 core의 미구현 목록이 아니다.

Svelte 5 클라이언트 렌더러는 [U39 구현·검증 인계](svelte-implementation-2026-11-02.md)에 따라 구현했다. 자동 기본 UI는 제공하지 않는다. SSR·hydration 연결과 다른 브라우저·모바일은 현재 검증 지원 범위 밖이며 필요할 때 별도로 범위와 기준을 정한다.

## 실제 남은 작업

| 범위 | 남은 작업과 완료 기준 | 기준 계약·근거 |
|---|---|---|
| Dart core·Flutter | 별도 실행기를 같은 의미로 구현하고 교차 적합성 검증. 기존 Dart CEL 후보의 불일치는 해결된 것으로 취급하지 않음 | [제품·언어 경계](implementation-start.md#2-제품과-의존성-경계), [후보 검증 기록](verification-ledger.md) |
| Svelte UI 확장 | U44에서 고정 shadcn 66개 카탈로그 구현. 후속 kit·추가 preset·SSR·추가 브라우저·scoped JSON 문법은 별도 범위. 현재 native 전용 35개는 미구현이 아니라 host 조합 계약 | [구현·제한](svelte-ui-shadcn-implementation-2026-11-03.md), [실행 기록](svelte-ui-shadcn-verification-results.json) |
| 선택 차트 패키지 | 엔진별 실제 지원표·공개 입력·렌더링을 제품 패키지로 검증. 독립 실험 통과를 제품 완료로 옮기지 않음 | [차트 계약](../spec/11-optional-charts.md), 제품 인수 대응표의 X 항목 |
| 실제 서비스 연결 | 서비스가 resolver·권한·secret 저장소·router를 구현하고 해당 환경에서 검증. core에 도메인 의존성을 추가하지 않음 | [HTTP·인증](../spec/01-datasource-auth.md), [호스트 권한](../spec/07-host-integration.md) |
| 검증 환경 확대 | 다른 브라우저·운영 부하/성능은 실제 대상과 관찰 기준을 정해 검증. 현재 로컬 결과로 지원을 확대하지 않음 | [검증 환경·한계](core-verification-results.json), [CEL 제한](core-cel-support.md) |
| 공개 발행 | 자체 MIT 라이선스·기여·보안·지원 정책은 확정. npm scope 권한·릴리스 버전/태그·발행 절차와 원격 CI 확인은 남아 있음. 배포할 소스 revision의 문서를 원격에 제공하고 영·한 패키지 README에 해당 tag/commit의 문서 URL 연결 | [기여 정책](../../CONTRIBUTING.ko.md), [지원](../../SUPPORT.ko.md), [보안 제보](../../SECURITY.ko.md), [패키지 배포 경계](../../packages/core/README.ko.md#상세-계약과-문서-버전) |

GitHub 비공개 취약점 제보는 2026-11-03 사용자가 활성화했고, 저장소 API의 `enabled: true` 응답으로 확인했다. 미설정 과제에서 제외하며, 제보 양식을 사용할 수 없는 경우의 이메일 대체 경로는 [보안 정책](../../SECURITY.md)에 유지한다.

이 표는 후속 범위이며 일괄 구현 차단 조건이나 지금 모두 구현하라는 지시가 아니다. Q1–Q3·U35를 다시 질문할 필요는 없다. 새로운 제품 선택이 실제 작업에 필요해질 때 아래 기준으로 판단한다.

## 세부 판단의 위임과 논의 기준

U12에 따라 기존 방향에서 자연스럽게 정해지는 경계 규칙은 담당자가 묶어서 결정하고 현재 명세·이력·인수 사례에 반영한다. SDK 이름, 오류 코드·DTO, 검증 라이브러리·JSON Schema 프로필, 내부 자료구조·복사 전략, 확정된 의미를 보존하는 어댑터 구현은 담당자의 설계·검증 작업이며 하나씩 사용자 승인 대상으로 올리지 않는다. 미결로 남아 있다는 사실만으로 사용자 질문이 필요한 것은 아니다.

서비스 요구나 기존 계약을 대조해도 복수의 타당한 선택이 남고 **사용자가 관찰할 결과나 지원 범위가 실질적으로 달라질 때** 그 선택만 논의한다. O06의 날짜·시간대 의미, O05의 오류 복구 기능 범위, O16의 실패 후 기존 데이터 표시 정책은 이 기준으로 논의했고 U14에서 확정했다. 먼저 실제 입력·실행 예시와 영향 범위를 확인하고 추천안·대안을 제시하며, 단순 표현 방식 차이를 제품 선택으로 확대하지 않는다.

U12의 값·타입 기본 규칙에 이어 U13에서 **O01–O16 전부를 대조**했다. U14에서 Q1–Q3 추천안도 사용자가 수락했다. U35의 코드 하위 호출 선택도 확정했고 구현 전 독립 실험의 인수 항목 대조를 마쳤다. 아래 표는 U36까지의 계약 구체화·독립 실험 당시 과제를 보존한다. U37 제품 구현의 잔여는 문서 앞의 현재 목록만 따른다. 현재 사용자 선택 대기는 없으며, [새 채팅 시작 절차](implementation-start.md#새-채팅에서-시작할-때)를 따른다. [U12, U13, U14, U35, U36]

## O01–O16 전체 처리 현황

**역사 기록 — U13–U36의 계약 구체화와 독립 실험.** Q1–Q3과 U35는 완료된 사용자 결정이고 T1–T4는 독립 실험 증거를 확보한 검증 묶음이다. 항목별 결과는 [완료 증거 지도](verification-ledger.md#o01o16-및-t1t4-증거-지도)를 따른다. 표의 마지막 열은 당시 제품 코드로 검증할 항목이었다. U37 이후 core의 열린 작업으로 재등록하지 않으며, 제품 테스트 연결은 [현재 인수 대응표](core-acceptance-coverage.json)를 따른다.

| ID | 당시 상태 | 반영 위치·결정 | 당시 구현으로 검증할 항목 |
|---|---|---|---|
| O01 인라인 | 계약 확정 | [사용 위치별 인라인 필드](../VIEWSTEM-SPEC.md#411-인라인-정의의-사용-위치), ref/본문 XOR·명시 inputs | 참조/인라인 동등성 구현 검증 |
| O02 기본값 | 계약 확정 | [Value 리터럴 default](../VIEWSTEM-SPEC.md#511-입력-생략과-포트-기본값), required 조합·missing/pending 구별 | 초기 입력 경합 검증 |
| O03 State 연결 | 계약 확정 | [선언 계약 일치](../VIEWSTEM-SPEC.md#512-쓰기-가능한-state-포트의-계약-호환성), 현재 값만으로 연결 금지 | 정규화 비교 구현 T1 |
| O04 참조·재귀 | 계약 확정 U35·독립 실험 통과 | Query/선언형 Action 정적 순환 거절. 문맥 invokeAction은 await 이후에도 부모 스택·취소를 상속, 외부 runtime 호출은 독립 | [U35 하위 호출 검증](verification-ledger.md#u35-코드-action-하위-호출-확정검증)을 실제 core 호출 경로에 이식 |
| O05 오류 복구 | 계약 확정 U14 | [v1 복구 범위](../spec/04-action.md#v1-오류-복구의-범위): 선언형 Catch/Finally 제외, 코드 Action 명시 복구 | 실패 전파·취소 후 핸들 거절 검증 |
| O06 시간·날짜 | 계약 확정 U14 | [Clock 인터페이스](../spec/07-host-integration.md#상태query-핸들과-시계), [날짜 문자열·업무 시간대](../spec/10-value-contracts.md#날짜-값과-전송-형식) | 실제 날짜/CEL/Dart·시간대 적합성 T1 |
| O07 값·CEL | CEL 크기·HTTP 경로 17곳 검증 U28 | [스키마 subset·native 확장](../spec/03-variable-type.md#v1-스키마-프로필), [동적 값 평가·준비 snapshot](../spec/10-value-contracts.md#동적-값-평가-프로필) | [현재 경로 점검·미구현 범위](t2-path-audit-2026-10-30.md), 전체 실행기·비용·Set/Map/날짜 CEL/Dart 어댑터 T1 |
| O08 HTTP | HTTP 동적 값·전송·Query 연결 검증 U28/U29 | [HTTP 전송·HttpExecutionPlan](../spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto), secret resolver·공통 오류 | [baseUrl 포함 17개 위치 보완](t2-path-audit-2026-10-30.md), 실제 adapter/core 연결·서비스 권한·날짜 직렬화 T2 |
| O09 갱신 | 복합·완료 주기·재개 검증 U30/U31 | [사용 설정·상태·대기](../spec/02-query.md#사용-설정상태대기-호출의-구체-계약), refresh 제외 오류·명시 retry | [복합·주기·실제 HTTP 증거](t2-composite-polling-2026-10-30.md), [재개 결합 증거](t2-polling-resume-2026-10-30.md), 전체 등록/스키마·core 통합 T2; 실패 data는 O16 |
| O10 확장·취소 | 계약 확정 | [최소 SDK](../spec/07-host-integration.md#최소-sdk와-적용-완료), 호출별 핸들·signal·[공통 오류](../spec/07-host-integration.md#공통-오류와-진단) | TypeScript·renderer 적합성 T3 |
| O11 Store·URL | URL 경계·교체 실패 검증 U32/U33 | [주소·관찰·reaction](../spec/09-preserved-contracts.md#store-주소관찰reaction의-현행-매핑), URL 제한·commit 직전 유효성 | [URL 후속 증거](boundary-followup-2026-10-30.md), 실제 StateStore 재진입·교체·날짜 codec T2 |
| O12 when/repeat | 계약 확정 | [항목 확장 뒤 when](../spec/05-component-view.md#when과-repeat), 별칭 shadowing 거절·key 검증 | 정체성·비활성 항목 검증 |
| O13 변환 | 계약 확정 | [Join 문법](../spec/02-query.md#join-문법과-순환-참조), Concat 빈 with 허용·원본 보호 | 다중 매칭·충돌·순서 fixture. 추가 변환 kind는 이번 범위 아님 |
| O14 적용 완료 | 계약 확정 | mount/update/replace와 initial 보고 분리·개별 Query 오류 보고·교체 취소 | core/renderer 완료 구분 T3 |
| O15 선택 차트 | 기존 계약 유지 + T4 | 명시 등록·엔진별 지원표·core 분리; [모듈 검증 경계](../spec/11-optional-charts.md#모듈-등록과-지원표-검증) | 실제 지원 option·렌더링 fixture T4 |
| O16 실패 후 데이터 | 계약 확정 U14 | [마지막 전체 성공 data·dataInputs 보존](../spec/02-query.md#실패-후-마지막-성공-결과의-보존), 오류·stale 표시 | 실패/복구/옛 세대 경합·표시 검증 T2/T3 |

## 중요한 논의 사항

**종료된 결정 기록: 세 항목 모두 2026-10-29 사용자 수락 U14로 확정했다.** 아래는 결정의 요약이며 구현·실행 검증 완료를 뜻하지 않는다. 이 목록에서 추가 사용자 선택을 기다리는 항목은 없다.

### Q1 조회 실패 후 이전 데이터를 남길 것인가

**확정:** 자동 Query는 마지막 전체 성공 data와 해당 dataInputs를 보존한다. 실패 시 status:error·stale:true·error를 노출하고, 화면에서 이전 결과임을 표시한다. 첫 성공 전에는 missing이며, 실패한 일부 source 결과와 옛 결과를 섞어 성공으로 발표하지 않는다. 명시 Action Query에는 캐시 대체를 적용하지 않는다. [D68·현재 계약](../spec/02-query.md#실패-후-마지막-성공-결과의-보존)

### Q2 날짜와 시간의 기준을 무엇으로 삼을 것인가

**확정:** date는 달력 날짜, time은 하루 안의 시각, datetime은 절대 시점이다. 공개 값·전송은 문자열이며 datetime은 offset 입력을 UTC 밀리초 문자열로 정규화한다. 달력 해석에 필요한 IANA 업무 시간대는 서비스가 Value 입력으로 명시 연결한다. 브라우저·서버 시간대를 추측하지 않는다. [D69·현재 계약](../spec/10-value-contracts.md#날짜-값과-전송-형식)

### Q3 선언형 Catch/Finally를 v1에 포함할 것인가

**확정:** v1에서 제외한다. 선언형 Action은 실패 시 후속 단계를 중단하고 완료한 State 쓰기·외부 효과는 유지한다. 일반 로딩은 실행 관찰, 명시 복구·보상·정리는 등록한 코드 Action으로 처리한다. 취소된 호출의 핸들은 복구 코드에서도 다시 유효해지지 않는다. [D70·현재 계약](../spec/04-action.md#v1-오류-복구의-범위)

## 사용자 선택 없이 담당자가 검증할 작업

**역사 기록 — T1–T4 독립 실험의 검증 범위.** 아래 계획·시점별 결과의 ‘후속’은 당시 기준이다. 현재 제품 지원 범위는 문서 앞의 목록과 U37 인계를 따른다.

| ID | 검증 대상 | 완료 증거 |
|---|---|---|
| T1 | CEL/JSON Schema 실행기·Set/Map·숫자·missing·날짜/시간대 어댑터, 비용 제한 | 동일 fixture의 JS/Dart 결과·오류 대조, 지원 함수·키워드 목록, 실제 제한 중단. 패키지는 검증 후 선택 |
| T2 | HTTP/URL 어댑터·갱신 대기열·세대/취소 경합 | fake clock/transport의 지연·순서 역전·timeout·교체·secret 비노출 테스트. URL 실제 commit 직전 차단 증거 |
| T3 | SDK 타입과 core/renderer 경계 | TypeScript 계약 컴파일·렌더러 없는 실행·초기 projection/렌더 완료·호출 수명 fixture |
| T4 | 선택 차트 모듈 | 엔진별 실제 지원표·공개 입력 검증·대표 렌더링 fixture. core 적합성과 별도 |

U13/U14 문서 작업에서는 T1–T4를 실행하지 않았다. 이후 U15/U17/U18 및 U34의 승인된 독립 실험으로 네 묶음 모두 실행 증거를 확보했다. T1의 값·Schema·JS CEL patch·native/Dart 값 경계, T2의 실제 HTTP/URL·Query 경합, T3의 State/Action/UI/application 모형·TypeScript 컴파일, T4의 제한 지원표·실제 Canvas/ECharts 렌더링이 대상이다. [전체 진행표](verification-ledger.md)와 연결된 결과에서 검사 범위와 남은 결함을 확인한다. 전체 함수/스키마 조합·Dart CEL 적합성·생산 core/renderer·실제 서비스 연결은 이 독립 실험을 통과했다는 이유로 완료 처리하지 않는다. 패키지·성능·엔진 지원을 검증 없이 확정하지 않으며 실제 충돌만 근거와 함께 기록한다.

U16/D72에서 JS CEL의 계산 제한·잘못된 날짜 수용은 [cel-js 패치로 보완하는 전제](../spec/03-variable-type.md#cel-패치-전제)로 다음 논의를 진행하기로 했다. U34에서 고정 원본·패치 hash와 Node/Chromium 실행을 확보했다. AST 비용 외에 입력·출력 제한과 RE2 정규식도 검사했으며 [실험 범위](../../experiments/t1-cel-patch/README.md)를 전체 CEL 또는 보안 인증으로 확대하지 않는다.

**U28 현재 구현의 경로 전체 점검 통과:** [17개 HTTP/Login 동적 위치](t2-path-audit-2026-10-30.md)에서 baseUrl·method·Login request 전체 평가와 공통 문법/경로 오류를 보완했다. Node 22/24 각각 HTTP 261/261, 실제 Node/Chromium 전송 대조 174/174, 합성 transport의 경로 점검 304/304, Node 24의 고의 결함 탐지 6/6이다. 현재 점검 범위에 남은 실패·사용자 선택은 없다. 기존 계약 위반은 추가 질문 없이 수정·검증하고 미구현 core/renderer와 실제 서비스 연결은 별도 범위로 유지한다. API 응답 책임 정정과 기존 헤더 126/126·CEL 크기 18/18 증거도 유지한다.

**U29 후속 연결 검증:** [기존 Query 스케줄러와 HTTP/Login 실행기](t2-query-http-2026-10-30.md)를 실제 loopback HTTP로 연결했다. Node 22/24 각각 39/39 통과·고의 결함 4/4 탐지·미처리 rejection 0건이다. U29 당시 새 계약 위반은 발견하지 않았고 두 기존 구현은 변경하지 않았다. 당시 후속이었던 복합 Query·polling의 추가 검증은 아래 U30을 따른다. 전체 core 통합은 여전히 별도다.

**U30 복합·주기 검증:** [복합 Query와 완료 기준 polling](t2-composite-polling-2026-10-30.md)을 독립 구현해 Node 22/24 각각 복합 48/48·고의 결함 5/5, polling 34/34·고의 결함 7/7·실제 timer/HTTP 1/1을 확인했다. 재사용 비교·오류 위치·fresh 구분·owner cache 정리와 polling 오류 전달을 보완했다. 공유 스케줄러 변경 후 기존 Query 36개/100 seed·Query–HTTP 39개도 재검증했다. 전체 core 완료가 아니다. 당시 미확정이었던 재개 정책은 아래 U31에서 확정했다.

**U31 재개 계약·검증:** [autoRefreshWhen false→true의 즉시 fresh 갱신](t2-polling-resume-2026-10-30.md)을 확정하고 active 뒤 latest pending 한 건 결합·완료 기준 재예약을 검증했다. Node 22/24 각각 polling 54/54·고의 결함 10/10·native HTTP 1/1, 복합 51/51·고의 결함 5/5와 기존 Query/HTTP 회귀를 통과했다. 입력·수동 요청과의 결합 및 재중단 시 보존도 확인했다. 설정 상속·실제 core 통합은 후속이다.

**U32/U33 후속 경계 검증:** [범위·실패 전후 증거](boundary-followup-2026-10-30.md)에 따라 복합 65/65(Node 22/24), URL 63/63(Node 22/24·Chromium), 직접 날짜 39/39(Node 22/24)를 확인했다. 명시 null·입력 escape·대량 Concat, baseline·교체 사전 검증/취소, 날짜 정규화 후 스키마·연도 범위를 보완했다. URL cleanup 실패 때 새 화면 교체 완료와 오류 보고는 사용자가 U33으로 선택했고 해당 질문은 닫혔다. 실제 core/renderer 연결과 날짜 HTTP/URL codec·전체 스키마 조합은 후속이다.

## 근거와 완료 판단

U13은 사용자의 위임에 따른 설계 선택이고, U14는 제시한 세 추천안을 모두 수락한 현재 결정이다. 표현·정규화·오류 사례의 구체화는 기존 위임 범위에서 담당자가 정했다. 과거 제안의 최초 승인으로 소급하지 않으며, E01–E69의 확정 의미를 유지한다. 인수 사례는 구현 위치·실행 명령·실제 결과가 연결되기 전까지 미실행 기대값이다. U15 이후 experiments/의 독립 실험 코드는 작성·실행했다. U36까지 core 본 구현·배포는 수행하지 않았고 문서·실험의 커밋을 명시 요청받았다. U37의 실제 core 구현과 검증은 별도 [제품 인수인계](core-implementation-2026-11-02.md)에 기록했다. 이 문단은 과거 실험의 완료 판단을 설명한다.
