# @viewstem/ui Goldfish 리뷰

2026-11-11 · 기준 커밋 `ec25366029900ce269b0e2f5f8a50dca530c5117`

이 문서는 기준 커밋에서 재현한 결과를 보존한다. 아래 소스 줄 번호는 당시 코드를 기준으로 한다. 후속 수정의 [Chromium 회귀 테스트](../../../packages/ui/test/goldfish-regressions.test.mjs)는 표의 19개 항목을 검증한다. 새 테스트 20개는 기준 커밋에서 모두 실패했고, 수정 후 `npm run check:ui`에서 기존 테스트를 포함한 35개가 통과했다. 한·영 상세 페이지 132개와 추가 미리보기 164개에서 표시 JSON과 실행 JSON이 일치했다.

`@viewstem/ui`의 [공개 사용법](../../../packages/ui/README.ko.md), 생성된 `support.json`, [Component·View 계약](../../../docs/spec/05-component-view.md#component의-공개-계약과-슬롯)을 기준으로 현재 구현을 검토했다. EGM의 독립 Goldfish 한 라운드를 실제 패키지 감사에 적용했다. 코드 수정은 이번 범위에서 제외했다.

Goldfish 세 명이 부모 대화 없이 공개 입력·폼, 오버레이·키보드·이벤트 수명, 복합 레시피·테스트를 검토하고 각각 최종 보고를 제출했다. 아래 19개 항목은 중복 재현을 합친 결과다. 우선순위는 잘못된 제출·Action, 조작 차단, 브라우저 예외 등 실제 영향에 따라 매겼다.

## 우선 수정할 결함

| ID | 우선순위 | Chromium에서 재현한 결과 | 수정 후 통과 기준 |
| --- | --- | --- | --- |
| `design-critic-1-1` | P1 | **Questionnaire가 제외된 답변을 제출한다.** 원본 예제에서 `format=summary`, `detail=comparison`을 선택하고 `items`에 `detail`만 남겨도 Submit Action이 성공하고 FormData에 `format=summary`가 남는다. `items[].choices[].disabled: true`인 선택지도 별도 Choice `disabled`가 없으면 선택되고 제출된다. [정의와 필드 연결](../../../packages/ui/src/form-scroll-families.ts#L363) | 현재 정의에서 제거·비활성화된 응답은 조작, 검증, 제출에서 빠진다. 동적 복원 시 적용할 답변 보존 규칙을 테스트한다. |
| `design-critic-1-2` | P1 | **비활성 Select가 State를 변경한다.** 원본 Select의 Root에 `disabled: true`를 추가하고 실제 포인터로 열어 부산을 선택하면 `openChange(true)`가 발행되고 기존 Action이 `site`를 `busan`으로 바꾼다. `name: 'region'`도 숨은 입력에 반영되지 않는다. [트리거 갱신](../../../packages/ui/src/behaviors.ts#L493) · [숨은 입력](../../../packages/ui/src/behaviors.ts#L452) | Root `disabled`가 키보드·포인터 및 폼 제출 대상에 적용된다. 활성화하면 지정한 `name`으로 현재 값이 FormData에 포함된다. |
| `structural-1-1` | P1 | **Dialog의 비활성 합성 트리거가 모달을 연다.** `Dialog.Trigger disabled:true`에 `slots.child: [Button]`을 연결하면 실제 버튼을 클릭해 모달을 열 수 있다. `disabled`는 wrapper에 적용되고 클릭 처리기가 해당 wrapper의 비활성 여부를 검사하지 않는다. [합성 트리거 생성](../../../packages/ui/src/index.ts#L163) · [모달 요청](../../../packages/ui/src/behaviors.ts#L193) | `child`와 기본 트리거에 같은 비활성 정책을 적용하고 클릭·키보드 활성화에서 열림 Action을 호출하지 않는다. |
| `elephant-1-1` | P1 | **Command.Dialog를 Escape로 닫아도 다시 열린다.** `open`을 State `true`에 연결한 뒤 Escape를 누르면 DOM만 닫히고 State는 `true`다. 관련 없는 Button 텍스트 State를 갱신하면 모달이 다시 열린다. 공개 `openChange`가 없다. [DOM 열림 반영](../../../packages/ui/src/index.ts#L458) · [이벤트 등록](../../../packages/ui/src/catalog-meta.ts#L95) | Escape 닫기 요청과 DOM 및 State 반영이 합의된 순서로 일어난다. 닫힘 수락 뒤 무관한 갱신에 다시 열리지 않는다. |
| `structural-1-2` | P1 | **Popover.Close가 Trigger의 Action을 실행한다.** 닫기 버튼이 내부적으로 `trigger.click()`을 호출한다. 팝오버를 연 뒤 Trigger에 연결한 `triggered` State를 `false`로 초기화하고 Close만 클릭해도 해당 Action이 다시 실행되어 `triggered=true`가 된다. [닫기 핸들러](../../../packages/ui/src/behaviors.ts#L481) | 닫기는 전용 전환으로 처리한다. 닫기 요청과 완료 이벤트가 각각 한 번 발행되고 Trigger `click`은 발생하지 않는다. |
| `structural-1-3` | P1 | **Menubar의 방향키 탐색이 비활성 항목에서 막힌다.** `File → Disabled → View`에서 File을 포커스하고 ArrowRight를 반복해도 View에 닿지 않는다. 비활성 버튼에 유일한 `tabindex=0`이 배정된다. 별도 재현에서 동일 ID를 유지한 채 `File/View/Help`를 `File/Help/View`로 바꾸면 ArrowRight가 이전 순서의 View로 이동한다. [roving tabindex](../../../packages/ui/src/menus.ts#L251) · [방향키 핸들러](../../../packages/ui/src/menus.ts#L339) | 비활성 항목이 섞이거나 순서를 바꾼 메뉴에서 현재 DOM 순서에 따라 양방향 탐색·Home·End 및 Tab 진입이 가능하다. |
| `codebase-details-1-5` | P1 | **열린 DatePicker를 해제하면 브라우저 예외가 발생한다.** DatePicker를 열고 컨테이너가 연결된 상태에서 `attachment.dispose()`와 `runtime.dispose()`를 호출하면 다음 프레임의 포커스 처리에서 `getRootNode2(...).getElementById is not a function`이 발생한다. DOM 제거 뒤 예약 작업이 분리된 요소를 루트로 조회한다. [Zag DOM 루트](../../../packages/ui/src/date-calendar.ts#L185) · [DatePicker 해제](../../../packages/ui/src/date-calendar.ts#L464) | 열린 상태로도 해제 또는 View 교체가 완료되고 다음 프레임에서 예외나 늦은 이벤트가 발생하지 않는다. |
| `design-critic-1-3` | P2 | **RadioGroup의 Root 폼 설정을 자식이 무시한다.** `disabled:true, required:true, name:'category'`에서 자식은 활성 상태이고 `required=false`, 이름은 생성된 ID다. 클릭이 `valueChange`를 발행한다. [RadioGroup 동기화](../../../packages/ui/src/behaviors.ts#L848) | Root 비활성·필수·name이 실제 폼 조작과 FormData·제약 검사에 반영된다. |
| `design-critic-1-4` | P2 | **NativeSelect가 숫자 `0`을 표시하지 못한다.** 값이 `[1, 0]`인 옵션에서 State `0 → '0' → null`에 대해 표시값은 `'1' → '0' → '1'`이다. DOM 옵션 값의 문자열 표현과 Root 입력을 그대로 비교한다. [NativeSelect 갱신](../../../packages/ui/src/index.ts#L453) | 숫자와 문자열 표현을 같은 규칙으로 비교하고 빈 값에서의 선택 해제 규칙을 보장한다. |
| `design-critic-1-5` | P2 | **Input·Textarea가 `null`로 지워지지 않는다.** 숫자 State를 `42 → null`로 갱신해도 두 DOM 값에 `'42'`가 남는다. [텍스트 입력값 반영](../../../packages/ui/src/index.ts#L389) | 명시적 `null`은 기존 값을 지운다. 입력값을 생략한 컴포넌트에서는 브라우저가 관리하는 편집값을 보존한다. |

## 추가로 확인한 상태 전환

| ID | 우선순위 | Chromium에서 재현한 결과 | 수정 후 통과 기준 |
| --- | --- | --- | --- |
| `structural-1-4` | P2 | **중첩 Popover가 한 번의 Escape로 함께 닫힌다.** 두 Popover에 `child` 트리거를 사용하고 안쪽 컨텐츠에서 Escape를 누르면 바깥쪽도 닫히고 바깥쪽 트리거에 포커스가 간다. [문서 키다운 리스너](../../../packages/ui/src/behaviors.ts#L524) | 최상위 활성 레이어만 닫히고 그 트리거로 포커스가 돌아간다. |
| `structural-1-5` | P2 | **Popover·Tooltip의 `open:false`를 조작이 덮어쓴다.** 클릭 또는 포커스 뒤 `open`을 변경하는 Action 없이도 표시 상태가 열린 채 유지된다. [Tooltip 동기화](../../../packages/ui/src/behaviors.ts#L87) · [Popover 동기화](../../../packages/ui/src/behaviors.ts#L509) | 명시적 `open`이 있는 경우 요청과 실제 반영 시점을 일관되게 정의한다. Action이 값을 유지하거나 갱신할 때 각각 DOM·ARIA·완료 이벤트를 검사한다. |
| `structural-1-6` | P2 | **Popover.Content를 제거해도 기존 트리거가 분리된 패널을 토글한다.** `child` 트리거를 남긴 채 `view.update()`로 열린 Content를 제거하면 `aria-expanded=true`와 끊어진 `aria-controls`가 남는다. 이후 두 번 클릭하면 패널이 없는 상태에서 닫힘·열림 이벤트가 모두 발행된다. [패널이 없을 때의 동기화](../../../packages/ui/src/behaviors.ts#L498) | Content가 사라지면 기존 리스너와 ARIA 관계를 정리한다. 패널이 없는 트리거는 열림·완료 이벤트를 발행하지 않는다. |
| `structural-1-7` | P2 | **Tooltip이 대기 중 비활성화된 뒤 열린다.** 호버로 120ms 타이머를 시작하고 `Tooltip.Provider.disabled`를 `true`로 바꾸면 타이머가 끝난 뒤 Tooltip이 표시된다. [호버 타이머](../../../packages/ui/src/behaviors.ts#L100) · [Provider 입력 반영](../../../packages/ui/src/index.ts#L440) | Provider 비활성 전환은 예약된 열기를 취소하고 표시·이벤트를 차단한다. |
| `codebase-details-1-1` | P2 | **Slider가 빈 값과 배열 `step`을 의도와 다르게 처리한다.** `type:'multiple', value:[]`에서 손잡이 두 개가 생성된다. `step:[5,10]`을 스키마가 받아도 첫 손잡이 20에서 ArrowRight로 21이 된다. [다중 구현](../../../packages/ui/src/slider.ts#L79) · [단일 구현](../../../packages/ui/src/behaviors.ts#L724) | 생략과 명시적 빈 배열의 동작을 정하고 문서와 맞춘다. 배열 step을 구현하거나 지원 타입에서 제거할 때 기존 JSON 호환을 판단한다. |
| `codebase-details-1-2` | P2 | **Calendar 다중 모드가 `preventDeselect:true`를 무시한다.** 선택된 9일을 클릭하거나 Enter로 누르면 선택이 해제되고 `valueChange`가 발행된다. [선택 해제 처리](../../../packages/ui/src/date-calendar.ts#L253) | 포인터와 키보드 모두 이미 선택된 값을 보존하고 불필요한 `valueChange`를 발행하지 않는다. |
| `codebase-details-1-3` | P2 | **DatePicker 트리거와 그리드가 다른 날짜를 표시한다.** `value:'2026-11-05', min:'2026-11-09'`에서 트리거는 5일, 열린 그리드는 9일을 선택한 상태다. 외부 State를 9일에서 5일로 써도 같다. [Zag 입력](../../../packages/ui/src/date-calendar.ts#L178) · [트리거 표시](../../../packages/ui/src/date-calendar.ts#L288) | 범위 밖 값을 거절·보정·비우는 정책을 하나로 정하고 트리거와 그리드에 함께 적용한다. |
| `codebase-details-1-4` | P2 | **DataTable이 숫자 ID 행을 조용히 삭제한다.** `data`가 `Array<object>`로 검증된 뒤 `{id:1}`, `{id:'2'}`, `{id:3}`에서 문자열 ID 행만 보인다. [행 필터](../../../packages/ui/src/data-table.ts#L79) · [공개 타입](../../../apps/docs/src/content/docs/ko/docs/ui/components/data-table.md#shadcndatatable) | 숫자 ID를 지원하거나 필요한 ID 타입을 문서와 진단에 드러낸다. 지원하지 않는 행이 오류 없이 유실되는 경로를 검증한다. |
| `codebase-details-1-6` | P2 | **DataTable의 페이지 크기를 바꾸면 표시하던 행을 건너뛴다.** 22행에서 `pageIndex:5, pageSize:50`을 입력하면 표시상 1페이지의 `row0`부터 보인다. 크기를 10으로 바꾸면 `pageSizeChange(10)`, `pageIndexChange(25)`가 발행되고 화면은 3페이지 `row20`으로 이동한다. [페이지 보정과 크기 변경](../../../packages/ui/src/data-table.ts#L120) | 이전·다음과 페이지 크기 변경이 화면에 표시한 페이지를 기준으로 계산한다. Action으로 갱신한 인덱스도 유효 범위에 있다. |

## 검증 범위와 남은 작업

- `npm run check:ui`에서 Chromium 기반 테스트 15개가 모두 통과했다. 설치된 tarball을 순수 JS·React·Vue·Svelte에서 실행했다. 네 호스트는 공통 JSON을 조작하고, 순수 JS 테스트는 카탈로그 66개 예제를 마운트한다. 66개 JSON에는 공개 ID 357개가 등장한다. 카탈로그 전체에 공통으로 적용하는 검사는 투영 노드의 `ready` 상태와 DOM 마운트이며, 별도 상호작용 검사는 일부 예제에 적용한다. [소비자 테스트](../../../packages/ui/test/consumers.test.mjs#L104) · [카탈로그 마운트 검사](../../../packages/ui/test/consumers.test.mjs#L179)
- 입력 테스트는 숫자 `42`, `0`, `-3.5`를 확인한다. Command.Dialog 테스트는 두 슬롯 구조에서 검색·방향키·선택을 확인한다. 별도의 Chromium 151 재현에서 `null` 갱신과 Escape 뒤 무관한 State 쓰기가 각각 실패했다. 해당 재현의 View 및 렌더러 오류 배열은 비어 있었다. [입력 테스트](../../../packages/ui/test/recipe-behavior.test.mjs#L76) · [Command 테스트](../../../packages/ui/test/recipe-behavior.test.mjs#L106)
- 브라우저 추가 검증은 표의 동작을 대상으로 했다. 66개 전 계열의 입력 조합·애니메이션·모바일과 다른 브라우저 엔진은 전체 감사 범위에 포함하지 않았다.
- 검증 보강은 `support.json`에서 의미 있는 계약을 뽑아 **초기 반영 → 사용자 요청 → Action·State 갱신 → 외부 값 변경·비우기 → 비활성·닫기·해제**를 검사하는 순서가 적합하다. 폼은 `FormData`와 브라우저 제약 검사를, 오버레이는 포커스·이벤트 횟수·실제 열림 상태를 함께 확인한다. 초기 화면 검사에서 통과한 동일 JSON을 상태 전환에서도 사용하면 렌더러와 계약 사이의 불일치를 드러낼 수 있다.
