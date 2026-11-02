# Viewstem shadcn 갤러리

[English](README.md) | 한국어

core, Svelte 렌더러, Svelte UI 패키지를 빌드한 뒤 저장소 루트에서 실행합니다.

```sh
node packages/svelte-ui/example/server.mjs
```

기본 주소는 http://127.0.0.1:4175 입니다. `PORT` 환경 변수로 포트를 바꿀 수 있습니다. `?family=dialog`처럼 컴포넌트군을 지정할 수 있습니다.

상단의 **화면 예제**를 선택하면 여러 컴포넌트를 결합한 화면 5개를 실행할 수 있습니다. 선택한 예제는 URL에도 반영됩니다.

| 예제 | 주소 | 확인할 동작 |
|---|---|---|
| 계정 설정 | `?example=profile` | 프로필·알림을 하나의 폼으로 편집, 이름·이메일 검증, 적용 시점의 값 보존과 변경 취소 |
| 고객 목록 | `?example=customers` | Query로 표 공급, 상태·한글 검색, 정렬·페이지·행 선택, Dialog에서 고객 추가 |
| 회의실 예약 | `?example=booking` | 날짜·회의실·시간 선택, 필수 이름 검사, 예약 확인서와 취소 |
| 매출 대시보드 | `?example=dashboard` | 주간·월간 선택에 따른 Query·지표 갱신, 막대·선·영역 차트 전환 |
| 요금 계산기 | `?example=pricing` | 요금제·결제 주기·인원별 Derived 계산, 키보드 Slider, 견적 보관 |

[scenarios.mjs](scenarios.mjs)는 일반 ViewSpec JSON을 만드는 작성 보조 함수와 예제 정의를 포함합니다. 편집기에 표시된 JSON을 그대로 사용할 수 있고, 별도 호스트 Action 등록은 필요하지 않습니다. 데이터는 메모리 내 샘플이며 외부 API 요청, 실제 예약·고객 저장·결제는 하지 않습니다. 새로고침이나 예제 복원으로 초기화됩니다. 레이아웃 클래스는 [gallery.css](gallery.css)의 `demo-*` 규칙을 사용합니다.

브라우저가 페이지를 뒤로/앞으로 가기 캐시에 보존하는 동안에는 편집본과 실행 State를 유지합니다. 캐시 보존이 아닌 최종 `pagehide`에서 renderer를 정리합니다. 브라우저가 캐시를 사용하지 않고 문서를 다시 로드하면 새로고침과 같이 초기화됩니다.

폼 값은 필드마다 State를 만들지 않고 저장·초기화 단위로 묶습니다. `form`을 편집하고 `receipt`에 적용 당시 값을 보관합니다. 저장 전 `receipt`는 `null`이며, 저장 여부는 Derived로 계산합니다. 프로필의 변경 취소는 마지막 적용 값(아직 적용하지 않았다면 초기값)으로 돌아갑니다. 고객 추가의 취소·닫기는 입력을 비우고, 예약 취소는 확인 결과만 지워 작성 중인 폼은 유지합니다.

| 화면 | 쓰기 가능한 State |
|---|---|
| 계정 설정 | `tab`, `form`(이름·이메일·팀·알림), `receipt` |
| 고객 목록 | `rows`, `filters`(상태·검색), `pagination`(페이지·크기), `sorting`, `selected`, `open`, `form`(새 고객) |
| 회의실 예약 | `form`(예약자·날짜·회의실·시간·요청), `receipt` |
| 매출 대시보드 | `period`, `kind` — 데이터 조회 조건과 차트 표현은 독립적으로 유지 |
| 요금 계산기 | `form`(요금제·결제 주기·인원), `receipt` |

State와 Derived의 스키마는 필드 타입·필수 속성·선택값·인원 범위를 명시합니다. 편집 도중 빈 이름이나 잘못된 이메일은 문자열로 보관하고 Derived로 제출 가능 여부를 계산합니다. [scenario-state.mjs](scenario-state.mjs)는 같은 State 스키마를 Action의 State 포트에도 사용하고, 필드 수정 시 다른 속성을 읽어 전체 객체를 만드는 JSON을 생성합니다. 하위 필드 쓰기나 자동 병합을 런타임에 추가하지 않습니다. 동작 검증은 [폼 State 인계](../../../docs/handoff/svelte-ui-form-state-2026-11-03.md)에 정리했습니다.

컴포넌트군을 선택하면 예제 ViewSpec의 JSON과 실제 DOM을 함께 표시합니다. JSON을 수정한 뒤 적용하면 View의 새 수명으로 교체합니다. 오류 예제는 현재 컴포넌트군의 루트에 허용되지 않은 입력을 넣어 검사합니다. 기존 화면을 유지한 채 오류를 표시하면 예제 복원으로 돌아갈 수 있습니다. State·Query·Action 검사 영역에서 입력과 실행 상태를 확인할 수 있습니다.

JSON 편집기의 **전체 / State / Derived / Query / Action / Component** 탭으로 종류를 고르고, 아래 선택기에서 개별 항목을 볼 수 있습니다. Variable·Datasource는 문서에 해당 항목이 있을 때 나타납니다. 종류 옆 숫자는 항목 수이며, 선택기 옆에는 `/states/form` 같은 원래 JSON 경로를 표시합니다. `?example=profile&section=State`처럼 종류를 URL에 지정할 수도 있습니다.

종류별 보기는 하나의 ViewSpec에서 해당 부분을 보여줍니다. Query는 사용 시점의 `inputs`를, Action은 이벤트 연결과 `inputs`를 함께 편집합니다. Component는 선택한 노드의 자식과 이벤트를 포함합니다. 탭이나 항목을 바꾸면 문법상 유효한 변경을 편집본에 반영하고, **적용**을 누르면 전체 ViewSpec을 실행합니다. JSON 문법 오류가 있으면 항목 전환을 막고 편집 내용과 실행 중인 화면을 보존합니다. 항목 추가·삭제·이름 변경이나 최상위 설정 변경은 전체 탭에서 합니다. 예제 전환·복원·새로고침은 편집본을 초기화합니다.

- [samples.mjs](../test/fixtures/samples.mjs)에 카탈로그 66개 컴포넌트군의 ViewSpec과 JSON 참조 집계 함수가 있습니다. 예제와 브라우저 검사는 같은 정의를 사용합니다.
- [RawComposition.svelte](../test/fixtures/RawComposition.svelte)는 날짜와 차트의 원본 Svelte 공개 파트를 필수 native context 안에서 조합합니다. Calendar와 Range Calendar의 각 17개 하위 파트 및 LayerChart Tooltip 1개를 직접 참조하는 별도 호스트 fixture입니다.
- Button은 Action을 통해 저장 상태를 바꿉니다. Input과 선택 컴포넌트는 이벤트를 State로 연결합니다. Data Table은 View의 Query로 행을 공급하고 정렬·필터·페이지 상태를 갱신합니다.
- 전체 묶음은 예제가 명시적으로 등록합니다. 소비자 앱은 필요한 컴포넌트군만 등록할 수 있습니다.

화면 예제 회귀 검사는 `node --test packages/svelte-ui/test/scenarios.browser.mjs`로 실행합니다. `npm run test:svelte-ui`에도 포함됩니다.
종류별 편집 회귀 검사는 `node --test packages/svelte-ui/test/definition-sections.browser.mjs`로 실행합니다. 검증 범위와 결과는 [편집기 인계](../../../docs/handoff/svelte-ui-kind-editor-2026-11-03.md)에 있습니다.
