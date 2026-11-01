# 연속 검증: 복합 Query·URL 교체·날짜 경계

2026-10-30 · U32/D87 검증 계속, U33/D88 URL 정리 실패 정책 수락. 기존 독립 실험을 확장했으며 production core·renderer·CEL 패치를 구현한 기록이 아니다.

## 발견과 수정

| 영역 | 재현한 문제 | 수정·실제 검사 |
|---|---|---|
| 복합 정의 경계 | steps·Join.mode·하위 inputs의 명시 null을 생략으로 처리 | 각 필드 타입을 등록 시 검사. S12의 3개 변형 |
| 필수 입력 연결 | `@@name` 템플릿 키를 복원하기 전에 필수 `@name` 포트와 비교해 정상 연결 거절 | 공통 이스케이프 뒤 이름으로 검사. S13 |
| Concat | 추가 배열을 JS 함수 인자로 펼쳐 많은 배열에서 HTTP_ERROR로 실패 | 배열 순회로 연결. S14의 150,000개 배열은 기능 경계 검사이며 공개 상한·성능 보장 아님 |
| URL baseline | 검증 결과를 버려 초기/복원 baseline에 -0이 남음 | 정규화한 값의 격리 snapshot 보존. U37–U38 |
| 늦은 URL 정리 | 수동 cancel 없이 새 연결이 생기면 옛 cleanup이 새 URL을 삭제 | 관련 Store/key를 차지한 새 연결이 이전 교체를 영구 무효화. U42/U45–U47의 다른 key·ABA·무관 소유자 포함 |
| 교체 사전 검증 | 잘못된 새 설정을 검사하기 전에 기존 연결 폐기 | 후보를 먼저 검증·격리하고 실패 시 cleanup 0건·기존 연결 보존. U43–U44/U48/U55 |
| 비동기 준비 실패 | adapter prepare 예외 때 작업 Promise가 끝나지 않고 교체 기록 잔존 | 유효성 재확인 뒤 해당 작업의 정제된 실패로 처리. U53–U54 |
| 날짜 스키마 | 날짜 정규화 뒤 const/enum/pattern/길이 검사를 생략 | 정규 문자열을 나머지 직접 스키마로 검증. 날짜·시각·절대 시점과 nullable |
| 지역 시각 변환 | UTC 결과가 0001–9999 밖이어도 반환 | 결과를 같은 datetime 경계로 검사. 아래/위 연도 경계·DST gap/overlap 거절 |

복합 C31–C36/S15–S17은 형제 요청 취소·늦은 실패, timeout 뒤 재개, 호출자만 취소, 다단계 하위 재사용/fresh 전달, 표현식 모양 응답의 비재평가, 특수 source 이름, 순차 변환·원본 격리·사전 취소를 확인했다. URL U39–U41은 percent-encoded 중복 key, 잘못된 묶음 쓰기의 원자성, Unicode/percent 왕복을 확인했다.

수정 전 결과는 [복합 60/65](../../experiments/t2-composite-query/archive/u32-boundaries-before-fix/README.md), [URL 41/47](../../experiments/t2-url-races/archive/u32-boundaries-before-fix/README.md), [prepare 60/61](../../experiments/t2-url-races/archive/u33-preparation-before-fix/README.md), [날짜 21/39](../../experiments/t1-values/archive/u32-date-before-fix/README.md)에 당시 소스·해시와 함께 보존했다. 실패 수는 원인 수가 아니며 현재 결과와 구분한다.

## U33: 교체 URL 정리 실패

U32에서 실패를 주입하자 일반 URL 쓰기는 유효 State를 유지했지만 교체 cleanup 실패는 이전 연결 폐기 뒤 새 연결도 만들지 못했다. [정책 결정 전 관찰](../../experiments/t2-url-races/archive/u32-cleanup-policy/README.md)은 적합성 통과로 세지 않았다.

