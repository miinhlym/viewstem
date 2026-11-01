# T2 완료 기준 polling 검증

기존 [Query 경합 프로토타입](../t2-query-races/README.md)에 완료 기준 polling을 붙인 독립 실험이다. 실제 Viewstem core·renderer·공개 SDK의 구현이 아니다. 실험은 이미 계산된 입력/gate와 해석된 refresh/interval 설정을 사용한다. View/Component 설정 상속이나 동적 표현식 해석은 이 폴더의 범위에 포함하지 않는다.

## 실행

Node 22 이상에서 추가 패키지 설치 없이 실행한다.

```sh
cd experiments/t2-query-polling
node run.mjs node24.json
```

Node 22 실행 파일로 같은 명령을 실행하고 결과 이름을 `node22.json`으로 지정한다. `npm test`의 기본 출력은 `results/node24.json`이며 실제 버전은 결과 내부에 기록된다.

## 파일과 검증 범위

| 파일 | 역할 |
|---|---|
| [polling-probe.mjs](polling-probe.mjs) | 기존 ProbeHost를 상속한 PollingHost와 완료 기반 예약. 공유 Query의 pending 의도 구분과 결합 |
| [scenarios.mjs](scenarios.mjs) | 제어 clock·실제 Promise·취소를 무시하는 합성 전송기의 54개 사례 및 10개 고의 결함 증거 |
| [native-smoke.mjs](native-smoke.mjs) | 실제 timer와 기존 HTTP 실행기·Node fetch·loopback 서버를 연결한 1개 검사 |
| [run.mjs](run.mjs) | 전체 실행·정리·고의 결함 탐지·실제 환경/소스 SHA-256 기록 |
| [Node 22 결과](results/node22.json), [Node 24 결과](results/node24.json) | 실행 결과·snapshot/예약/tick trace·고의 결함의 assertion 실패·실제 timer 관찰 |

