# T2: @path 전체 적용 위치 점검

> 이 문서는 해당 날짜·단계의 기록이다. 아래 미실행·후속·보류 표기를 현재의 승인 대기로 적용하지 않는다. 최신 계약·독립 검증 완료는 [U34–U35 진행표](verification-ledger.md), 새 채팅의 구현 시작과 U36 커밋 범위는 [현재 인수인계](implementation-start.md#새-채팅에서-시작할-때)를 따른다.

2026-10-30 · U28 / D84. 사용자는 Datasource.baseUrl을 수정하고, 같은 종류의 @path 계약 위반은 전체 검사해 추가 질문 없이 해결하도록 요청했다. 따라서 기존 계약에 정답이 있는 버그는 고치고 계속 검증하며, 서로 다른 선택지에 대한 결정이 필요한 경우만 논의한다. 기존의 첫 결함 발견 시 중단 방식은 이번 요청에 적용하지 않는다.

현재 계약은 [값 평가 프로필](../spec/10-value-contracts.md#동적-값-평가-프로필)과 [HTTP 전송 프로필](../spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto)이 소유한다. 이 문서는 독립 실험의 점검 범위·결과를 기록한다. core 본 구현·CEL 패치·커밋·배포 보류는 유지한다.

## 점검 대상의 전체 목록

archive·node_modules를 제외한 현재 experiments 소스를 조사했다. 실제 @path 평가 구현은 HTTP 실험 한 곳이며, 공통 평가를 [value-expressions.mjs](../../experiments/t2-http-boundary/value-expressions.mjs)로 분리했다. 아래 17개 동적 값 위치를 하나씩 양성 참조와 잘못된 혼합 표현식으로 검사했다. 개별 헤더/파라미터 값·중첩 객체/배열은 같은 재귀 평가기를 통과한다.

| 영역 | 검사한 위치 | 평가 문맥과 소비 경계 |
|---|---|---|
| Datasource | baseUrl | 선택한 요청에서만 평가, 문자열·URL·목적지 검사 |
| Datasource | headers | 전체 객체/개별 값 평가 후 병합 전 헤더 검사 |
| Datasource | params | 전체 객체/개별 값 평가 후 병합 전 객체 검사 |
| 데이터 요청 | request.baseUrl | 생략만 Datasource fallback, 명시 null/오류는 거절 |
| 데이터 요청 | request.method | 7종 메서드, 본문 허용·HEAD 응답 의미에도 반영 |
| 데이터 요청 | request.path | 상대 경로·공통 경로 보존·목적지 검사 |
| 데이터 요청 | request.headers | 요청 우선 병합, 금지 이름·null·대소문자 중복 검사 |
| 데이터 요청 | request.params | 요청 우선·null 제거·반복 값 순서 유지 |
| 데이터 요청 | request.body | 재귀 평가 후 JSON/form/text 프로필 검사 |
| Login | datasource.auth.request 전체 | 한 번 읽은 요청 객체의 반환 데이터는 재평가하지 않음 |
| Login | datasource.auth.request.baseUrl | 생략만 Datasource fallback, 외부 headers/params/auth 비상속 |
| Login | datasource.auth.request.method | 평가된 메서드의 전송·본문·응답 의미 |
| Login | datasource.auth.request.path | Login 자체의 주소·권한 검사 |
| Login | datasource.auth.request.headers | Login 목적지 승인 뒤 평가·병합 전 검사 |
| Login | datasource.auth.request.params | Login 목적지 승인 뒤 평가·객체 검사 |
| Login | datasource.auth.request.body | Login 목적지 승인 뒤 평가·본문 검사 |
| 토큰 추출 | datasource.auth.token | 해당 Login의 /response만 허용 |

Query 경합 실험은 이미 계산된 입력·게이트를 받으며 @path 해석기를 갖지 않는다. URL 경합 실험의 State 키·codec도 값 표현식을 실행하지 않는다. T1은 CEL·값 어댑터 실험이다. core·State.initial·Action의 값/조건/출력·Query transform/게이트·Component/View의 when/repeat/event·포트/target 핸들 해석은 아직 구현되지 않았다. 이 영역은 누락된 구현을 새로 만드는 대신 미검증으로 남긴다. 문서 예시·과거 archive를 현재 구현으로 세지 않는다.

## 수정한 계약 위반

- **평가 누락:** 선택한 baseUrl·method와 Login request 전체를 평가한다. 기존 path·headers·params·body·token과 동일한 평가기를 사용한다. 쓰지 않는 fallback은 실행하지 않고 명시 null을 생략으로 보지 않는다.
- **표현식 형태·escape:** @path 단독, @call+args 정확한 형태만 허용한다. 혼합/알 수 없는 예약 키를 무시하지 않고 거절하며 @@는 한 번만 해제한다. 원래 선언은 재귀 평가하지만 참조·함수 반환 데이터는 다시 실행하지 않는다.
- **경로·오류 구분:** own 객체 속성·정규 배열 인덱스·JSON Pointer escape를 적용한다. 선택 속성 missing은 명시 HTTP에서 INPUT_NOT_READY, null/스칼라/컬렉션 내부 순회는 TYPE_MISMATCH로 구별한다. 허용되지 않은 루트·미등록 포트·잘못된 배열 인덱스는 REFERENCE_NOT_FOUND다.
- **함수·사전 검사:** concat은 문자열만 결합하고 formatString은 계약의 스칼라 치환·$$를 지원한다. 원래 선언의 잘못된 표현식/Pointer/정적 보간 문법은 Login·secret 조회 전에 검사한다. 반환 문자열은 재보간하지 않는다.
- **소비 경계:** 참조로 받은 native Map/Set/Date나 순환 객체를 JSON body로 조용히 `{}` 처리하지 않고 거절한다. HTTP 계획 전에 수행할 Set/Map 변환·날짜 정규화의 전체 어댑터를 이 실험에 추가한 것은 아니다.

method·주소를 평가할 때 secret resolver 권한은 없다. 주소 검사와 신뢰 caller의 목적지 승인을 받은 뒤 요청 구성에만 resolver를 제공하고, 최종 query URL도 재승인한다. 정적 금지 헤더는 Login 전에, 동적 결과의 금지 헤더는 해당 요청 전에 거절한다. auth.token은 /ports·/auth·/secrets·다른 호출의 응답을 읽지 않는다. 취소·timeout·안전한 오류 정제와 U21의 API 응답 책임 구분을 유지한다.

기존 테스트의 기대값도 현재 계약에 맞췄다. P05의 없는 Login 토큰 속성은 INPUT_NOT_READY이며 Login 1회·데이터 API 0회는 그대로다. P32의 잘못된 토큰 Pointer는 이제 사전 문법 검사에서 막혀 Login/secret 조회도 0회다. 반환한 정상 API body/headers에 secret과 같은 문자열이 있다는 이유로 응답을 막는 검사는 추가하지 않았다.

## 실행 증거

환경은 macOS arm64, Node 22.21.1·24.19.0, Chromium 151.0.7922.34, Playwright 1.62.1이다. 결과 파일에 실행 환경·소스 SHA-256·개별 기대/관찰값을 기록했다. 실제 전송은 임시 loopback 서버만 사용하며 credential·권한 정책은 합성 fixture다.

| 검사 | 결과 | 증거 |
|---|---|---|
| 기존 HTTP 회귀 P01–P71 | 각 Node 버전 261/261 | [Node 22](../../experiments/t2-http-boundary/results/http-node22.json) · [Node 24](../../experiments/t2-http-boundary/results/http-node24.json) |
| 실제 HTTP 전송·본문·응답·수명 대조 | 각 실행 174/174: Node 87 + Chromium 87 | [Node 22 실행](../../experiments/t2-http-boundary/results/transport-node22.json) · [Node 24 실행](../../experiments/t2-http-boundary/results/transport-node24.json) |
| 17개 위치·공통 경로/문법/문맥 점검 | 각 실행 304/304: Node 152 + Chromium 152 | [공유 사례](../../experiments/t2-http-boundary/path-audit-cases.mjs) · [Node 22 실행](../../experiments/t2-http-boundary/results/path-audit-node22.json) · [Node 24 실행](../../experiments/t2-http-boundary/results/path-audit-node24.json) |
| 고의 결함 6종 | Node 24에서 6/6 탐지 | [검사 코드](../../experiments/t2-http-boundary/path-audit-mutations.mjs) · [결과](../../experiments/t2-http-boundary/results/path-mutations-node24.json) |

304개 경로 점검은 실제 Chromium 페이지에서도 같은 모듈을 실행하지만 HTTP transport는 양쪽 모두 합성이다. 실제 네트워크 전송 증거는 별도의 174개 검사다. 두 집합을 섞어 304건 모두 실제 서버에 전송했다고 표시하지 않는다. 17곳 각각의 양성/음성 외에 중첩·이스케이프·배열·미존재·타입·함수·금지 문맥·반환 데이터·헤더 우회를 검사했다. 모든 가능한 입력의 완전성이나 전체 core 적합성을 증명하는 결과는 아니다.

고의 결함은 baseUrl 미평가, method 미평가, 혼합 @path 허용, @@ 미해제, auth.token에 /ports 노출, 금지 헤더 검사 제거다. 각각 지정한 증거 사례가 실패했다. 임시 복사본에서만 변경하고 원본 구현은 수정하지 않았다. 이 검사는 테스트가 해당 결함을 실제로 탐지함을 확인한다.

소스/입력이 그대로인 기존 헤더 126/126과 CEL 배열 크기 18/18은 재사용한다. [U27 수정 전 P71 소스·결과](../../experiments/t2-http-boundary/archive/u27-base-url/README.md)를 보존했고 [이전 HTTP 이력](t2-http-boundary-2026-10-29.md)의 중단 기록을 현재 실패로 사용하지 않는다. 재실행 명령은 [실험 README](../../experiments/t2-http-boundary/README.md)에 있다.

## 남은 범위

이번에 점검한 현재 HTTP @path 구현에서는 남은 재현 실패가 없다. 새로운 사용자 선택이 필요한 계약 충돌도 발견하지 않았다. 위의 미구현 core/핸들/반응형 문맥·추가 함수 등록, 서비스 권한/secret 저장소, CORS·다른 브라우저, 전체 값·날짜 DTO 연결은 이 결과로 검증되지 않는다. T1/T2 전체 완료나 T3/T4 실행으로 표시하지 않는다.
