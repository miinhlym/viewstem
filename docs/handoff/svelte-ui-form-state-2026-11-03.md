# 화면 예제의 폼 State 정리

> 이 문서는 제거 전 리비전의 기록이다. 임시 앱은 U46에서 제거했으며 [현재 제거·검증 범위](temporary-tools-removal-2026-11-04.md)를 따른다. 아래 소스 링크는 당시 리비전으로 고정한다.

화면 예제 5개에서 함께 제출·초기화하는 값을 객체 State로 묶었다. core·Svelte·UI 패키지 런타임과 공개 API는 변경하지 않았다. [이전 화면 예제](svelte-ui-examples-2026-11-03.md)와 [종류별 편집기](svelte-ui-kind-editor-2026-11-03.md)의 실행 기록은 당시 증거로 보존한다. 당시 구조와 사용법은 [갤러리 README](https://github.com/miinhlym/viewstem/blob/b1d82953ee418def825499e8090c999249cb2d94/packages/svelte-ui/example/README.md)를 따른다.

## 경계와 동작

| 화면 | 기존 쓰기 State 수 → 현재 | 묶거나 분리한 이유 |
|---|---|---|
| 계정 설정 | 8 → 3 | 프로필·알림을 하나의 `form`으로 적용. `tab`은 화면 상태, `receipt`는 적용 당시 값 |
| 고객 목록 | 11 → 7 | 새 고객 `form`, 검색 조건 `filters`, 페이지 설정 `pagination`을 묶음. 데이터·정렬·선택·모달 열림은 별도 |
| 회의실 예약 | 7 → 2 | 예약 정보를 `form`으로 제출하고 `receipt`로 보관 |
| 매출 대시보드 | 2 → 2 | 조회 기간과 차트 종류는 독립적인 선택이므로 유지 |
| 요금 계산기 | 5 → 2 | 견적 조건을 `form`으로 묶고 계산 결과의 보관본은 `receipt` |

저장·확인 여부는 nullable receipt에서 Derived로 계산한다. 저장 전 `null`은 빈 객체와 의미를 구별하고, 이후 입력을 수정해도 receipt가 변하지 않는다. 프로필은 알림 탭에서도 같은 적용 버튼을 사용하며 변경 취소로 마지막 적용 값 또는 최초 값으로 돌아간다. 고객 추가는 명시 취소·Escape·닫기 시 폼을 비우고, 추가 시 필터·페이지 번호·선택을 초기화하면서 페이지 크기를 유지한다. 새 고객 배열은 입력마다 별도 Derived로 만들지 않고 제출 Action의 Variable 단계에서 생성한다. 예약 취소는 receipt를 비우되 작성한 form은 유지한다.

State/Derived는 구체적인 스키마를 사용한다. 객체의 필수 속성과 추가 속성 금지, enum, 인원 1–20, 날짜의 `x-viewstem-type: date`와 null을 명시한다. 이름·이메일의 일시적인 빈 값이나 잘못된 문자열을 입력 단계에서 차단하지 않고 Derived 검증으로 제출을 막는다. 임의의 `format: date`는 지원 프로필에 없으므로 사용하지 않는다.

작성 보조 [scenario-state.mjs](https://github.com/miinhlym/viewstem/blob/b1d82953ee418def825499e8090c999249cb2d94/packages/svelte-ui/example/scenario-state.mjs)는 닫힌 필수 필드 객체를 대상으로 기존 State 포트의 다른 값을 읽어 새 객체를 구성한다. 한 객체의 여러 필드를 변경할 때 SetState 한 번으로 묶는다. 출력은 기존 ViewSpec JSON이며, 실행 중 helper·호스트 Action·별도 상태 엔진은 필요 없다. State 포트에는 대상과 동일한 스키마를 연결한다. 객체 필드 직접 쓰기나 암묵 병합 계약은 추가하지 않는다.

## 검증과 제한

[scenarios.browser.mjs](../../packages/svelte-ui/test/scenarios.browser.mjs)는 실제 패키지로 다중 필드 수정 후 형제 값 유지, 프로필·알림 저장과 변경 취소, 고객 추가·닫기·필터·페이지 초기화, 예약 수정과 취소, 견적 보관본 불변을 검사한다. 동일 예제의 State 선언을 공개 core 런타임에 전달해 필수 필드 누락·추가 속성·타입·인원 범위·유효하지 않은 날짜를 거절하고 이전 snapshot이 유지되는지도 검증한다. [definition-sections.browser.mjs](https://github.com/miinhlym/viewstem/blob/b1d82953ee418def825499e8090c999249cb2d94/packages/svelte-ui/test/definition-sections.browser.mjs)는 새 객체 State에 맞춰 개별 JSON 편집·실제 적용과 71개 예제의 왕복 보존을 확인한다.

실행 환경·통과 수·소스 해시·재사용한 패키지 검증 근거는 [실행 기록](svelte-ui-form-state-verification-results.json)에 둔다. 이 변경은 메모리 예제이며 서버 저장·서버 오류·동시 사용자 편집이나 운영 폼 프레임워크를 추가하지 않는다. 고객 ID는 삭제 기능이 없는 이 예제의 현재 행 수로 생성한다. 달력의 기간은 이전 예제와 같이 2026년 11월이다.
