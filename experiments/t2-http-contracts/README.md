# T2 HTTP 인증 7유형·신뢰 경계 검증

현재 `t2-http-boundary/http-probe.mjs`를 수정 없이 가져와 실제 Node fetch와 두 localhost HTTP 서버(API·별도 인증 서버)로 검증한다. core SDK 구현이나 실제 서비스 인증 체계 구축은 이 실험 범위가 아니다.

```sh
node experiments/t2-http-contracts/run.mjs node22.json
/opt/homebrew/opt/node@24/bin/node experiments/t2-http-contracts/run.mjs node24.json
```

Node **v22.21.1**, **v24.19.0**에서 각각 **62/62**, unhandled rejection **0건**이다. 별도 설치 의존성은 없다. [Node 22 결과](results/node22.json), [Node 24 결과](results/node24.json)는 실행 파일·재사용 probe/evaluator/header 모듈의 SHA-256, 사례별 결과, 요청·권한·secret 조회 수와 정리 결과를 기록한다. [coverage.json](coverage.json)은 인수 항목과 7개 인증 유형 각각에 `source`, `result`, `testIds`, `status`, `remaining`을 연결한다.

| 명세 | 유형 | 실제 확인 |
|---|---|---|
| §10.1.1 | 공개 | 인증 헤더·파라미터·secret 조회 없이 GET 전송 |
| §10.1.2 | API Key 헤더 | 선언된 참조를 resolver로 해석해 X-API-Key에 전달 |
| §10.1.3 | API Key params | 해석한 값을 api_key URL 파라미터로 전달 |
| §10.1.4 | 기존 Bearer | 공통 concat·@path로 Authorization 구성 |
| §10.1.5 | Login 후 Bearer | 별도 인증 서버에 로그인하고 API 서버에 Bearer 전달 |
| §10.1.6 | Login 후 헤더 | 생략 baseUrl만 fallback하고 X-Access-Token 전달 |
| §10.1.7 | Login 후 params | 같은 서버 Login 후 access_token 파라미터 전달 |

각 유형의 `A1`–`A7`은 method·주소·헤더·params·본문·입력 `/ports/term`, 신뢰 callback의 caller·destination, 공개 결과와 원본 plan 비변경을 명시적으로 대조한다. 표현식은 기존 probe의 공통 `@path`/concat evaluator에 맡긴다. 새 표현식 평가기·별도 입력 타입 규칙을 만들지 않는다. Node fetch가 자동 생성하는 Accept 등 전송 헤더와 선언된 헤더는 구별한다.

`P1`–`P2`는 7유형 모두에서 신뢰 host caller와 실제 목적지에 따라 authorize callback이 거절하면 secret 조회·네트워크 요청이 모두 0건임을 확인한다. plan과 inputs에 넣은 caller·권한·목적지 주장은 권한을 부여하지 못한다. `P3`–`P4`는 secret을 쓰는 6유형에서 authorize를 의도적으로 허용해도 resolver 자체의 caller·destination 정책이 비밀 사용을 거절하고 전송을 막는지 확인한다. `P5`는 선언 없는 별칭이 resolver까지 도달하지 않음을, `P6`는 최종 params를 붙인 URL의 추가 권한 검사로 전송을 막음을 확인한다.

`L1`은 Login 3유형별 HTTP 실패·누락 토큰·비문자열 토큰으로 데이터 요청이 0건임을 확인한다. 누락된 중첩 응답 참조는 기존 값 계약대로 INPUT_NOT_READY이며 나머지는 HTTP_ERROR다. `L2`는 유형별 두 동시 호출과 후속 순차 호출에서 Login 3회·서로 다른 토큰 3개로 진행 중 공유와 캐시가 없음을 확인한다. `L3`는 바깥 headers·params에 아직 제공할 수 없는 secret을 선언해도 Login이 먼저 독립적으로 성공하고 데이터 단계만 차단됨을 확인한다. 바깥 auth를 재귀 적용하지 않는 것도 Login 요청 수 1건으로 확인한다.

`E1`은 6유형에서 API가 credential을 최종 응답 body에 의도적으로 넣었을 때 그대로 전달됨을 확인한다. U21에 따라 해당 데이터는 API 책임이며 자동 마스킹·필터링하지 않는다. Login 응답의 별도 private 필드는 결과에 덧붙이지 않는다. 합성 credential·수신 원문·Login 응답은 메모리 안에서만 대조하며 report와 console에 덤프하지 않는다. 실패 시 assertion message도 실제 값을 포함할 수 있어 보고서에는 오류 코드·이름만 기록한다.

`S1`은 화면 로드 때 DB fixture에서 읽은 계획과 저장소 원본을 별도 객체로 유지한다. 화면 요청을 `/current`로 편집한 후 DB 원본을 다른 URL·경로·입력으로 교체해도 현재 화면 snapshot의 경로·입력·헤더로 실제 요청한다. dispatch 직후 화면 객체의 추가 변경도 진행 중 계획을 바꾸지 않는다. DB 로드 횟수는 최초 1회로 유지된다. 이는 전달받은 HttpExecutionPlan만 실행하는 경계 검증이며, 미구현 제품의 저장소 adapter 전체를 검증한 것은 아니다.

각 사례 뒤 `server.close` 완료를 기다리고 연결을 닫아 listening 서버·소켓·요청 타이머·fixture 소유 active handle이 모두 0임을 검사한다. 오류·실패 사례에도 같은 정리를 수행한다.

`verified-experiment`는 이 독립 실행 경계의 실행 근거다. H03/H04의 실제 서비스 identity·권한 시스템·secret 저장소·네트워크/DNS 정책, 브라우저/Dart, 제품 core/SDK 통합은 범위 밖이다. localhost 정책 callback은 라이브러리가 trusted contract를 호출하고 거절을 지키는지를 검증하며 운영 서비스 전체 보안 검증으로 해석하지 않는다. 기존 실험·문서는 수정하지 않았다.
