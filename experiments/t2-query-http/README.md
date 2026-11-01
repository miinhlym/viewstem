# T2 Query–HTTP 연결 검증

기존 [Query 스케줄러 실험](../t2-query-races/README.md)과 [HTTP/Login 실행기 실험](../t2-http-boundary/README.md)을 실제 Node fetch·loopback 서버로 연결한다. U29에서는 두 기존 구현을 수정하지 않았다. 실제 Viewstem core·Action·renderer·복합 Query의 구현은 아니다.

## 실행과 결과

Node 22 이상, 추가 패키지 설치 없이 실행한다.

```sh
cd experiments/t2-query-http
node run.mjs node24.json
```

Node 22 실행 파일로 같은 명령을 실행하고 출력 이름을 `node22.json`으로 지정한다. 기본 `npm test` 출력은 `results/node24.json`이며 실제 런타임 버전은 결과 내부에 기록한다.

macOS arm64의 Node 22.21.1·24.19.0에서 각각 **39/39 통과, 고의 결함 4/4 탐지**했다. 처리되지 않은 Promise rejection은 없고, 각 사례 뒤 timer·refresh waiter를 정리했다. [Node 22 결과](results/node22.json)와 [Node 24 결과](results/node24.json)에 source SHA-256, 요청 단계/입력, 입력 세대/owner, Query snapshot, 완료·취소 이벤트를 남겼다.

| 파일 | 역할 |
|---|---|
| [harness.mjs](harness.mjs) | 기존 두 실험의 연결, 실제 HTTP 서버의 응답 보류/해제, 제어 clock, 정리·증거 기록 |
| [scenarios.mjs](scenarios.mjs) | I01–I29의 39개 계약 사례. 여러 입력값 변형 포함 |
| [run.mjs](run.mjs) | 전체 사례·4개 고의 결함 실행, 결과/해시 저장, 실패 시 종료 코드 1 |

실제 요청은 임시 127.0.0.1 서버에만 전송한다. Login/token/secret/caller/권한 정책은 합성 fixture이며 실제 서비스나 credential을 사용하지 않는다. 응답은 테스트가 요청 수신을 확인한 뒤 직접 해제하고, timeout은 기존 FakeClock으로 제어한다. 5초 watchdog은 테스트 교착을 감지하기 위한 한도이며 계약의 timeout 증거로 세지 않는다.

## 확인한 경계

- 단일 직접 HTTP source의 body를 Query data로 전달. null·false·0·빈 문자열·빈 배열을 성공으로 보존.
- 실제 Login 또는 응답 본문 대기 중 입력 변경·A→B→A·gate·미준비 전환. 이전 세대 결과/오류 폐기와 latest pending 1개 유지.
- fresh refresh 대기 결합·차기 요청 완료·실패 전파. 선행 active의 완료로 대기자를 끝내지 않음.
- 호출자 취소는 그 대기자만 종료. Query 폐기·owner 교체는 HTTP 계획을 취소하고 옛 완료의 일시적 상태 덮어쓰기도 차단.
- Login+데이터 요청의 한 deadline, 본문 대기 timeout·disconnect, Query 모형 자체 deadline과 HTTP 취소의 후속 완료 중복 처리 차단.
- 실패 후 마지막 성공 data/dataInputs 쌍 유지·stale, retry, refresh:false, 두 owner의 독립 Login/timeout.
- 입력 snapshot 격리·읽기 보호, 내부 secret/Login 정보의 Query snapshot 비혼입. API가 응답한 내용은 U21 책임 경계를 유지해 전달.

고의 결함은 기존 실험의 입력 세대·fresh 대기·owner 수명·종료 후 재처리 방지 장치를 하나씩 끈 대조군이다. 각각 지정한 assertion이 실패해야 탐지로 센다. 단순 watchdog timeout은 탐지 성공으로 세지 않는다. 테스트 보강 과정에서 최종 상태 외에 owner 교체 직후의 잠깐의 상태 오염도 확인하도록 했다.

## 한계

단일 HTTP source를 기존 Query 프로토타입에 연결한 결과다. 일반 Query DSL·sources/transform·복합 Query·완료 기준 polling·실제 StateStore/Action/URL/renderer 연결, 서버 권한 시스템, CORS·브라우저·Dart 교차 실행은 포함하지 않는다. Query 모형은 node:util 등에 의존하므로 이 연결 검사는 Node에서만 실행했다. HTTP 실행기 자체의 Chromium 전송 증거는 인접 실험에 별도로 있다.

요청과 응답은 실제 네트워크를 거치지만 시간은 주입한 clock으로 제어한다. 운영 네트워크의 지연·부하·성능·모든 순서 조합을 증명하지 않는다. 이미 진행 중인 계획을 gate 변경 때 반드시 물리적으로 중단한다는 새 계약을 만들지 않으며, 결과 게시/후속 pending 실행을 차단하는 기존 의미를 검증한다.

[계약별 결과와 남은 범위](../../docs/handoff/t2-query-http-2026-10-30.md)를 따른다. 이 실험은 production 구현 완료를 뜻하지 않으며, 현재 구현 시작·커밋 범위는 [U36 인수인계](../../docs/handoff/implementation-start.md#새-채팅에서-시작할-때)를 따른다.

## U30 공유 스케줄러 변경 후 회귀

[복합 Query·polling 보완](../../docs/handoff/t2-composite-polling-2026-10-30.md)에서 공유 Query 스케줄러에 fresh metadata·정제 오류 위치/resource·owner 해제 hook이 추가돼 이 연결 검사를 다시 실행했다. Node 22/24 각각 39/39·고의 결함 4/4를 유지한다. 현재 결과는 U30 소스 해시이며 [U29 당시 소스·결과](../t2-composite-query/archive/u30-development/README.md)도 보존했다.

## U31 공유 Query 회귀

[재개 계약](../../docs/handoff/t2-polling-resume-2026-10-30.md)의 pending 의도 구분으로 공유 Query 소스가 바뀌어 Node 22/24 각각 39/39·고의 결함 4/4를 재실행했다. HTTP 실행기는 바꾸지 않았다. 현재 결과는 U31 공유 소스 해시를 담으며 [U30 최종 소스·결과](../t2-query-polling/archive/u30-before-resume/README.md)는 별도 보존한다. 이 suite 자체는 polling 타이밍 검사와 구별한다.
