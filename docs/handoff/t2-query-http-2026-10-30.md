# T2: Query 스케줄러와 실제 HTTP 연결 검증

> 이 문서는 해당 날짜·단계의 기록이다. 아래 미실행·후속·보류 표기를 현재의 승인 대기로 적용하지 않는다. 최신 계약·독립 검증 완료는 [U34–U35 진행표](verification-ledger.md), 새 채팅의 구현 시작과 U36 커밋 범위는 [현재 인수인계](implementation-start.md#새-채팅에서-시작할-때)를 따른다.

2026-10-30 · U29. 사용자의 계속 진행 요청에 따라, 각각 검증했던 [Query 경합 모형](t2-query-races-2026-10-29.md)과 [HTTP/Login 실행기](t2-http-boundary-2026-10-29.md)를 연결했다. 기존 두 구현은 수정하지 않고 테스트 연결부·시나리오·실행기를 추가했다. 새 계약을 선택하거나 core 본 구현을 시작한 것이 아니다.

## 범위와 판단 기준

직접 HTTP source의 응답 body를 자동 Query 사용 인스턴스의 data로 전달한다. 실제 Login·데이터 요청·본문 수신과 입력/gate/소유 수명/refresh 변화가 겹칠 때 [Query 계약](../spec/02-query.md#사용-설정상태대기-호출의-구체-계약), [마지막 성공 보존](../spec/02-query.md#실패-후-마지막-성공-결과의-보존), [HTTP 실행 수명](../spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto)이 함께 유지되는지 검사했다.

일반 Query 정의의 파싱·sources/transform을 구현한 것이 아니라 단일 HTTP source의 계약을 실험 연결부로 옮겼다. 실제 core/StateStore/Action/renderer와의 통합으로 표시하지 않는다. 실행한 각 그룹과 남은 범위를 아래에 대응시킨다.

| 사례 | 실제 확인한 동작 |
|---|---|
| I01 7종 | body가 data이며 응답 envelope를 추가하지 않음. null/false/0/빈 문자열/빈 배열/배열/객체 성공 뒤 새 입력의 실패에서 이전 data/dataInputs·stale 유지 |
| I02, I04–I07, I19 | Login/본문 대기 중 입력 연속 변경·A→B→A·gate 닫힘·입력 미준비. 옛 결과/오류 폐기, latest pending 입력만 실행, fresh 대기자는 유효 실행으로 이동 |
| I03, I23–I24 | fresh 요청의 대기 결합·다음 갱신의 분리. 선행 active 실패는 fresh 대기자를 실패시키지 않으며 실제 fresh 실패는 대기자에게 전파 |
| I08–I11, I26, I28 | 대기자만 취소·유일한 pending 취소·시작한 refresh의 호출자 취소. owner 폐기/교체는 HTTP abort, 옛 owner의 일시적 오류/결과 게시도 차단 |
| I12–I14, I21, I25, I27 | Login/본문 timeout·연결 끊김·독립 owner timeout. Login+데이터 요청 한 deadline. 모형의 선행 timeout 이후 HTTP CANCELLED가 늦게 와도 TIMEOUT을 덮지 않음 |
| I15 4종, I16 | Login 상태 오류·누락/잘못된 token·JSON 오류는 API 시작 차단. 정적 금지 헤더는 Login/secret 조회 전 거절되고 Query 오류로 연결 |
| I17, I29 2종 | refresh:false에서도 error 상태의 retry 허용. gate/입력 미준비에서는 시작 요청·네트워크 0건, 준비 후 정상 실행 |
| I18, I20, I22 | 입력 snapshot 격리/보호·이전 snapshot 보존, owner별 Login/token 독립. 내부 인증정보는 snapshot에 추가하지 않고 API가 명시적으로 반환한 내용은 그대로 전달 |

## 결과와 검증 강도

macOS arm64의 Node 22.21.1·24.19.0에서 각각 **39/39 통과**했다. 각 사례의 실제 fetch/loopback 요청·응답과 Query snapshot을 assertion으로 확인했다. **고의 결함 4/4**도 각 환경에서 탐지했다. 입력 세대 검사 제거, fresh 대기를 기존 active에 잘못 연결, owner 수명 검사 제거, 완료한 실행의 재반영 차단 제거가 각각 지정한 증거 사례에서 assertion 실패를 냈다.

처리되지 않은 Promise rejection은 0건이며 사례별 timer·대기자를 정리하고 서버·연결을 닫았다. 초기 대조군 점검에서 최종 상태만으로 잠깐의 owner 오염을 놓칠 수 있어, 교체 직후 상태와 옛 owner의 accept 기록도 검사했다. 대조군의 watchdog timeout을 계약 위반 탐지로 잘못 세지 않도록 명시 assertion을 보강했다. 정상 실행기에서 새 계약 위반을 발견한 것은 아니다.

- [실험 구조·재실행 명령](../../experiments/t2-query-http/README.md)
- [39개 시나리오](../../experiments/t2-query-http/scenarios.mjs)
- [Node 22 원시 결과](../../experiments/t2-query-http/results/node22.json) · [Node 24 원시 결과](../../experiments/t2-query-http/results/node24.json)

결과에는 두 기존 실험을 포함한 소스 11개의 SHA-256, 실행 환경·요청 단계/입력·계획의 owner/generation·snapshot·완료/취소 이벤트를 남겼다. 실제 secret은 사용하지 않는다. clock은 제어하며 응답은 실제 수신을 확인한 뒤 해제한다. 운영 시간의 성능 측정이나 모든 실행 순서의 탐색은 아니다. Node만 실행했고 Chromium·Dart에서 이 연결을 검증한 결과로 확대하지 않는다.

기존 Query 36개/4개 대조군/100개 seed, HTTP 261개, 실제 HTTP Node/Chromium 174개, @path 304개 결과는 소스·입력이 변하지 않아 재실행 없이 유지한다. 이번 결과는 이들에 별도의 연결 증거를 추가한다.

## 남은 범위

점검한 연결 범위에서는 남은 실패나 사용자 선택이 필요한 계약 충돌이 없다. 일반 Query DSL, 복합 sources/transform과 입력별 유효 결과 재사용, 완료 기준 polling, URL/날짜/StateStore/Action 통합은 후속이다. 실제 서비스 권한·secret 저장소·CORS·다른 런타임과 T3/T4도 미완료다. core 본 구현·CEL 패치·커밋·배포 보류를 유지하며 T2 전체 완료로 표시하지 않는다.

## U30 후속 검증

위 남은 범위는 U29 당시의 판단이다. U30에서 [복합 Query·완료 기준 polling](t2-composite-polling-2026-10-30.md)의 독립 실험과 실제 HTTP 결합을 추가했다. 공유 Query 스케줄러의 fresh 구분·오류 위치/resource·owner 정리 hook을 보완했으며 이 문서의 39개·고의 결함 4개도 다시 통과했다. 현재 링크의 결과 파일은 U30 회귀이고 [U29 원본 소스·결과](../../experiments/t2-composite-query/archive/u30-development/README.md)를 별도로 보존한다. 전체 core/스키마/renderer 구현 보류는 유지한다.
