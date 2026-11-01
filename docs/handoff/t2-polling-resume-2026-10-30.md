# T2: autoRefreshWhen 재개 계약과 검증

2026-10-30 · U31 / D86. 사용자는 false→true에서 즉시 한 번 갱신하고, 완료 뒤부터 주기를 시작하며, 이미 실행 중이면 다음 실행 한 건으로 합치도록 문서·실험 수정을 요청했다. 현재 계약의 owner는 [Query 완료 기준 주기 실행](../spec/02-query.md#완료-기준-주기-실행)이다.

U31 당시 결과를 아래에 보존한다. 이후 [U32/U33 후속 경계 검증](boundary-followup-2026-10-30.md)을 이어갔다.

## 변경

마지막 완료 시각을 저장해 예전 deadline을 복원하던 실험 동작을 제거했다. 재개는 fresh 실행 요청 한 건을 만들고 기존 latest pending과 결합한다. 성공·실패·timeout 정리 후 새 interval을 예약한다. 같은 입력/gate 변경 반영 중에는 실행 시작을 한 번으로 모아 재개 직전의 재사용 실행과 추가 fresh 실행이 중복되지 않게 했다.

주기·재개 대기 의도를 입력 변경·수동 호출과 구분했다. 다시 false가 되면 주기 의도만 제거하며 수동 대기자와 입력 변경은 유지한다. 수동 호출자가 취소돼도 함께 대기 중인 재개 요청은 남는다. 실행 중인 요청, gate·준비·refresh 제외, owner 수명과 오류 정제 계약을 유지했다. 내부 pending 필드나 configure hook은 공개 SDK가 아니다.

[U30 최종 소스·결과](../../experiments/t2-query-polling/archive/u30-before-resume/README.md)를 해시 확인 후 보존했다. U30 당시 재개 정책은 private 선택이었으며 이번 변경을 당시 확정 계약 위반의 수정으로 소급하지 않는다.

## 검증 범위

| 범위 | 실행한 사례 |
|---|---|
| 즉시 재개·완료 후 주기 | polling P08/P23/P28/P38: 짧은/긴 중단 후 clock 진행 없이 실행, active 완료 후 fresh 실행, 성공/실패/timeout 뒤 full interval |
| 한 건 결합 | P29–P32: 반복 true/반복 재개, 수동 호출의 선후 순서, 최신 입력, 입력/gate/준비와 재개의 동시 반영 |
| 중단·취소·조건 | P33–P37/P39: 재중단 시 주기만 제거, 수동·입력 보존, 호출자 취소 시 재개 보존, gate/준비/refresh/interval 생략 우회 금지, 시작된 요청 유지 |
| stale 예약 | P21/P22/P28/P29 및 기존 회귀: 취소된 callback 차단, 같은 true 재평가가 실행·deadline을 추가/연기하지 않음 |
| 복합 Query | C28–C30: 재개가 캐시를 우회해 모든 자식을 갱신, 수동·최신 입력과 한 번 결합, 재중단 후 일반 입력 변경의 재사용 유지 |
| 실제 연결 | 복합 H01: 실제 HTTP로 idle 재개와 다음 주기. polling N01: 실제 timer/HTTP의 active 재개 결합과 완료 기준 다음 tick |

## 실행 결과

macOS arm64, Node 22.21.1·24.19.0에서 각각 다음을 확인했다.

| 검사 | 각 Node 버전 결과 | 실행·결과 |
|---|---|---|
| polling | 54/54, 고의 결함 10/10 탐지 | [코드·명령](../../experiments/t2-query-polling/README.md), [Node 22](../../experiments/t2-query-polling/results/node22.json), [Node 24](../../experiments/t2-query-polling/results/node24.json) |
| 실제 timer/HTTP | 1/1, 실제 요청 4건 | 위 polling 결과의 native 항목 |
| 복합 Query | 51/51, 고의 결함 5/5 탐지 | [코드·명령](../../experiments/t2-composite-query/README.md), [Node 22](../../experiments/t2-composite-query/archive/u31-before-boundaries/snapshot/experiments/t2-composite-query/results/node22.json), [Node 24](../../experiments/t2-composite-query/archive/u31-before-boundaries/snapshot/experiments/t2-composite-query/results/node24.json) |
| Query 스케줄러 회귀 | 36/36, 고의 결함 4/4, 고정 seed 100/100 | [Node 22](../../experiments/t2-query-races/results/latest.json), [Node 24](../../experiments/t2-query-races/results/node24.json) |
| Query–HTTP 회귀 | 39/39, 고의 결함 4/4 | [Node 22](../../experiments/t2-query-http/results/node22.json), [Node 24](../../experiments/t2-query-http/results/node24.json) |

polling은 U30의 34건에서 54건으로 확장하고 기존 P08/P23 기대값을 새 계약에 맞췄다. 추가 고의 결함은 재개 요청 누락·입력과 재개의 분리 실행·중단한 재개 의도 잔존이며 지정 사례의 assertion 실패로 탐지했다. 복합 51건 중 50건은 제어 전송/순수 검사, H01 한 건은 실제 HTTP 요청 11건과 제어 clock을 사용한다. native N01은 실제 timer와 HTTP를 사용하며 정확한 운영 지연·성능 측정은 아니다.

모든 suite의 미처리 rejection은 0건이며 종료 뒤 timer·대기자와 복합 owner cache 누수를 검사했다. 현재·U30 보관 결과 16개의 sourceSha256 항목 160건이 대응 소스와 일치했다. 변경 문서의 로컬 링크 대상 332개와 변경 소스/문서의 공백 검사도 통과했다. HTTP 실행기·헤더/경로·CEL 구현은 바꾸지 않았다.

## 남은 범위

이번 재개 계약과 실험 범위에 남은 재현 실패는 없다. 전체 동적 표현식/설정 상속·등록/스키마·브라우저 throttling·Dart·실제 core/StateStore/Action/URL/renderer 연결은 별도다. 기존 독립 실험을 수정한 결과이며 core 본 구현이나 T2 전체 완료를 뜻하지 않는다.
