# T2: 복합 Query와 완료 기준 polling

> 이 문서는 해당 날짜·단계의 기록이다. 아래 미실행·후속·보류 표기를 현재의 승인 대기로 적용하지 않는다. 최신 계약·독립 검증 완료는 [U34–U35 진행표](verification-ledger.md), 새 채팅의 구현 시작과 U36 커밋 범위는 [현재 인수인계](implementation-start.md#새-채팅에서-시작할-때)를 따른다.

2026-10-30 · U30 / D85. 사용자는 복합 Query와 완료 기준 polling의 검증을 요청하고, 확정 계약 위반은 추가 질문 없이 수정·문서화하도록 했다. 새 production core를 구현하는 대신 두 독립 실험과 기존 스케줄러의 연결을 검증했다.

U30 당시 결과는 아래에 보존한다. 이후 [U31 재개 계약·현재 검증](t2-polling-resume-2026-10-30.md)에서 재개 정책을 확정했다.

## 전체 점검 범위

| 계약 영역 | 실제 검사 | 제외/한계 |
|---|---|---|
| Query 그래프 | 형제 독립 실행·완료 순서 역전, 명시 하위 inputs, ref/inline, 비순환 diamond, 미사용 정의까지 순환/참조 오류, 필수 바인딩 누락 전송 전 거절 | 전체 리소스 스키마·포트 기본값/타입·등록/교체 트랜잭션 |
| 결합과 재사용 | 하위 Query의 유효 입력 비교, 바뀐 입력만 재실행, 전체 준비 후 data/dataInputs 원자 교체, 부분/obsolete 성공 미반영, owner/사용 경로 분리·정리 | 직접 HTTP source 필드별 의존성 최적화·모든 그래프/순서 |
| 변환 | Concat 순서/중복/이질 값, Join left/right/inner·복합키·엄격 타입·null·다중 매칭·충돌·미매칭·누락 키/타입 오류 | CEL/임의 사용자 변환 함수·v1 외 내장 변환 |
| 실패·fresh | 마지막 전체 성공 유지·stale, source/transform location·cause, fresh waiter와 입력 변경, 수동/retry/주기에는 재사용으로 실제 갱신 생략 금지 | 실제 Action 후속 단계·View 오류 표시 |
| polling | 전체 완료 후 interval, 실패/timeout 뒤 즉시 재시도 금지, active/pending 우선, 조건·입력 변경·수동 호출, 종료/교체/늦은 callback·완료, 긴 timer 분할 | 당시 미결 재개 정책은 U31에서 후속 검증·브라우저 throttling |
| 실제 연결 | 복합+polling+HTTP의 부분 응답·재사용·주기 실패·회복, 별도 실제 timer+HTTP smoke | 서비스 권한/secret 저장소·CORS·Dart·core/renderer |

현재 계약은 [Query 상세](../spec/02-query.md), [보존한 실행 정책](../spec/09-preserved-contracts.md#함께-보존할-실행api-이력), [공통 오류](../spec/07-host-integration.md#공통-오류와-진단)가 소유한다. 두 실험의 private class/hook/fresh metadata를 공개 SDK로 승격하지 않는다.

## 발견한 문제와 수정

1. **같은 입력을 재사용하지 않음:** 공통 값 평가가 만든 null-prototype 객체와 저장된 일반 객체를 prototype까지 비교했다. 복사한 동일 값 표현으로 비교해 E69의 하위 Query 재사용을 복원했다. falsy 결과도 존재하는 성공값으로 재사용한다.
2. **오류 위치 유실:** 기존 Query 모형이 `{code,message}`만 만들며 source/transform의 location·cause를 버렸다. public code·문법상 경로·정제된 cause를 보존하고 raw message/stack/getter에 의존하지 않도록 보완했다.
3. **fresh와 입력 변경의 구분 누락:** 재사용을 연결하려면 실행 계기를 구별해야 했다. 수동/retry/periodic과 대기 중 이동하는 fresh 요청을 private metadata로 전달해 입력이 같아도 갱신을 실행한다. 입력 변경용 자동 실행의 유효 결과 재사용은 유지한다.
4. **이전 owner cache 정리 누락:** 같은 주소로 Query를 교체하면 이전 owner의 cache가 남았다. Query dispose와 transport의 owner 해제를 연결했다. 늦은 완료가 제거된 cache를 복구하지 못하는 검사도 유지했다.
5. **실행 경로와 선언 문서 위치 혼동:** 참조된 하위 Query의 오류 경로를 부모 실행 경로에 이어 붙이면 실제 JSON 문서에 없는 경로가 된다. 참조는 하위 Query의 resource ID와 `/spec/...`, 인라인은 포함 문서의 `/spec/sources/별칭/query/...` 경로로 고쳤다. 기존 기대값도 이 오류를 놓쳤으므로 [보완 전 결과와 소스](../../experiments/t2-composite-query/archive/u30-location-before-resource/README.md)를 보존한다. 부모 source와 자식 원인은 cause로 연결한다.
6. **polling 연결부의 오류 위치 유실:** 완료 hook이 새 오류 인자를 전달하지 않았다. 모든 인자를 전달하고 polling 상태의 source location/cause 보존을 검사했다.

[첫 연결 실패·기존 증거 snapshot](../../experiments/t2-composite-query/archive/u30-development/README.md), [owner 정리 전 실패](../../experiments/t2-composite-query/archive/u30-cache-lifetime/README.md), [polling 오류 인자 유실의 33/34 실패](../../experiments/t2-query-polling/archive/u30-error-forwarding/README.md)를 보존한다. 개발 중 실패를 현재 미해결 결함이나 실제 서비스 장애로 표시하지 않는다.

첫 복합 연결의 40개 중 10개 실패는 위 재사용/위치 문제의 여러 증상이며 서로 다른 10개 root cause가 아니다. 필수 하위 입력 선언 누락은 runtime까지 미루지 않고 정의 검사에서 전송 0건으로 거절하도록 검사도 정렬했다.

## 실행 결과

macOS arm64, Node 22.21.1·24.19.0에서 각각 아래를 확인했다.

| 검사 | 각 Node 버전 결과 | 증거 |
|---|---|---|
| 복합 Query·변환·캐시·polling 연결 | 48/48, 고의 결함 5/5 탐지 | [코드·명령](../../experiments/t2-composite-query/README.md), [Node 22](../../experiments/t2-query-polling/archive/u30-before-resume/snapshot/experiments/t2-composite-query/results/node22.json), [Node 24](../../experiments/t2-query-polling/archive/u30-before-resume/snapshot/experiments/t2-composite-query/results/node24.json) |
| 완료 기준 polling | 제어 clock 34/34, 고의 결함 7/7 탐지 | [코드·명령](../../experiments/t2-query-polling/README.md), [Node 22](../../experiments/t2-query-polling/archive/u30-before-resume/snapshot/experiments/t2-query-polling/results/node22.json), [Node 24](../../experiments/t2-query-polling/archive/u30-before-resume/snapshot/experiments/t2-query-polling/results/node24.json) |
| 실제 timer·HTTP smoke | 1/1, 실제 요청 2건 | 위 polling 결과의 native 항목 |
| 기존 Query 스케줄러 회귀 | 36/36, 고의 결함 4/4, 고정 seed 100/100 | [Node 22](../../experiments/t2-query-polling/archive/u30-before-resume/snapshot/experiments/t2-query-races/results/latest.json), [Node 24](../../experiments/t2-query-polling/archive/u30-before-resume/snapshot/experiments/t2-query-races/results/node24.json) |
| 기존 Query–HTTP 연결 회귀 | 39/39, 고의 결함 4/4 | [Node 22](../../experiments/t2-query-polling/archive/u30-before-resume/snapshot/experiments/t2-query-http/results/node22.json), [Node 24](../../experiments/t2-query-polling/archive/u30-before-resume/snapshot/experiments/t2-query-http/results/node24.json) |

복합 48건 중 H01 한 건은 **실제 HTTP 요청 7건**을 사용하며, 47건은 합성 전송/제어 clock 또는 순수 변환/정의 검사다. H01도 clock은 제어한다. polling의 별도 native smoke는 실제 timer와 HTTP를 연결하지만 정확한 운영 지연이나 성능을 약속하지 않는다. 모든 네트워크는 127.0.0.1 임시 서버이며 실제 서비스 credential을 사용하지 않는다.

고의 결함은 실제 입력 불일치 재사용·부분/obsolete cache commit·fresh 무시·owner 정리 생략과, 시작 기준 timer·즉시 실패 재시도·늦은 완료 재예약·주기 조건 무시·timer 미정리/미분할·오류 인자 누락이다. 지정한 정상 시나리오의 assertion이 실패한 경우만 탐지로 센다. 단순 watchdog timeout은 통과 증거가 아니다.

결과에 환경·소스 SHA-256·시간순 trace를 남겼다. 정상 사례 종료 뒤 timer/대기자/owner cache와 처리되지 않은 Promise rejection은 남지 않는다. 공유 Query 소스가 바뀌어 기존 36개/39개 회귀도 재실행했다. HTTP 실행기·헤더·@path·CEL 크기 소스는 그대로여서 이전 결과를 재사용한다.

## 계약으로 확대하지 않는 구현 선택

재사용은 현재 실험에서 명시 inputs를 가진 하위 Query 사용 경로 단위다. root 전체 성공 후에만 staged cache를 반영하는 보수적 내부 전략을 사용한다. 다른 구현이 유효한 부분 source를 내부적으로 보관하는 모든 경우를 금지한다는 새 계약은 아니다. 공개 성공으로 부분 결과를 발표하지 않는 의미가 확정 사항이다.

U30 당시 autoRefreshWhen 재개 deadline은 미확정이었다. 당시 실험은 마지막 완료 deadline을 유지하는 private 선택을 사용했다. 이 동작은 [U31의 즉시 fresh 갱신·완료 기준 새 주기](t2-polling-resume-2026-10-30.md)로 대체됐다. U30 결과를 현재 재개 계약의 검증 증거로 사용하지 않는다.

## 현재 판단

요청한 독립 실험 범위의 복합 Query·완료 기준 polling 및 두 기능의 실제 HTTP 연결은 통과했고, 발견한 확정 계약 위반은 수정했다. 이 범위에 남은 재현 실패는 없다. 전체 JSON Schema/포트 기본값·native 값·예산/대규모 그래프·등록/교체 원자성·브라우저/Dart·실제 core/StateStore/Action/URL/renderer 연결은 미검증이다. T1/T2 전체나 T3/T4 완료로 표시하지 않으며 core 본 구현·CEL 패치·커밋·배포 보류는 유지한다.
