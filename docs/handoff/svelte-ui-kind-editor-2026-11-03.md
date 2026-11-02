# Svelte UI 갤러리 종류별 JSON 편집

하나의 큰 JSON으로 표시하던 갤러리에 종류별 탐색·편집을 추가했다. 원본 ViewSpec 형식과 패키지 공개 계약은 유지한다. 구현 범위는 갤러리의 HTML·CSS·바닐라 JavaScript와 회귀 테스트이며, core·Svelte·UI 패키지 런타임은 수정하지 않았다. 이전 U44 및 화면 예제 검증 기록은 당시 증거로 보존한다.

## 동작

- 전체, State, Derived, Query, Action, Component 탭과 개별 항목 선택기를 제공한다. Variable·Datasource는 해당 항목이 있으면 표시한다. 종류별 개수와 원본 JSON Pointer를 함께 보여준다.
- 중첩 inline Component의 상태·쿼리·화면, 슬롯 자식, 이벤트 Action, Action/If 내부 호출, Query source를 탐색한다. State 초기값 같은 일반 데이터에 들어 있는 `kind` 필드는 정의로 오인하지 않는다.
- Query 사용의 입력과 실행 옵션, Action 이벤트 연결의 입력, Component 노드의 자식·이벤트를 함께 보여준다. 종류별 항목은 별도 리소스 파일로 변환한 결과가 아니라 원본 문서의 실제 하위 객체다. 등록된 외부 리소스의 구현을 펼치는 기능은 포함하지 않는다.
- 단일 편집본을 유지한다. 탭·항목 변경 시 현재 JSON을 파싱해 해당 원본 위치만 갱신한다. 적용 시 전체 ViewSpec을 기존 `mounted.replace`로 전달한다. 새 상태 엔진이나 런타임 병합 규칙은 없다.
- 문법 오류는 전환을 막고 입력·선택·실행 중 화면을 보존한다. 의미 검증은 기존 적용 경로가 담당한다. 항목 추가·삭제·이름 변경과 최상위 ports/reactions/queryDefaults 편집은 전체 탭을 사용한다.
- `section=State` 같은 URL은 종류 선택을 복원한다. 개별 항목 선택과 편집 내용은 URL에 저장하지 않는다. 예제 전환·복원·새로고침은 편집본을 초기화한다.
- 탭 키보드 이동(좌우·Home·End), 좁은 화면의 탭 가로 스크롤과 기존 테마를 지원한다.

## 검증

[definition-sections.browser.mjs](../../packages/svelte-ui/test/definition-sections.browser.mjs)는 71개 예제의 모든 분리 항목을 다시 합쳐 원본과 동일한지 검사한다. 중첩 정의와 일반 데이터 구분, JSON Pointer escaping과 원형 오염 방지, State·Action·Query·Component 수정의 실제 렌더링, 잘못된 JSON에서 편집본 보존, 키보드·URL 복원·390px 화면도 검사한다.

갤러리는 실제 패키지 dist를 사용해 컴파일한다. 기존 UI 회귀 전체와 Node 24의 영향 범위 재검증 결과, 소스 해시 및 기존 패키지 검증 재사용 근거는 [실행 기록](svelte-ui-kind-editor-verification-results.json)에 둔다.
