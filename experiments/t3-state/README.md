# State·입력 계약 독립 실험

실제 core/StateStore SDK가 아니라 값 어댑터와 수명·관찰 규칙을 연결한 실행 모형이다. `node run.mjs node24.json`, Node 22 실행 파일로 같은 명령을 실행한다. 결과에는 실행 환경과 소스 hash를 기록한다.

- ready/missing/pending/error, 전체 값 교체·원자 실패, native Set/Map의 보호된 snapshot과 동등성.
- 최초 baseline과 명시 쓰기 우선, 늦은 initial·폐기 세대 결과 배제, Derived·reaction 순서/중복/순환.
- 전체·주소·묶음 구독, 최초 통지, added/updated/removed/replaced, 재진입 다음 배치, 소유 scope 분리.
- dependency 폐기/교체 후 옛 성공값을 표시하지 않고 CANCELLED로 전파하며 같은 이름의 새 셀에 자동 재연결하지 않는다.
- 콜백 오류는 직접 저장된 알려진 code만 읽고, getter/Proxy 검사 실패·falsy reject는 INTERNAL_ERROR로 격리한다. 한 관찰자의 오류가 다른 관찰자를 막지 않는다.

`pendingInitial`, `derived`, `contract()`는 실험 연결용 hook이며 선언 JSON 또는 공개 SDK의 추가 기능이 아니다. pending initial의 baseline이 아직 준비되지 않은 reset은 VALUE_PENDING으로 거절하고 현재값을 보존한다. 최초 초기 결과가 나중에 확정되면 reset은 그 snapshot을 사용한다.

[수정 전 5개 실패](archive/u34-lifecycle-before/README.md)와 현재 결과를 구별한다. 포트·Action·URL·renderer의 실제 제품 통합 완료를 주장하지 않는다.

## 추가 연결 검증

- `ports-tests.mjs`: Node 22/24 각 28/28. schema/typeRef·Value default·입력 준비·State 계약 동등성·호출 한정 래퍼 재연결과 문제 input 진단.
- `time-integration.mjs`: 9개 묶음. 실제 패치 CEL의 순수 달력 함수와 Clock/State를 연결해 Node 24 UTC·Pacific/Honolulu, Node 22 Asia/Seoul에서 같은 결과. 날짜 add의 정수 제한·YY pivot·DST 23/25시간·동일 시점 통지 억제·계산 결과의 비유한/안전정수 거절·-0의 Query 미실행을 검사했다. 함수명은 private 실험 이름이다.
- `url-integration.mjs`: Node 22/24 각 6개 묶음. 기존 URL codec/queue와 실제 State 모형·Query scheduler를 연결해 초기값→URL→최초 Query·reaction 억제·동일 baseline 날짜 기록·새 실행 복원·공용 URL 소유권을 검사했다. ready baseline 연결 모형이며 pending initial을 기다린 뒤 연결한다. 초기값 대기 중 명시 쓰기와 baseline 전달 전체 경합은 이 bridge의 완료 범위가 아니다. 실제 History 검사는 별도 T2 suite를 따른다.