검증 계약은 [Query 사용 설정](../../docs/spec/02-query.md#사용-설정상태대기-호출의-구체-계약)과 [완료 후 주기 지연](../../docs/spec/09-preserved-contracts.md#함께-보존할-실행api-이력)을 따른다.

| 사례 | 확인하는 동작 |
|---|---|
| P01–P03, P24 | 요청 시작이 아닌 성공/실패/timeout 완료부터 interval을 기다림. 늦은 완료가 다음 deadline을 재설정하지 않음. 실패 뒤 즉시 반복 실행 없음 |
| P04–P07 | 수동 갱신·입력 변경이 즉시 시작하면 기존 poll 예약을 취소. latest pending·fresh 대기자의 실행을 끝내기 전 중복 poll 예약 없음 |
| P08–P13 | autoRefreshWhen은 주기만 막고 최초/입력/수동 실행은 유지. refresh:false의 최초/입력/retry 예외와 수동 거절. executeWhen·입력 준비는 주기에도 적용 |
| P14–P16 | owner 폐기/동일 주소 교체의 timer 정리. 서로 다른 owner의 완료 시각과 주기 독립 |
| P17–P20 | 생략 interval의 숨은 기본값 없음. 0/음수/소수/NaN/Infinity/안전 범위 밖/null/문자열 거절. 최대 안전 정수 허용, native timer의 2,147,483,647ms 한도는 분할 예약 |
| P21–P22, P25–P26 | 이미 취소된 timer callback의 후속 요청 차단·동일 configure의 deadline 보존·호출자만 취소해도 Query polling 유지·gate ABA의 옛 결과 차단 |
| P27 | 정제된 source/transform 오류 location·cause가 polling 완료 훅을 지나도 보존되고, 원시 오류 메시지는 전달하지 않음 |
| P23, P28–P32 | 짧은/긴 중단 후 즉시 fresh, active 뒤 한 건 결합, 반복 true·수동·최신 입력/gate/준비와 동시 반영, 완료 후 새 interval |
| P33–P39 | 재중단 시 주기 의도만 제거, 수동·입력 보존, 호출자 취소 시 재개 유지, 조건 우회 금지, 재개 실패/timeout, 시작된 실행 유지 |
| N01 | 실제 응답을 여러 interval 동안 보류해도 중복 요청 없음. active 중 재개는 다음 한 건으로 합침. 재개 완료 뒤 실제 timer가 deadline보다 먼저 tick하지 않으며 네 번째 요청을 폐기로 취소, timer 0개 |

고의 결함은 시작 시각 기준 예약, 실패 즉시 재시도, 늦은 완료로 재예약, autoRefreshWhen 무시, 폐기 시 timer 미정리, 긴 timer 분할 생략, 완료 훅의 오류 위치 인자 유실, 재개 요청 누락, 입력과 재개의 분리 실행, 중단한 재개 의도 잔존이다. 각각 지정한 정상 계약 사례에서 assertion이 실패해야 탐지로 센다. 단순 watchdog timeout은 탐지 성공이 아니다.

## 결과

macOS arm64의 Node 22.21.1·24.19.0에서 각각 제어 clock **54/54**, 고의 결함 **10/10 탐지**, 실제 timer/HTTP **1/1**을 확인했다. 결과 파일의 summary가 실제 실행 결과이며 미실행 문서 기대값과 구별한다. 정상 사례 뒤 timer·refresh 대기자를 정리하고, 실험 전송기가 무시한 취소의 늦은 완료도 더 이상 timer를 만들지 않는지 검사한다. native 검사는 127.0.0.1 임시 서버만 사용하며 사용자 서비스나 credential을 사용하지 않는다.

native 검사에서는 20ms interval을 설정하고 첫 실제 응답을 50ms 이상 보류한다. 다음 요청의 정확한 운영 지연을 보장하거나 성능을 측정하는 검사가 아니다. 제어 clock 사례가 정확한 경계 시각을 검사하고, 실제 timer 검사는 실제 네트워크/예약 경로의 연결과 조기 tick 방지만 확인한다. 5초 watchdog은 fixture 교착 감지용이다.

## 발견한 문제와 수정

P27에서 기존 Query가 전달한 정제된 location·cause를 polling의 3인자 완료 훅이 버리는 문제를 재현했다. [수정 전 소스·33/34 결과](archive/u30-error-forwarding/README.md)를 보존하고, 완료 훅이 모든 인자를 그대로 전달하도록 바꿨다. 현재 P27은 정제된 위치·중첩 원인 보존, 원시 메시지 제거, 다음 주기에서 정상 복구를 확인하며 해당 보호를 제거한 고의 결함도 탐지한다. 이는 실험 연결부의 확정 오류 계약 위반을 수정한 기록이다.

## 재개 정책과 구현 경계

PollingHost는 `mount(name, {intervalMs, ...QueryOptions})`에서 기존 Query 객체를 반환한다. 기존 실험의 `_drain`, `_finish`, `configure`, `dispose`에 private hook을 붙이므로 그 소스 해시와 함께 검증한다. 이 hook 이름·상속 구조는 공개 SDK 계약이 아니다. 성공·실패·timeout 뒤 다음 예약을 통합하고, active/pending 실행이 먼저 시작되면 poll timer를 남기지 않는다.

[U31 재개 계약](../../docs/spec/02-query.md#완료-기준-주기-실행)에 따라 false→true는 즉시 fresh 요청 한 건을 만든다. active가 있으면 latest pending에 합치며, 완료 뒤부터 새 interval을 예약한다. 마지막 완료 시각을 저장하지 않고 중단 전 deadline이나 누락 주기를 복원하지 않는다. true 재평가·최초 true는 추가 요청이 아니다. 실행 조건과 interval 생략은 그대로 존중한다.

공유 Query의 pending에서 주기 의도를 입력 변경·수동 대기자와 구분했다. 다시 false가 되면 주기 의도만 제거하며 이미 시작된 실행과 다른 실행 계기는 보존한다. 입력/gate/준비와 재개를 같은 configure에서 반영할 때 중복 실행하지 않는다. 이 필드/hook은 private 구현 선택이다.

[U30 최종 소스·결과](archive/u30-before-resume/README.md)는 별도 보존하며 현재 결과 파일은 U31 소스 해시와 결과다. [U31 전체 증거](../../docs/handoff/t2-polling-resume-2026-10-30.md)에 복합 Query·공유 스케줄러·Query–HTTP 회귀 범위를 함께 기록했다.

동시 wall-clock timer의 우선순위, 브라우저 background throttling, Dart, 실제 StateStore/renderer·설정 상속·등록/스키마 검증·일반 Query DSL은 포함하지 않는다. timer 최대 분할 검사는 제어 clock에서 수행했으며 수십 일의 실제 벽시계를 기다린 결과가 아니다. 이 실험은 production 구현 완료를 뜻하지 않으며, 현재 구현 시작·커밋 범위는 [U36 인수인계](../../docs/handoff/implementation-start.md#새-채팅에서-시작할-때)를 따른다.
