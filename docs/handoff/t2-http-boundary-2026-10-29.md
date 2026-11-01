# T2 HTTP: 경계 검증과 수정 이력

> 이 문서는 해당 날짜·단계의 기록이다. 아래 미실행·후속·보류 표기를 현재의 승인 대기로 적용하지 않는다. 최신 계약·독립 검증 완료는 [U34–U35 진행표](verification-ledger.md), 새 채팅의 구현 시작과 U36 커밋 범위는 [현재 인수인계](implementation-start.md#새-채팅에서-시작할-때)를 따른다.

최초 기록: 2026-10-29 · 최신 보완 U28: 2026-10-30. U19–U27의 발견·수정 이력을 보존한다. P71 baseUrl 평가 누락은 U28에서 수정했고, [현재 @path 전체 점검 결과](t2-path-audit-2026-10-30.md)는 HTTP/Login 동적 위치 17곳의 통과·미구현 범위를 구분한다. [재실행 코드·명령](../../experiments/t2-http-boundary/README.md)을 따른다.

## U19: 보존한 첫 문제

Chromium fetch는 명시한 `Host: viewstem-probe.invalid`를 무시하고 목적지 URL의 Host를 전송하면서 HTTP 200으로 성공했다. Node `http.request`는 같은 명시 값을 전송했고, 일반 사용자 정의 헤더는 양쪽 모두 보존했다.

| 항목 | U19 관찰값 |
|---|---|
| 명시 Host | `viewstem-probe.invalid` |
| Node에서 수신한 Host | `viewstem-probe.invalid` |
| Chromium에서 수신한 Host | `127.0.0.1:55957` — 당시 임시 서버 주소 |
| Chromium 요청·응답 | 요청 1건, HTTP 200, fetch 예외 없음 |
| 결과 | 세 대조 사례 통과 뒤 H04-browser-host-header 실패·중단 |

[고정 원시 결과](../../experiments/t2-http-boundary/results/host-header-failure.json), [원본 실행 소스](../../experiments/t2-http-boundary/run.mjs), [당시 package.json](../../experiments/t2-http-boundary/results/u19-package.json)을 보존했다. 원본 결과의 package.json 해시는 이 보존본에 대응한다. Node 24.19.0, Chromium 151.0.7922.34, Playwright 1.62.1, macOS arm64였다.

[Fetch 금지 요청 헤더](https://fetch.spec.whatwg.org/#forbidden-request-header)에 Host가 포함되므로 브라우저 버그로 판단하지 않는다. 당시 프로젝트 프로필에 명시 거절 경계가 빠져 있었다.

## U20: 반영한 계약과 헤더 검증

현재 규칙은 [HTTP 전송 프로필](../spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto)이 소유한다. 직접/서버/Login에 공통 금지 이름·접두사를 적용하고, null·뒤의 덮어쓰기로 숨겨도 병합 전에 INVALID_DEFINITION으로 거절한다. 허용 헤더의 요청 우선·null 제거는 유지한다. User-Agent·method override 이름의 추가 제한과 값의 문법/공백 정규화는 v1의 명시적 선택이다.

Node 22.21.1과 24.19.0 각각에서 Node HTTP 63개 + 실제 Chromium fetch 63개, **126/126 통과**했다. 각 실행에서 거절 120건은 네트워크 요청 0건, 허용 6건은 실제 수신을 확인했다. 두 실행의 입력 소스 해시와 사례 결과가 같다. [Node 22 결과](../../experiments/t2-http-boundary/results/headers-node22.json), [Node 24 결과](../../experiments/t2-http-boundary/results/headers-node24.json)에 환경·요청 수·해시를 남겼다.

이것은 독립 guard의 증거다. core 등록/실행 경로, 모든 브라우저, CORS 또는 자동 생성 헤더의 동일성을 검증한 결과로 확대하지 않는다.

## 후속 HTTP 실험의 통과 범위

[독립 실행기](../../experiments/t2-http-boundary/http-probe.mjs)는 실제 Node fetch/loopback HTTP에 연결하고, deadline은 제어 clock으로 검증했다. 서버 응답 gate로 완료 순서를 조절했다. U20 당시 표현식은 fixture에 필요한 @path/concat만 구현했다. U28의 공통 평가 보완도 독립 HTTP 범위이며 전체 CEL·반응형 값 해석기·공개 SDK가 아니다. caller/destination 정책과 secret resolver는 신뢰 문맥의 합성 fixture다.

U20에서 Node 22·24 모두 아래 32개 사례가 통과했고, U21의 변경된 전체 테스트에서도 재확인했다.

| 사례 | 확인한 동작 |
|---|---|
| P01–P04 | 메서드 7종, 현재 요청 정의, auth 없는 secret 헤더, Login의 외부 headers/params 비상속, 요청 우선 병합·공통 경로, 동시 Login·완료 토큰 비공유 |
| P05–P08 | 누락/비문자열/빈/제어문자 토큰·로그인 실패·redirect 시 API 시작 금지, 신뢰 caller/destination, 금지 헤더가 secret 해석/Login보다 먼저 실패 |
| P09–P16 | Login+API 하나의 deadline, 시작 전/진행 중 취소, 취소 무시한 늦은 Login 뒤 API 0건, secret 해석 중 취소, 응답 body 대기 timeout, 긴 timeout의 타이머 분할 |
| P17–P20 | 생략/null/문자열/JSON/form 본문, redirect·실패·잘못된 JSON·비유한 JSON·binary 오류, 204/205 null, 오류 메시지/stack의 합성 secret 비노출 |

[현재 Node 22 결과](../../experiments/t2-http-boundary/results/http-node22.json), [현재 Node 24 결과](../../experiments/t2-http-boundary/results/http-node24.json)는 아래 U21–U27 회귀와 U28 수정을 반영해 **261/261 통과**를 기록한다. 두 환경에서 같은 소스·같은 결과를 확인했다. 호스트의 실제 기본 30초 경과나 서비스 권한 시스템을 검증한 것은 아니다.

## U21: API 응답 책임과 P21 판정 정정

P21의 API는 테스트 작성자가 의도적으로 받은 X-API-Key를 응답 JSON에 넣도록 만든 합성 서버다. 당시 검사는 결과에 같은 문자열이 있는지만 확인했고, 실패의 원인은 API 응답 내용까지 Viewstem이 차단해야 한다는 기대값이었다. 실제 서비스 유출을 발견하거나 실행기가 내부 값을 응답에 추가한 사례가 아니었다.

사용자는 “API가 노출한 건 API 책임”이라고 확정했다. [현재 책임 계약](../spec/01-datasource-auth.md#비밀정보의-책임-경계)에 따라 API의 데이터 응답 body/headers는 API 책임이며, 실행기는 내부 credential/Login 응답의 직접 혼입 방지·평가 문맥·신뢰 권한 검사에 책임진다. 따라서 P21은 API 응답을 보존하고 내부 문맥을 추가하지 않는 것으로 기대값을 정정했다. 응답 전체를 secret 문자열로 검색해 마스킹/거절하라는 권고도 철회했다.

[대체된 U20 기대값의 소스와 결과](../../experiments/t2-http-boundary/archive/u20-response-oracle/README.md)를 보존한다. 그 32/33 실패 결과는 현재 Viewstem 미해결 결함으로 사용하지 않는다. 실행기 코드를 고쳐 통과시킨 것이 아니며, API 응답 전달 동작은 그대로다.

## U21 당시 검증과 수정 전 문제

| 사례 | 당시 결과 |
|---|---|
| P21–P22 | API가 body/headers에 명시한 값을 기본 secret 필터 없이 전달·통과 |
| P23 | 내부 secret·Login의 비공개 body/header·토큰을 공개 결과에 추가하지 않음, console 로그 비노출, 원래 계획 불변·통과 |
| P24–P25 | 권한/secret resolver가 던진 message/stack/cause의 내부 값을 정제, 금지 참조면 전송 0건·통과 |
| P26–P28 | 허용되지 않은 Login/API 목적지·같은 origin의 금지 경로·최종 query 정책 위반 전송 차단·통과 |
| P29 | Login 요청의 /auth/token, API 요청의 /response, 토큰 추출의 /ports 접근 거절·통과 |
| P30 | 당시 토큰 추출의 /secrets 접근을 거절하지 못해 중단. 아래 U22에서 수정·통과 |

P30은 API가 정상 로그인 토큰을 반환하고, 최종 데이터 응답도 `{ok:true}`만 반환하는 fixture다. 요청 정의의 auth.token을 `{"@path":"/secrets/password"}`로 지정했다. 현재 계약은 auth.token을 **Login 응답에서 토큰을 추출하는 단계**로 정의한다.

| 관찰 항목 | Node 22·24 공통 결과 |
|---|---|
| secret resolver 호출 | Login 본문용 1회 + 토큰 추출 단계의 추가 1회 |
| 추가 resolver의 destination | 빈 문자열 — 실제 목적지가 제공되지 않음 |
| 실제 요청 | Login 1건 + 데이터 API 1건 |
| 데이터 요청 Authorization | Login 응답 토큰 대신 합성 password secret을 Bearer 값으로 사용 |
| 공개 실행 결과 | HTTP 200 성공; 기대한 문맥 오류 없음 |

당시 원인은 [수정 전 실행기](../../experiments/t2-http-boundary/archive/u21-token-context/http-probe.mjs)의 evaluate가 /secrets를 일반 context 검사보다 먼저 처리하고, 모든 단계에서 resolver에 접근할 수 있게 한 것이다. 토큰 추출은 `{response}` 문맥으로 호출하지만 이 특별 분기가 문맥 분리를 우회한다. 호출 시 destination도 빈 문자열이다.

API는 이 값을 응답으로 되돌려주지 않았다. **실행기가 내부 값을 읽어 잘못된 단계에 사용하고, 유효한 목적지 없이 resolver를 호출한 문제**다. 당시 합성 resolver는 값을 반환하므로 잘못된 credential 사용까지 관찰했다. 엄격한 서비스 resolver라면 빈 목적지를 거절할 수 있으며, 이 실험이 실제 서비스의 권한 우회·클라이언트 유출을 입증하는 것은 아니다. 그 방어 여부와 무관하게 실행기는 선언된 단계별 문맥과 resolver 인자 계약을 지켜야 한다.

## U22: auth.token 수정과 회귀 검증

사용자가 auth.token에서 Login 응답만 읽도록 수정하고 연속 검증을 재개하라고 요청했다. [현재 계약](../spec/01-datasource-auth.md#1018-공통-값-문법과-서버-전용-평가-문맥)에 따라 평가기에 명시적인 문맥을 전달한다. 요청 구성 문맥에만 승인된 목적지에 연결된 readSecret을 제공하고, 토큰 추출에는 `{response}` 값 문맥만 제공한다. 재귀 평가·함수 인자도 같은 문맥을 이어받으므로 중첩 표현으로 권한을 얻을 수 없다.

[U21 실패의 소스·결과](../../experiments/t2-http-boundary/archive/u21-token-context/README.md)는 별도로 보존했다. 실행기 수정 후 기존 46개와 아래 14개, 합계 **60/60**을 Node 22·24에서 확인한 다음 새 검증으로 진행했다.

| 사례 | 수정 후 확인 |
|---|---|
| P30 | 금지 참조는 REFERENCE_NOT_FOUND. 정상 Login 본문용 조회 1회만 남고, 빈 목적지 resolver 호출 0회·데이터 API 요청 0건 |
| P31 5개 | 중첩 concat에서 /secrets·/ports·/states·/auth·/responseLike 접근 거절. 추가 secret 조회 없음 |
| P32 4개 | 상대 경로·fragment·잘못된 ~ escape·비문자열 Pointer를 INVALID_EXPRESSION으로 거절 |
| P33 5개 | 이스케이프 키·응답 header·허용 함수·secrets라는 이름의 응답 데이터 필드·문법처럼 보이는 반환 문자열을 정상 처리. 내부 secret 접근으로 재해석하지 않음 |

API 응답 내용의 책임은 U21 그대로이며, 정상 API 응답을 secret 문자열로 차단하는 필터는 추가하지 않았다. core 본 구현이나 전체 공통 표현식 엔진의 완성도 아니다.

## U22 당시 실패: 오류 정제 중 발생한 추가 예외

P34는 secret resolver가 undefined/null/문자열/숫자/일반 객체/알 수 없는 코드/비문자열 코드를 던지는 7개 사례다. 모두 정제된 HTTP_ERROR로 반환했다. 이어 P35는 예외의 code 속성이 getter이고, 그 getter가 합성 내부 값을 담은 새 Error를 던지는 경우를 검사했다.

[수정 전 실행기](../../experiments/t2-http-boundary/archive/u22-error-sanitization/http-probe.mjs)의 catch 블록은 `error?.code`를 직접 읽었다. 이 접근이 던진 추가 예외는 해당 catch 안에서 다시 처리되지 않으므로 공개 오류 DTO 대신 Error 객체가 호출자에게 전달된다.

| 관찰 항목 | Node 22·24 공통 결과 |
|---|---|
| 기대 | 내부 값·native stack 없이 `{code:"HTTP_ERROR", message:...}` |
| 실제 | code가 없는 native Error 객체 |
| 공개 message·stack | 합성 내부 secret 문자열 포함 |
| 네트워크 | Login/API 모두 시작 전, 요청 0건 |
| 전체 결과 | 68개 실행·67 통과·P35 실패 |

이것은 정상 API 응답의 데이터 노출이 아니다. 외부 콜백의 예외를 [공개 오류 계약](../spec/07-host-integration.md#공통-오류와-진단)으로 바꾸는 실행기의 오류 경계 문제다. getter가 추가 예외를 던지는 합성 경계 사례이며 실제 서비스가 이런 예외를 생성한다거나 실제 credential이 유출됐다고 주장하지 않는다.

## U23: 오류 정제 보완과 회귀 검증

사용자의 수정 요청에 따라 [오류 정제 계약](../spec/07-host-integration.md#공통-오류와-진단)을 구체화하고 실험 코드의 publicErrorCode를 보완했다. 외부 예외의 직접 저장된 데이터 속성 code가 알려진 문자열인 경우만 사용한다. getter·상속·객체의 형 변환·message/stack/cause를 읽지 않으며, Proxy의 descriptor 검사 자체가 던진 예외도 잡아 고정 HTTP_ERROR로 끝낸다. TIMEOUT/CANCELLED가 이미 확정된 경우 그 결과를 유지한다.

[U22 실패 소스·결과](../../experiments/t2-http-boundary/archive/u22-error-sanitization/README.md)는 보존했다. 수정 후 기존·추가 회귀 검사 **80/80**을 Node 22.21.1·24.19.0에서 통과했다. P35는 native Error 대신 정제된 HTTP_ERROR가 나오고 공개 message/stack의 합성 내부 값 노출이 사라졌다.

| 추가 사례 | 결과 |
|---|---|
| P36 8개 | own/inherited getter, Proxy get·descriptor trap, revoked Proxy, code 강제 변환, Symbol, 다른 필드의 getter를 통한 정제 이탈 없음 |
| P37 2개 | 권한 검사·transport 콜백의 메타데이터 검사 실패도 정제 |
| P38 2개 | 취소·timeout 뒤 늦게 발생한 예외가 확정된 종료 결과를 바꾸지 않음 |

## U23: 실제 Node/Chromium HTTP 전송 대조

[별도 전송 검사](../../experiments/t2-http-boundary/archive/u23-array-pointer/transport-tests.mjs)는 같은 http-probe.mjs/header-profile.mjs를 Node fetch와 실제 Chromium 페이지에서 실행했다. Node 버전마다 31개 Node 사례 + 31개 브라우저 사례, **62/62 통과**했다. [Node 22 실행 기록](../../experiments/t2-http-boundary/archive/u23-array-pointer/results/transport-node22.json), [Node 24 실행 기록](../../experiments/t2-http-boundary/archive/u23-array-pointer/results/transport-node24.json)에 Chromium·Playwright 버전, 요청 수, 소스 해시를 보존했다.

- T01–T03: 메서드 7종, 생략/null/문자열/UTF-8/JSON/+json/form 본문, params 병합·인코딩·반복 키.
- T04–T06: JSON/text/204/205 응답, 잘못된 JSON·비유한 숫자·binary·HTTP 오류·redirect 차단, GET/HEAD body와 미지원 입력의 전송 전 거절.
- T07: native timer의 200ms 설정으로 응답 헤더/본문을 기다리는 요청의 TIMEOUT. 실제 기본 30초 측정이나 처리 시간 benchmark는 아니다.

같은 origin의 합성 loopback 서버만 사용했다. 브라우저 pageerror는 0건, redirect 목적지 요청도 0건이다. CORS·서비스 권한·다른 브라우저·실제 core 통합을 검증한 것으로 확대하지 않는다. http-*.json의 notRun은 그 Node 검사 단독 범위이며, 브라우저 본문/응답 대조는 별도 transport-*.json 결과를 따른다.

## U23 당시 실패: 배열 length를 값 경로로 허용

[현재 값 계약](../spec/10-value-contracts.md#동적-값-평가-프로필)은 객체는 own 속성, 배열은 존재하는 정수 인덱스만 순회하도록 정했다. P39에서 배열 `/1`과 일반 객체의 `/length`는 정상 처리했다. P40에서는 배열의 `-`, `01`, `-1`, `1.0`, 범위 밖 인덱스 `2`를 거절했다.

그러나 P41은 다음 입력을 거절하지 못했다.

```json
{
  "inputs": {"items": ["first", "second"]},
  "request": {
    "method": "POST",
    "path": "/data",
    "body": {"selected": {"@path": "/ports/items/length"}}
  }
}
```

기대는 요청 전 경로 오류다. 실제 Node 22·24 모두 `{ "selected": 2 }`를 서버에 1건 전송하고 HTTP 200으로 성공했다. 원인은 경로 평가기가 배열에도 일반 객체의 own 속성 검사를 적용하기 때문이다. JavaScript 배열의 length는 own 속성이지만 JSON Pointer의 배열 원소는 아니다.

이것은 실험 평가기의 값 계약 위반이며, API 응답 내용·secret 유출·CEL 라이브러리 결함이 아니다. 기존 계약에 맞게 배열 순회에서는 정수 인덱스 여부와 원소 존재를 따로 확인해야 한다. 일반 객체의 length 데이터 필드는 허용하는 동작을 유지해야 한다. 이후 U24에서 아래와 같이 수정했다. [당시 소스·87/88 결과](../../experiments/t2-http-boundary/archive/u23-array-pointer/README.md)는 보존한다.

## U24: CEL 배열 크기와 경로 수정

[CEL 표준 목록 연산](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#list-operators)과 고정된 cel-js 8.0.0을 대조했다. [배열 크기 검사](../../experiments/t1-values/array-size-tests.mjs)는 실제 Environment의 등록 검사·실행과 기존 fromCelInteger 어댑터를 사용하며 Node 22.21.1·24.19.0 각각 **18/18 통과**했다. [Node 22 결과](../../experiments/t1-values/results/array-size-node22.json), [Node 24 결과](../../experiments/t1-values/results/array-size-node24.json)에 버전·소스 해시·표현식·기대/실제 값이 있다.

- `size(items)`와 `items.size()`: 빈 배열 0, 일반/중복/null 원소, 중첩 배열의 바깥 원소 수, 객체 배열, 10,000개 배열.
- 실제 사용 조건: `size(items) == 0`, `items.size() <= 2`, 필터 결과 개수, 내부 배열 개수.
- 결과: count는 CEL int(BigInt)이며 기존 어댑터를 거쳐 안전한 JS 정수로 전달. boolean 조건식은 boolean 유지, 입력 배열 변경 없음.

추가 함수나 CEL 패치는 필요하지 않았다. 이 실험은 CEL 크기 계산과 결과 변환만 검증하며 실제 Variable/Derived 연결·Dart·브라우저 CEL·native Set/Map 전체 지원·성능·비용 제한은 증명하지 않는다.

[HTTP 경로 평가기](../../experiments/t2-http-boundary/http-probe.mjs)는 배열이면 십진 정수 표기·안전한 인덱스·length 범위·own 원소 존재를 검사한다. 객체의 own 속성 읽기는 유지한다. P41은 REFERENCE_NOT_FOUND·요청 0건으로 바뀌었다.

| 회귀 범위 | 결과 |
|---|---|
| P39–P41 | 정상 인덱스·일반 객체 length 유지, 잘못된 인덱스·배열 length 거절 |
| P42 11개 | 배열에 직접 추가한 일반 속성·비정규 인덱스·범위 밖 숫자 키도 거절 |
| P43 5개 | 첫/중첩 인덱스·배열 안 객체 length·객체 01 키·null 원소 허용 |
| P44 3개 | 빈 배열·중첩 length·중첩 범위 밖 인덱스 거절 |

이 시점의 HTTP 검사는 Node 22/24 각각 **107/107 통과**했다. [당시 전송 검사](../../experiments/t2-http-boundary/archive/u24-params-container/transport-tests.mjs)는 같은 실행기에 배열/객체 경로 T08 5개를 추가해 각 실행 **72/72 통과**(Node 36 + 실제 Chromium 36)했다. [Node 22 전송 결과](../../experiments/t2-http-boundary/archive/u24-params-container/results/transport-node22.json), [Node 24 전송 결과](../../experiments/t2-http-boundary/archive/u24-params-container/results/transport-node24.json)는 Chromium 151.0.7922.34·Playwright 1.62.1의 실제 수신/차단 기록이다. 추가한 배열 거절은 전송 0건이고 기존 메서드·본문·응답·timeout 검사도 유지했다.

## U24 당시 실패: params 배열을 객체로 바꿔 전송

[HTTP params 계약](../spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto)은 키별 값을 담은 객체이며, 각 키의 값으로 배열을 허용해 반복 파라미터로 보낸다. P45의 `{tag:["a","b"]}`·`{tag:null}`·빈 객체 참조는 통과했다. 이후 P46에서 다음 동적 입력을 검사했다.

```json
{
  "inputs": {"filters": ["a", "b"]},
  "request": {
    "method": "GET",
    "path": "/data",
    "params": {"@path": "/ports/filters"}
  }
}
```

기대는 params 컨테이너 타입 오류로 전송 전 거절이다. 실제 Node 22·24 모두 `/v1/data?0=a&1=b`로 1건 전송한 뒤 HTTP 200 성공을 반환했다. **111개 실행·110 통과·P46 실패**이며, 결과 파일의 submittedQuery에 실제 수신한 키/값을 보존했다.

원인은 각 선언을 평가한 뒤 타입 검사 없이 Object.assign으로 병합해 배열 인덱스가 객체 키가 되는 것이다. 뒤의 params 인코더는 이미 바뀐 객체를 정상 입력으로 본다. 이는 배열 크기/CEL 문제가 아니라 실험 HTTP 실행기의 입력 검증 누락이다. 각 선언의 평가 결과를 병합 전에 검사해야 하며, `{tag:["a","b"]}`의 정상 반복 키 인코딩은 유지해야 한다. 이후 U25에서 아래와 같이 수정했다. [당시 소스·110/111 결과](../../experiments/t2-http-boundary/archive/u24-params-container/README.md)는 보존한다.

## U25: params 객체의 병합 전 검사

[현재 params 계약](../spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto)에 따라 각 선언의 평가 결과를 paramsObject에서 검사한 뒤 Object.assign으로 병합한다. 생략한 선언은 허용하고 일반 객체가 아닌 값은 INVALID_DEFINITION으로 거절한다. params 인코더와 form의 객체 검사도 같은 판정을 사용한다. 요청 우선·null 제거·배열 값 반복 인코딩은 유지한다.

P46은 INVALID_DEFINITION·네트워크 0건으로 바뀌었다. 아래 회귀를 포함해 Node 22.21.1·24.19.0 각각 **142/142 통과**했다.

| 추가 회귀 | 확인한 동작 |
|---|---|
| P47 24개 | Datasource·실제 요청·Login에서 배열/null/문자열/숫자/boolean/Map/Set/Date로 평가된 params 거절. 뒤의 정상 선언이나 키 제거로 숨길 수 없음. 각 사례 네트워크·secret 조회 0건 |
| P48 3개 | 세 위치의 직접 배열 선언도 거절·전송 0건 |
| P49 4개 | 생략/빈 객체, 요청 우선·제거·반복 값 순서, __proto__/constructor/toString 같은 일반 데이터 키 보존, 입력 계획 불변 |

[당시 전송 검사](../../experiments/t2-http-boundary/archive/u25-header-object/transport-tests.mjs)는 T09 8개를 추가해 각 실행 **88/88 통과**(Node 44 + 실제 Chromium 44)했다. [Node 22 전송 결과](../../experiments/t2-http-boundary/archive/u25-header-object/results/transport-node22.json), [Node 24 전송 결과](../../experiments/t2-http-boundary/archive/u25-header-object/results/transport-node24.json)에 Chromium 151.0.7922.34·Playwright 1.62.1의 수신/차단과 소스 해시를 기록했다. 잘못된 요청 params·덮어쓰기로 가린 공통 params·Login params는 해당 요청을 보내지 않았고 정상 동적 객체의 병합은 실제 수신했다. 같은 origin의 loopback 검사이며 CORS·다른 브라우저·실제 core 통합은 포함하지 않는다.

## U25 당시 실패: headers 객체 참조를 헤더 이름으로 검사

[동적 값 평가 계약](../spec/10-value-contracts.md#동적-값-평가-프로필)은 headers 전체를 동적 영역에 포함한다. P50의 세 사례에서는 Datasource·실제 요청·Login의 개별 헤더 값을 @path로 읽어 정상 전송했다. 이후 P51에서 다음 객체 전체 참조를 검사했다.

```json
{
  "inputs": {"requestHeaders": {"X-Custom": "ordinary-value"}},
  "request": {
    "method": "GET",
    "path": "/data",
    "headers": {"@path": "/ports/requestHeaders"}
  }
}
```

기대는 참조 결과의 헤더 이름/값을 검사한 뒤 X-Custom을 전송하는 것이다. 실제 Node 22·24 모두 INVALID_DEFINITION으로 거절했고 네트워크는 0건이었다. **146개 실행·145 통과·P51 실패**이며, 결과 파일의 outcome/receivedHeader에 거절을 보존했다.

원인은 work()의 headerNames가 표현식을 평가하기 전에 최상위 키 @path를 HTTP 헤더 이름으로 검사하는 것이다. 이는 금지 헤더를 보내는 보안 노출이 아니라 지원해야 하는 정상 입력을 거절하는 실험 코드의 기능 오류다. 정적 선언과 동적 표현식을 구분하고, 동적 결과에도 이름/값·금지 헤더·병합 전 검사를 적용해야 한다. 기존 정적 금지 이름의 Login 전 거절을 없애는 해결책은 계약에 맞지 않는다. 이후 U26에서 아래와 같이 수정했다. [당시 소스·145/146 결과](../../experiments/t2-http-boundary/archive/u25-header-object/README.md)는 보존한다.

## U26: headers 전체 참조와 금지 헤더 검사 유지

[현재 headers 계약](../spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto)에 따라 사전 검사에서 정확한 @path 표현식을 정적 이름 선언과 구분한다. 공통 pointerKeys 검사로 표현식 경로 문법을 확인하고, 해당 요청의 문맥에서 한 번 평가한 결과는 recordObject와 prepareHeaders로 검사한다. 이름/값·금지 이름·대소문자 중복 검사는 각 선언별 병합 전에 수행한다. null 제거 표시는 검사 과정에서 버리지 않고 최종 병합에 전달한다. params 객체 판정도 같은 recordObject를 사용하며 기존 결과는 유지했다.

P51은 정상 X-Custom 수신·HTTP 200으로 바뀌었다. 아래 80개 회귀를 더해 Node 22.21.1·24.19.0 각각 **226/226 통과**했다.

| 추가 회귀 | 확인한 동작 |
|---|---|
| P52 3개 | Datasource·실제 요청·Login의 헤더 객체 전체 참조 정상 수신 |
| P53 54개 | 계약의 금지 이름/대표 접두사 27종 × 문자열/null, 대문자 변형으로 참조해도 전송 0건 |
| P54 4개 | 공통/Login의 동적 Host 거절, 뒤의 제거 선언으로 숨길 수 없음 |
| P55 11개 | 참조 결과의 배열/null/스칼라/Map/Set/Date·중복 대소문자·CRLF·비문자열 값·잘못된 이름 거절 |
| P56 4개 | 헤더 전체 @path의 혼합 필드·상대 경로·잘못된 escape·비문자열 경로는 Login 전에 거절 |
| P57–P60 | 요청 우선·null 제거·문자열 보존·입력 불변, 반환 객체 안의 표현식 비재실행, 정적 금지 헤더는 여전히 Login 전 차단, Login 후 동적 금지 헤더는 최종 API 차단 |

[당시 전송 검사](../../experiments/t2-http-boundary/archive/u26-request-path/transport-tests.mjs)는 T10 17개를 추가해 각 실행 **122/122 통과**(Node 61 + 실제 Chromium 61)했다. [Node 22 전송 결과](../../experiments/t2-http-boundary/archive/u26-request-path/results/transport-node22.json), [Node 24 전송 결과](../../experiments/t2-http-boundary/archive/u26-request-path/results/transport-node24.json)에 Chromium 151.0.7922.34·Playwright 1.62.1의 실제 수신/차단과 소스 해시를 기록했다. 정상 참조·병합은 실제 수신했고, 동적 금지 이름·null·중복·배열·Login 경로·덮어쓰기 우회와 정적 금지 이름은 기대한 단계에서 차단했다. 같은 origin의 loopback 검사이며 CORS·다른 브라우저·실제 core 통합은 포함하지 않는다.

## U26 당시 실패: request.path 표현식을 평가하지 않음

[동적 값 평가 계약](../spec/10-value-contracts.md#동적-값-평가-프로필)은 HTTP request.path의 값도 표현식으로 평가하도록 한다. 필드 이름은 path를 유지하며 그 값에 @path를 사용하는 것이다. P61은 다음처럼 정상 상대 경로를 입력에서 읽는 경우다.

```json
{
  "inputs": {"requestPath": "/data"},
  "request": {
    "method": "GET",
    "path": {"@path": "/ports/requestPath"}
  }
}
```

기대는 `/data`를 읽어 baseUrl의 `/v1`과 결합하고 `/v1/data`를 전송하는 것이다. 실제 Node 22·24 모두 INVALID_DEFINITION으로 거절했고 네트워크는 0건이었다. **227개 실행·226 통과·P61 실패**이며 결과 파일의 outcome/receivedPath에 기록했다.

원인은 send()가 request.path를 evaluate에 전달하지 않고 joinAddress에 바로 넘기는 것이다. 문자열만 받는 주소 결합기는 표현식 객체를 잘못된 경로로 본다. 이는 정상 동적 입력의 평가가 빠진 실험 코드의 기능 오류다. 경로를 평가한 뒤 주소 문법·공통 경로 보존·허용 목적지 검사를 적용하는 연결이 필요하며, URL 검사를 생략하는 해결책은 계약에 맞지 않는다. 이후 U27에서 아래와 같이 수정했다. [당시 소스·226/227 결과](../../experiments/t2-http-boundary/archive/u26-request-path/README.md)는 보존한다.

## U27: request.path 평가와 주소·권한 검사 유지

[현재 path 계약](../spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto)에 따라 send()에서 request.path를 해당 요청의 값 문맥으로 먼저 평가한다. 아직 목적지가 확정되지 않았으므로 이 평가에는 readSecret 권한을 주지 않는다. 평가 뒤 취소/timeout을 다시 확인하고, 기존 joinAddress의 주소 검사·공통 경로 결합과 authorize를 거친 뒤 승인된 목적지를 사용하는 secret resolver를 제공한다. params를 붙인 최종 URL의 권한 재검사도 유지했다.

P61은 `/v1/data` 실제 수신·HTTP 200으로 바뀌었다. 아래 33개 회귀를 더해 Node 22.21.1·24.19.0 각각 **260/260 통과**했다.

| 추가 회귀 | 확인한 동작 |
|---|---|
| P62 4개 | 상대/선행 슬래시 경로, 중첩·이스케이프 키 참조, concat 결과에서 공통 /v1 유지·입력 불변 |
| P63 5개 | null·숫자·boolean·배열·객체 결과는 주소/권한 요청 전에 거절, 반환 객체 재평가 없음 |
| P64 13개 | 절대 URL·네트워크 경로·query/fragment·상위 이탈·인코딩된 이탈/구분자·공백/제어문자·잘못된 percent를 거절. authorize/secret/network 모두 0건 |
| P65–P67 | 평가된 목적지의 신뢰 caller 검사·secret 전 권한 거절, 최종 query URL 재검사, resolver에 평가된 실제 목적지 전달 |
| P68 2개 | Login·데이터 요청의 동적 path 정상 수신, 금지된 Login 목적지는 secret/network 0건 |
| P69 4개 | 주소 평가에서 직접/중첩 secret 조회·Login 응답·Login 전 토큰 접근 거절 |
| P70 2개 | 경로 평가의 비동기 경계에서 취소/timeout이 확정되면 authorize/network 0건·타이머 정리 |

[당시 전송 검사](../../experiments/t2-http-boundary/archive/u27-base-url/transport-tests.mjs)는 T11 12개를 추가해 각 실행 **146/146 통과**(Node 73 + 실제 Chromium 73)했다. [Node 22 전송 결과](../../experiments/t2-http-boundary/archive/u27-base-url/results/transport-node22.json), [Node 24 전송 결과](../../experiments/t2-http-boundary/archive/u27-base-url/results/transport-node24.json)에 Chromium 151.0.7922.34·Playwright 1.62.1의 실제 수신/차단과 소스 해시를 기록했다. 정상 상대 경로와 공통 /v1 수신, 잘못된 동적 주소·목적지 권한 거절·Login 경로 오류·주소 확정 전 secret 권한 부재를 확인했다. 같은 origin의 loopback 검사이며 CORS·다른 브라우저·실제 core 통합은 포함하지 않는다.

## U27 당시 실패: Datasource.baseUrl 표현식을 평가하지 않음

[동적 값 평가 계약](../spec/10-value-contracts.md#동적-값-평가-프로필)은 HTTP baseUrl의 값도 표현식으로 평가하도록 한다. P71은 inputs.baseUrl에 실제 loopback 서버의 `/v1` URL을 넣고 다음처럼 참조했다.

```json
{
  "inputs": {"baseUrl": "http://127.0.0.1:<fixture-port>/v1"},
  "datasource": {"kind": "Http", "baseUrl": {"@path": "/ports/baseUrl"}},
  "request": {"method": "GET", "path": "/data"}
}
```

위 포트 표기는 설명용이며 실제 검사는 서버가 할당받은 숫자 포트를 사용했다. 기대는 baseUrl을 읽어 주소·목적지 검사를 적용하고 `/v1/data`를 전송하는 것이다. 실제 Node 22·24 모두 INVALID_DEFINITION으로 거절했고 네트워크는 0건이었다. **261개 실행·260 통과·P71 실패**이며 결과 파일의 outcome/receivedPath에 기록했다.

원인은 send()가 path는 평가하지만 선택한 baseUrl은 그대로 joinAddress에 전달하는 것이다. URL 생성기는 표현식 객체를 URL 문자열로 사용할 수 없다. 이는 정상 동적 입력의 평가가 빠진 실험 코드의 기능 오류다. baseUrl의 평가·생략 fallback·문자열 검증과 기존 주소/권한 검사를 연결해야 한다. 이후 U28에서 수정했다. [당시 소스·260/261 결과](../../experiments/t2-http-boundary/archive/u27-base-url/README.md)를 보존한다.

## U28: 현재 구현의 @path 전체 점검

사용자는 baseUrl 수정과 함께 같은 종류의 확정 계약 위반을 추가 질문 없이 해결하도록 요청했다. [전체 점검 기록](t2-path-audit-2026-10-30.md)에 17개 적용 위치·공통 평가 보완·문맥/전송 경계·미구현 영역을 남겼다. Node 22/24 각각 HTTP 261/261, 실제 전송 대조 174/174, 경로 점검 304/304를 통과했고 고의 결함 6종도 탐지했다. 현재 점검 범위에 남은 재현 실패는 없다. 기존 헤더 126/126·CEL 크기 18/18 증거를 재사용하며 core 본 구현·CEL 패치·커밋·배포 보류는 유지한다.
