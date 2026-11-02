# Svelte UI 화면 예제 추가

사용자의 “여러 예제 만들어” 요청에 따라 기존 66개 컴포넌트 샘플과 별도로 실사용 화면 5개를 추가했다. 구현은 [scenarios.mjs](../../packages/svelte-ui/example/scenarios.mjs), 사용법은 [갤러리 README](../../packages/svelte-ui/example/README.md)를 따른다. 기존 U44 패키지 구현·검증 기록은 당시 증거로 보존한다.

## 실행 범위

| 예제 | 실제 연결 |
|---|---|
| 계정 설정 | 프로필·알림 Tabs, 입력·Switch → Action → State, Derived 검증과 버튼 비활성, 적용 시점의 프로필 저장 |
| 고객 목록 | State 조건 → Derived → Query → DataTable, 검색·정렬·페이지 크기·행 선택, Dialog에서 다중 State 갱신으로 고객 추가 |
| 회의실 예약 | DatePicker·Combobox·NativeSelect·Textarea, 필수 입력 검사, 선택 시점의 예약 내용 표시와 취소 |
| 매출 대시보드 | 기간 State → Derived → Query → 지표와 LayerChart, 막대·선·영역 선택 |
| 요금 계산기 | 요금제·결제 주기·Slider 인원 → Derived 금액, 현재 견적과 보관한 견적의 분리 |

상단에서 화면 예제/컴포넌트를 전환한다. `?example=profile|customers|booking|dashboard|pricing`로 직접 열고, 선택 시 URL을 갱신한다. 기존 `?family=button` 등의 경로와 기본 컴포넌트 화면은 유지한다. 예제 복원과 JSON 편집·적용, State·Query·Action 검사기를 그대로 사용한다.

작성 보조 함수가 만드는 결과는 일반 ViewSpec JSON이다. 별도 코드 Action 등록이나 새로운 상태 엔진을 사용하지 않는다. `demo-*` CSS는 갤러리의 배치 스타일이며 소비자 앱에서 같은 배치를 원하면 함께 가져간다. core·Svelte·UI 패키지 런타임과 공개 API는 이 변경에서 수정하지 않았다.

## 검증과 제한

[scenarios.browser.mjs](../../packages/svelte-ui/test/scenarios.browser.mjs)는 전체 화면 순회·JSON 직렬화·직접 URL·컴포넌트 모드 복귀, 프로필 검증·복원, 고객 Query와 추가·검색·선택·페이지, 예약 확인·취소, 대시보드 기간·차트 전환, 요금 계산·견적 보관, 좁은 화면·다크 모드를 검사한다. 구체적인 실행 환경·통과 수·파일 해시는 [실행 기록](svelte-ui-examples-verification-results.json)에 둔다.

예제 데이터는 브라우저 메모리의 샘플이다. 외부 API·영구 저장·실제 예약·청구는 포함하지 않는다. Query는 선언형 입력 변환을 실행하며 네트워크 지연·서버 오류 재현을 위한 예제는 아니다. 예약 날짜는 재현 가능한 2026년 11월로 고정했다.
