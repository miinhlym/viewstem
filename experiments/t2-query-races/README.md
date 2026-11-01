# T2 Query 경합 독립 실험

현재 Query 계약의 실행 가능성을 확인하는 작은 스케줄러 프로토타입이다. **실제 Viewstem core·Action 실행기·렌더러·HTTP/URL 어댑터가 아니다.** 실제 서비스나 네트워크를 호출하지 않으며 외부 패키지 의존성이 없다. 이 폴더의 클래스·함수·mutation 옵션은 공개 SDK가 아니다.

## 실행

Node 22 이상에서 별도 설치 없이 실행한다.

```sh
cd experiments/t2-query-races
npm test
```

기본 출력은 `results/latest.json`이다. 다른 Node 실행 파일로 대조할 때 `T2_RESULT=results/node24.json node run.mjs`처럼 출력 위치를 지정한다. 보고서에는 실제 Node 버전·플랫폼, 실행 소스 5개의 SHA-256, 사례별 시간순 trace와 결과가 포함된다. JSON의 `{ "$missing": true }`는 이 보고서에서 JS undefined를 보존하는 표식이며 서비스 전송 형식이 아니다.

Node 22.21.1과 24.19.0에서 대표 사례 **36/36**, 보호 장치 제거 대조군 **4/4 탐지**, 입력 변경 반복 **100/100 seed**를 확인했다. 두 환경의 사례 trace·대조군·반복 결과와 소스 해시가 동일하다. 실패하거나 대조군을 탐지하지 못하면 종료 코드가 0이 아니다.

## 실험 구조

- `harness.mjs`: 수동으로 움직이는 시계, 실제 Promise, 응답을 원하는 순서로 돌려주는 가짜 전송기. 전송기는 AbortSignal을 관찰하지만 일부러 무시하므로 취소 뒤에도 성공/실패를 반환할 수 있다.
- `query-probe.mjs`: 사용 인스턴스당 active 1개·latest pending 1개, 입력/gate 세대, 소유 수명, 요청 완료 표식, fresh 갱신 대기자와 마지막 성공 쌍을 다룬다. 데이터는 JSON 형태 fixture로 한정한다.
- `scenarios.mjs`: 현재 명세에 근거한 기대 결과와 36개 시간순 사례. 초기 gate/입력 대기, A→B→A, Promise 완료 직후 입력/수명 변경, 갱신 대기 결합, 같은 주소의 소유자 교체, timeout, 호출 한정 취소, 실패/재시도를 포함한다.
- `run.mjs`: 사례 실행, 타이머·대기자 정리 확인, 대조군 및 100개 고정 seed의 반복 실행, 원시 보고서 저장.

입력 변경 반복은 seed당 40회, 총 4,000회다. 처음 요청이 실행되는 동안 입력과 refresh 호출을 섞고, 처음 응답 뒤 최신 입력의 요청만 실행되는지 확인한다. 모든 가능한 실행 순서를 탐색한 결과가 아니다.

대조군은 입력 세대 검사, 소유 수명 검사, 완료한 요청의 재반영 차단, fresh 갱신 대기의 네 보호를 각각 의도적으로 훼손한다. 관련 테스트의 assertion이 실패해야 대조군 탐지 성공이다. 이는 실제 라이브러리에서 네 취약점을 찾았다는 뜻이 아니다.

## 범위와 한계

- timeout은 단일 전송 실행의 종료를 모델링한다. 실제 Login+HTTP 전체 계획, fetch/AbortSignal 동작, 응답 파싱과 secret 비노출은 검증하지 않는다.
- timeout이나 폐기 뒤 전송기가 취소를 무시하면 물리적 외부 작업은 계속될 수 있다. 새 실행의 시작과 별개로 옛 결과 반영을 차단한다. 일반 입력 변경에서는 이전 전송이 끝나기 전에 다음 요청을 시작하지 않는 것도 확인한다.
- 주기 갱신은 명시 tick의 허용 조건만 검사한다. 완료 기준 interval 타이밍·실제 브라우저·Dart·복합 Query 결합·권한·타입 검증·전체 Action 수명은 범위 밖이다.
- 같은 시각의 timeout/응답은 가짜 시계에 등록된 순서로 처리한다. 특정 벽시계 시각의 우선순위를 새 공개 계약으로 정하지 않는다.
- 제작 중 입력 변경 직후 stale 표시 누락을 찾고 수정했다. 수정 전 결과는 `results/development-failure.json`, 수정 후는 `results/latest.json`이며 소스 해시가 다르다. 실패 기록은 최종 코드의 실패가 아니다.

[현재 Query 계약](../../docs/spec/02-query.md), [상세 결과·남은 작업](../../docs/handoff/t2-query-races-2026-10-29.md)을 함께 읽는다. 이 성공을 T2 전체 또는 core 인수 테스트 통과로 처리하지 않는다.

## 후속 실제 HTTP 연결

U29의 [별도 연결 실험](../t2-query-http/README.md)은 이 스케줄러를 HTTP/Login 실행기와 실제 loopback 서버에 연결한다. Node 22/24 각각 39개 경합 사례와 4개 고의 결함을 확인했다. 이 폴더의 기존 소스·36개 fixture·대조군/seed 결과는 변경하지 않았으며, 일반 Query DSL·복합 Query·core 통합은 여전히 후속이다.

## U30 복합 Query·polling 연결 후 회귀

[복합 Query](../t2-composite-query/README.md)와 [완료 기준 polling](../t2-query-polling/README.md)을 연결하면서 private fresh metadata·정제 오류의 location/resource/cause 보존·disposeOwner 정리 hook을 추가했다. Node 22/24에서 기존 36/36·고의 결함 4/4·100/100 seed를 재실행해 유지했다. 위 U17 단독 fixture가 복합/polling 전체 증거라는 뜻은 아니다. [당시 소스와 결과](../t2-composite-query/archive/u30-development/README.md)를 보존하며 현재 결과 파일은 아래 U31 회귀 소스 해시를 담는다.

## U31 재개 대기 결합 후 회귀

[재개 계약](../../docs/handoff/t2-polling-resume-2026-10-30.md)을 연결하며 pending의 주기 의도를 입력 변경/수동 호출과 구분했다. Node 22/24 각각 기존 36/36·고의 결함 4/4·100/100 seed를 유지했다. [U30 최종 소스·결과](../t2-query-polling/archive/u30-before-resume/README.md)를 보존하며 재개 타이밍 검증은 polling/복합 실험이 담당한다.