사용자는 **새 화면으로 교체하고 URL 오류 보고**를 선택했다. [현재 URL 계약](../spec/09-preserved-contracts.md#쓰기실패정리)에 따라 새 초기값으로 교체를 완료하며 남아 있는 옛 URL을 새 State에 다시 복원하지 않는다. URL은 실제로 정리되지 않았을 수 있으므로 진단에 정리 실패를 남긴다. 새 연결의 쓰기와 다음 교체는 계속 가능하다. 사전 설정 오류의 기존 연결 보존과, 오래된 작업의 CANCELLED는 유지한다.

U49–U55에서 교체 완료·진단·후속 쓰기/교체·더 최신 소유자 보호를 검사했다. URL adapter가 null/undefined, getter, revoked Proxy, 알 수 없는 code, 형 변환 객체를 던져도 추가 예외·원시 내용 노출 없이 정제한다. 실험의 `diagnostics` 배열·`URL_WRITE_FAILED`는 private 모형이며 새 공개 SDK 필드를 확정하지 않는다. 실제 View 초기 완료 보고와 renderer 연결은 후속이다.

## 실행 결과

| 검사 | 실제 결과 | 코드·원시 증거 |
|---|---|---|
| 복합 Query | Node 22.21.1/24.19.0 각각 65/65·고의 결함 5/5 | [명령](../../experiments/t2-composite-query/README.md), [22](../../experiments/t2-composite-query/results/node22.json), [24](../../experiments/t2-composite-query/results/node24.json) |
| URL 경계·교체 | Node 22/24·Chromium 각각 63/63·고의 결함 9/9 | [명령](../../experiments/t2-url-races/README.md), [22](../../experiments/t2-url-races/results/latest.json), [24](../../experiments/t2-url-races/results/node24.json), [Chromium](../../experiments/t2-url-races/results/chromium.json) |
| URL 순서 반복 | Node 각 100/100·Chromium 20/20 seed | 위 결과의 seeds. seed당 18회 쓰기 |
| 교체 실패 정책 별도 검사 | Node 22/24 각각 통과 | [22](../../experiments/t2-url-races/results/replacement-failure-node22.json), [24](../../experiments/t2-url-races/results/replacement-failure-node24.json) |
| 직접 날짜 경계 | Node 22/24 각각 39/39 | [명령](../../experiments/t1-values/README.md), [22](../../experiments/t1-values/results/date-boundaries-node22.json), [24](../../experiments/t1-values/results/date-boundaries-node24.json) |
| 기존 T1 회귀 | 어댑터 93/93·기존 후보 불일치 유지 | [22](../../experiments/t1-values/results/latest.json), [24](../../experiments/t1-values/results/node24.json) |
| CEL 배열 크기 회귀 | Node 22/24 각각 18/18 | [22](../../experiments/t1-values/results/array-size-node22.json), [24](../../experiments/t1-values/results/array-size-node24.json) |

복합 65건 중 H01 한 건은 실제 loopback HTTP 요청 11건이며 나머지는 제어 전송/정의/변환 검사다. URL Chromium은 별도 headless 브라우저의 실제 History/location을 사용했다. 날짜 검사는 기존 고정 Temporal/Ajv 어댑터이며 CEL 라이브러리 자체의 날짜 처리 수정이 아니다.

현재 결과 19개에 기록된 소스 해시 149개가 일치했다. URL 정상 사례의 최종 URL·commit/작업 trace와 공통 20 seed가 Node 두 버전·Chromium에서 같았으며 pageerror는 0건이다. 변경 소스 9개의 구문·공백과 문서 17개의 로컬 링크 대상 380개도 확인했다.

현재 공유 Query/polling/HTTP 소스는 변경하지 않아 직전 결과를 해시 대조 후 재사용한다. 기존 T1 294개 관찰 판정은 두 Node 버전 모두 이전과 같았다. CEL 후보·Dart의 불일치는 미해결 상태 그대로 보고하며 전체 T1 통과로 표시하지 않는다. 전체 core/StateStore·설정 상속·전체 JSON Schema/native 조합·날짜 HTTP/URL 연결·renderer와 다른 브라우저/Dart 적합성은 후속이다. 이 기록이 모든 가능한 입력·스케줄의 검증을 의미하지 않는다.
