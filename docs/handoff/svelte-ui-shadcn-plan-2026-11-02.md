# Svelte UI 패키지 · shadcn 전체 지원 계획

현재 구현은 U44의 [구현·검증 인계](svelte-ui-shadcn-implementation-2026-11-03.md)를 따른다. 아래는 U43 작성 당시의 계획 기록이며 당시 미구현 표기를 현재 상태로 사용하지 않는다.

상태: **설계 제안·구현 전**. U43의 요청은 Svelte UI 패키지를 계획하고 shadcn-svelte 전체 지원을 첫 목표로 삼는 것이다. 이 문서의 이름·서명은 제안이며 현재 사용할 수 있는 SDK가 아니다. 기존 U42 core/Svelte 구현과 검증 결과는 유지한다.

## 목표와 ‘전체’의 기준

사용자는 Svelte 어댑터를 직접 작성하지 않고 준비된 묶음을 등록한 뒤 Viewstem JSON으로 화면을 구성한다. `@viewstem/svelte`는 UI가 없는 렌더러로 유지하고 UI 패키지가 공개 Component 계약과 실제 Svelte 구현을 함께 제공한다. core에 DOM·Tailwind·shadcn 의존성을 추가하지 않는다.

2026-11-02 확인한 [공식 Components 카탈로그](https://shadcn-svelte.com/docs/components)의 **66개 컴포넌트군 전부**를 목표로 한다. [고정 upstream](https://github.com/huntabyte/shadcn-svelte/commit/fe4b0ad3b8b30c6745346db008c3307b5afeabb1)은 `fe4b0ad3b8b30c6745346db008c3307b5afeabb1`, 해당 CLI package 버전은 `1.7.2`다.

- 62개는 공식 UI 소스가 있다. 각 barrel에서 동일 binding의 별칭을 합치면 **386개 공개 컴포넌트**다.
- Combobox, Data Table, Date Picker는 공식 조합 레시피이므로 실제 사용할 수 있는 어댑터를 추가 작성한다.
- Typography는 스타일 예제이므로 JSON으로 선택할 수 있는 의미 있는 텍스트 요소·variant 계약을 제공한다.
- 66개 안에 포함된 Attachment·Bubble·Message·Questionnaire·Trace 등도 빠뜨리지 않는다.
- 별도 AI Elements 카탈로그, blocks, 소스에 남아 있지만 현행 Components 카탈로그에 없는 `Form`은 이 기준 밖이다. Form이 공식적으로 Field에 의해 폐기됐다고 단정하지 않는다.

[전체 조사 목록](shadcn-component-inventory.json)은 66개 항목·386개 export·별칭·의존성·출처·barrel 해시를 보존한다. 이 수는 **현재 Viewstem 지원 수가 아니다**. 구현·제품 검증은 모두 0에서 시작한다. 하위 부품에는 부모 context 안에서만 쓸 수 있는 것도 있으므로 단독 렌더링 개수로 지원 여부를 세지 않는다.

‘전체 지원’은 모든 컴포넌트군과 공개 부품에 지원 경로와 테스트가 있는 상태다. 임의 JavaScript 함수·DOM ref·Snippet을 JSON에 넣을 수 있다는 뜻은 아니다. 각 prop/event/slot은 JSON 직접 지원, 명시적 코드 확장, 해당 어댑터에서 미지원으로 구분한다. 미지원 항목을 숨기거나 임의 문자열 실행으로 우회하지 않는다. 첫 의미 있는 기능 일부만 동작하는 상태를 전체 지원 완료로 표기하지 않는다.

## 패키지와 사용법 제안

npm 패키지는 **`@viewstem/svelte-ui` 하나**로 두고 UI 계열을 subpath로 분리한다.

| 경로 | 역할 |
|---|---|
| `@viewstem/svelte-ui` | 공통 `registerComponents`와 `ComponentSet` 타입 |
| `@viewstem/svelte-ui/shadcn` | 전체 등록용 `shadcn` 묶음 |
| `@viewstem/svelte-ui/shadcn/button` 등 | 컴포넌트군별 묶음; 필요한 JS만 import |
| `@viewstem/svelte-ui/shadcn/styles.css` | 사전 빌드한 CSS·기본 theme; 명시 import |
| `@viewstem/svelte-ui/shadcn/support.json` | 지원 버전·Component ID·입력·이벤트·슬롯·제한 목록 |

향후 Skeleton 지원을 구현하면 같은 패키지의 `/skeleton`을 추가한다. 아직 없는 경로·빈 어댑터를 미리 공개하지 않는다. React는 실제로 구현할 때 별도 프레임워크 패키지를 검토한다. Svelte UI를 vanilla JS 렌더러로 사용할 수 있다고 표기하지 않는다.

전체 등록은 다음과 같이 제안한다.

```ts
import { createRenderer } from '@viewstem/svelte';
import { registerComponents } from '@viewstem/svelte-ui';
import { shadcn } from '@viewstem/svelte-ui/shadcn';
import '@viewstem/svelte-ui/shadcn/styles.css';

const renderer = createRenderer();
registerComponents(renderer, shadcn);
const mounted = await renderer.mount({ target, view });
await mounted.initialComplete;
```

선택 등록은 같은 함수를 사용한다.

```ts
import { registerComponents } from '@viewstem/svelte-ui';
import { button } from '@viewstem/svelte-ui/shadcn/button';
import { dialog } from '@viewstem/svelte-ui/shadcn/dialog';

registerComponents(renderer, [button, dialog]);
```

`registerShadcn`, `registerSkeleton`, `install`, `use`처럼 같은 역할의 함수를 늘리기보다 등록 함수 하나와 묶음으로 구성한다. 각 묶음은 필요한 공개 계약·어댑터·내부 의존성을 포함한다. 일반 사용자가 개별 wrapper나 registry 계약을 작성할 필요가 없다.

전체 묶음은 모든 adapter를 정적으로 포함하므로 전체 JS가 필요한 경로다. 선택 import의 이점은 **브라우저 JS 범위**이며 npm 설치 용량 감소와 같은 의미가 아니다. 초기에는 공통 CSS 한 파일을 제공하므로 선택 import가 CSS까지 자동으로 줄인다고 약속하지 않는다. Button만 쓰는 소비자의 실제 build graph에 Chart·Table 엔진 등이 들어오지 않는지 검사한다. 문자열 필터 옵션으로 전체 import를 감춘 뒤 tree shaking이 된다고 설명하지 않는다.

## Component 계약과 구현 구조

제안하는 ID는 `shadcn.Button`, `shadcn.Dialog.Root`, `shadcn.Dialog.Trigger`, `shadcn.Dialog.Content`처럼 계열과 부품을 드러낸다. 단일 의미의 컴포넌트는 `.Root`를 생략하고 복합 컴포넌트는 유지한다. barrel의 두 별칭을 별도 Component로 중복 등록하지 않는다. exact ID 목록은 adapter manifest가 소유한다.

```json
{
  "render": {
    "id": "save",
    "componentRef": "shadcn.Button",
    "inputs": { "text": "저장", "variant": "default" },
    "on": { "click": { "actionRef": "save" } }
  }
}
```

위 JSON의 `text` 입력은 편리한 텍스트 기본 경로이며, 실제 계약을 구현할 때 default slot과의 우선순위도 정한다. 복합 UI는 기존 `slots`/`when`/`repeat`를 사용한다. 임의 `bind` 속성이나 두 번째 상태 엔진을 JSON DSL에 추가하지 않는다.

권장 내부 구조:

```text
packages/svelte-ui/
  upstream/                 # 원본 식별·해시·허용 라이선스·업데이트 정책
  src/lib/register.ts       # 공통 등록
  src/lib/shadcn/
    manifest/               # 계약과 원본 부품 대응
    adapters/               # 공통 연결 + 필요한 전용 어댑터
    vendor/                 # 고정 upstream에서 생성한 UI 소스
    recipes/                # Combobox, DataTable, DatePicker, Typography
    index.ts                # 전체 묶음
    button/index.ts         # 개별 묶음; 다른 계열 import 금지
    styles.css
  scripts/                  # 재현 가능한 원본 이행·CSS·지원표 생성
  test/                     # 계약, 타입, 브라우저, package/bundle 소비자
  example/                  # 모든 컴포넌트의 JSON 편집·실행 갤러리
```

단순 props·텍스트·슬롯·이벤트 전달은 공통 adapter 작성 규칙과 생성기로 처리한다. 표준화된 계약 데이터에서 반복 코드와 선언을 생성하되 props를 추정해 전부 허용하지 않는다. 제어 값·focus·날짜·callback/snippet 변환이 필요한 부분은 전용 어댑터를 쓴다. 원본 소스와 Viewstem 연결 코드는 분리해 upstream 변경을 검토할 수 있게 한다.

## 상호작용과 특수 컴포넌트

| 영역 | 설계 기준과 확인할 동작 |
|---|---|
| 입력·선택 | Value 입력 + `change` 등 명시 이벤트가 기본. 실제 payload schema를 부품별 공개. 기존 Action/SetState로 쓰기. 한글 IME·초기값·외부 reset·disabled·readonly·null/빈 문자열을 검증 |
| 복합 구성 | 정해진 부모/group context, 이름 있는 slot, 필수 Title/Fallback 유지. 임의 wrapper DOM을 추가해 Table 구조나 trigger semantics를 깨지 않음 |
| Trigger의 child snippet | DOM props/ref/attachment를 주입하는 `child`와 일반 children은 다름. 안전한 trigger 합성과 host 코드 확장 경로를 정하고 중첩 button으로 대체하지 않음 |
| Calendar·RangeCalendar·DatePicker | core의 날짜 문자열과 `@internationalized/date` DateValue를 명시 변환. locale·min/max·비활성 날짜·range 경계. 날짜만 있는 값을 UTC Date로 암묵 변환하지 않음 |
| Data Table | JSON column 정의, data, 정렬·필터·페이지·선택의 제어 값/이벤트. custom cell의 row 문맥과 callback을 어떻게 연결할지 별도 검증; 현재 renderSlot(name)만으로 모든 cell snippet을 지원한다고 간주하지 않음 |
| Chart | shadcn Chart.Container/Tooltip과 실제 LayerChart 렌더링 경로를 함께 설계. 축·series·데이터·tooltip·theme의 지원표와 실제 SVG/Canvas 검증. Container만 감싸고 Chart 지원으로 세지 않음 |
| Sonner | Toaster와 알림 호출을 함께 제공. 기존 코드 Action에서 호출할 수 있는 명시 연결, renderer별 격리·중복 ID·dismiss·폐기. render 때마다 toast를 반복 발생시키지 않음 |
| Carousel·Resizable·Sidebar | keyboard·pointer·반응형·제어 값/이벤트·context·cleanup. 크기 변화와 hidden→visible 전환에서도 확인 |
| Attachment·CodeBlock·Message 계열 | 표시·선택·복사·스크롤 등 실제 upstream 기능별 계약. 업로드/LLM/저장 서비스를 자동 추가하지 않음. 비JSON 객체가 필요한 API는 host 경계로 분리 |
| Typography | heading/list/quote/code 등 의미 있는 요소와 variant. raw HTML 삽입을 기본 텍스트 경로로 삼지 않음 |
| 오류·수명 | node pending/error에서 불완전 inputs 처리, emit 실패 관찰, replace/dispose 후 이벤트·timer·portal 정리. 비동기 import가 기존 initialComplete 의미를 바꾸지 않게 초기에는 정적 등록 |

shadcn의 [Chart](https://shadcn-svelte.com/docs/components/chart), [Data Table](https://shadcn-svelte.com/docs/components/data-table), [Sonner](https://shadcn-svelte.com/docs/components/sonner)는 서로 다른 통합 요구를 갖는다. LayerChart 지원이 기존 [선택 차트 계약](../spec/11-optional-charts.md)의 ECharts/Canvas 제품 검증 완료를 뜻하지 않는다. 적용되는 데이터·series·결측 의미는 보존하며, 범위 충돌이 확인되면 계약을 명시적으로 조정한다.

## 소스·스타일·의존성

shadcn-svelte는 소스 배포 모델이므로 npm CLI를 UI 런타임처럼 import하지 않는다. 고정 commit의 입력, 사용한 CLI/변환기 버전, 원본 파일 해시, 생성 파일 해시와 로컬 변경을 기록한다. 라이선스·저작권 표시를 배포물에 보존하고 재배포 전 해당 파일별 조건을 확인한다.

현재 upstream 원본은 `cn-*` 스타일 표식과 `IconPlaceholder`를 포함한다. 원본 폴더 복사만으로 완성된 스타일이 생기지 않는다. 공식 preset/style/icon 변환을 재현하거나 고정된 변환 결과를 vendoring하고, 그 뒤 상대 import·Viewstem adapter·CSS를 생성해야 한다. mutable `@latest`를 제품 빌드 재현 조건으로 쓰지 않는다.

첫 구현 기준은 **Nova·neutral·Lucide**를 제안한다. Svelte는 기존 검증 버전을 사용하고 실제 관련 의존성은 설치 시 버전·lockfile을 고정한다. 카탈로그의 모든 스타일 preset까지 동시에 지원한다는 뜻은 아니다. theme는 CSS 변수로 조정하고 light/dark를 검증한다.

소비자가 Tailwind를 추가 설정하지 않아도 기본 UI가 보이도록 CSS를 사전 빌드한다. host의 전역 reset·색상·폰트를 덮지 않고 portal에서도 동일 theme가 적용되도록 범위를 정한다. scoped selector·CSS prefix·portal container 방식은 0단계에서 실제 CSS 생성과 overlay로 결정한다. 사용자 class 문자열이 런타임에 Tailwind CSS를 생성하지는 않는다.

현재 조사는 개별 파일의 직접 import를 추출한 것이며 공유 utility·icon·style 변환기의 전체 transitive 의존성 검증을 대신하지 않는다. source ingestion 단계에서 실제 dependency graph를 확정한다. 지원 kit가 늘 때마다 별도 npm 패키지를 만드는 방식은 피하되, 설치 비용·peer 충돌·release 영향이 생기면 subpath만으로 해결됐다고 간주하지 않는다.

## 구현 순서와 완료 기준

0. **통합 경계 검증:** pinned source/style/icon 생성, Dialog/Select context, trigger child 합성, portal theme, DataTable row 문맥, Calendar 변환, 등록 충돌·중복·폐기 동작을 작은 실제 패키지 fixture로 증명한다. 현재 Renderer는 contract/implementation을 따로 등록하고 adapter introspection·해제를 공개하지 않는다. 안전한 묶음 등록을 구현할 때 필요한 최소 renderer 확장을 이 단계에서 판단한다. 실패 시 부분 등록을 남기는 동작을 숨기지 않는다.
1. **패키지 기반:** exports·types·CSS·원본 notice·전체/선택 묶음·지원 manifest·독립 tarball 소비자를 구성한다. 최소 Button과 Dialog를 실제 JSON으로 실행하고 브라우저 번들을 확인한다. 이 단계 통과를 전체 지원 완료로 보고하지 않는다.
2. **전체 부품 이행:** 아래 9개 묶음의 66개 항목과 해당 386개 부품을 manifest에 대응한다. 코드 생성 가능한 부분과 전용 어댑터를 구분하고 미지원 callback/slot은 항목별 남긴다. dependencies에 따라 실제 작성 순서는 조정할 수 있다.
3. **전체 갤러리:** 각 컴포넌트군의 정상·제어·오류 JSON 예제와 필수 부모 조합을 제공한다. JSON 편집, preview, State·Query·Action 검사와 연결한다. 기존 바닐라 playground와 Svelte UI 예제의 런타임/지원 범위를 구분한다.
4. **최종 검증:** 실제 package import·타입·Chromium·bundle·CSS·접근성·수명·core 회귀를 실행하고 지원표를 실행 결과와 연결한다. 기준 버전 66개 중 미구현/차단 항목이 남으면 전체 완료로 표시하지 않는다.

각 컴포넌트군에 아래 공통 인수 기준을 적용한다.

- 공개 계약과 실제 adapter, 부모/slot 요구가 일치하며 알 수 없거나 지원하지 않는 props/events를 조용히 무시하지 않는다.
- JSON에서 실제 UI가 렌더링되고 주요 상호작용이 core의 State/Action과 연결된다. 단순 mount 성공만으로 interactive 지원을 인정하지 않는다.
- 해당하는 keyboard/focus/ARIA, light/dark, 좁은 화면, 한국어 입력, reset/replace/dispose를 검사한다.
- 공개 하위 부품 각각의 대응 fixture나 명시적인 host 전용 사유를 기록한다. 타입/helper export를 Component 개수에 더하지 않는다.
- Node 22/24 빌드·엄격한 타입·독립 tarball 설치·Svelte 소비자가 통과하고, 선택 bundle과 전체 bundle 크기/모듈 목록을 공개한다.

## 전체 구현·검증 목록

아래 행은 모두 **미구현·미검증**이다. 숫자는 upstream의 고유 부품 조사 수이며 제품 테스트 통과 수가 아니다.

| 묶음 | 컴포넌트군 | 고유 부품 | 주요 검증 흐름 |
|---|---|---:|---|
| A 표시·텍스트 | [Alert](https://shadcn-svelte.com/docs/components/alert) | 4 | role·제목/설명 조합·variant |
| A 표시·텍스트 | [Aspect Ratio](https://shadcn-svelte.com/docs/components/aspect-ratio) | 1 | 비율·부모 resize·자식 배치 |
| A 표시·텍스트 | [Avatar](https://shadcn-svelte.com/docs/components/avatar) | 6 | 이미지 로드/실패·alt·fallback |
| A 표시·텍스트 | [Badge](https://shadcn-svelte.com/docs/components/badge) | 1 | variant·텍스트·링크 의미 |
| A 표시·텍스트 | [Breadcrumb](https://shadcn-svelte.com/docs/components/breadcrumb) | 7 | 링크·현재 위치·separator·ellipsis |
| A 표시·텍스트 | [Button](https://shadcn-svelte.com/docs/components/button) | 1 | click→Action·disabled·variant·slot |
| A 표시·텍스트 | [Button Group](https://shadcn-svelte.com/docs/components/button-group) | 3 | 방향·group semantics·중첩 구분 |
| A 표시·텍스트 | [Card](https://shadcn-svelte.com/docs/components/card) | 7 | Header/Title/Description/Content/Footer 조합 |
| A 표시·텍스트 | [Empty](https://shadcn-svelte.com/docs/components/empty) | 6 | 빈 상태 제목/설명/액션 조합 |
| A 표시·텍스트 | [Field](https://shadcn-svelte.com/docs/components/field) | 10 | label 연결·invalid·disabled·fieldset/group |
| A 표시·텍스트 | [Input Group](https://shadcn-svelte.com/docs/components/input-group) | 6 | Addon/Input/Textarea/Button 조합·focus |
| A 표시·텍스트 | [Item](https://shadcn-svelte.com/docs/components/item) | 10 | media·제목/설명·액션·group 조합 |
| A 표시·텍스트 | [Kbd](https://shadcn-svelte.com/docs/components/kbd) | 2 | 키 이름·키 조합·텍스트 |
| A 표시·텍스트 | [Label](https://shadcn-svelte.com/docs/components/label) | 1 | for 연결·클릭 focus·disabled 맥락 |
| A 표시·텍스트 | [Separator](https://shadcn-svelte.com/docs/components/separator) | 1 | 방향·decorative/semantic |
| A 표시·텍스트 | [Skeleton](https://shadcn-svelte.com/docs/components/skeleton) | 1 | 크기·레이아웃 안정·비대화형 |
| A 표시·텍스트 | [Spinner](https://shadcn-svelte.com/docs/components/spinner) | 1 | 로딩 표시·접근성 이름·아이콘 조합 |
| A 표시·텍스트 | [Table](https://shadcn-svelte.com/docs/components/table) | 8 | 올바른 table/thead/tbody/tr/td 구조·caption |
| A 표시·텍스트 | [Typography](https://shadcn-svelte.com/docs/components/typography) | 조합/스타일 | 제목·문단·목록·인용·code 의미와 variant |
| B 입력·선택 | [Checkbox](https://shadcn-svelte.com/docs/components/checkbox) | 1 | checked/indeterminate·disabled·keyboard·reset |
| B 입력·선택 | [Input](https://shadcn-svelte.com/docs/components/input) | 1 | 문자/숫자 입력·IME·blur·외부 reset |
| B 입력·선택 | [Input OTP](https://shadcn-svelte.com/docs/components/input-otp) | 4 | 자리 수·붙여넣기·focus 이동·값 변경 |
| B 입력·선택 | [Native Select](https://shadcn-svelte.com/docs/components/native-select) | 3 | option/group·선택/disabled·form semantics |
| B 입력·선택 | [Progress](https://shadcn-svelte.com/docs/components/progress) | 1 | 값·경계·ARIA |
| B 입력·선택 | [Radio Group](https://shadcn-svelte.com/docs/components/radio-group) | 2 | 단일 선택·방향키·disabled item |
| B 입력·선택 | [Slider](https://shadcn-svelte.com/docs/components/slider) | 1 | 단일/범위·min/max/step·keyboard/pointer |
| B 입력·선택 | [Switch](https://shadcn-svelte.com/docs/components/switch) | 1 | checked·keyboard·disabled·reset |
| B 입력·선택 | [Textarea](https://shadcn-svelte.com/docs/components/textarea) | 1 | 여러 줄·IME·크기·reset |
| B 입력·선택 | [Toggle](https://shadcn-svelte.com/docs/components/toggle) | 1 | pressed·disabled·keyboard |
| B 입력·선택 | [Toggle Group](https://shadcn-svelte.com/docs/components/toggle-group) | 2 | 단일/다중 선택·group focus |
| C context·내용 | [Accordion](https://shadcn-svelte.com/docs/components/accordion) | 4 | 단일/다중 열림·trigger focus·disabled |
| C context·내용 | [Collapsible](https://shadcn-svelte.com/docs/components/collapsible) | 3 | open 제어·trigger/content 수명 |
| C context·내용 | [Tabs](https://shadcn-svelte.com/docs/components/tabs) | 4 | 선택·keyboard·비활성·content 수명 |
| C context·내용 | [Scroll Area](https://shadcn-svelte.com/docs/components/scroll-area) | 2 | 세로/가로 스크롤·resize·keyboard |
| C context·내용 | [Tooltip](https://shadcn-svelte.com/docs/components/tooltip) | 5 | provider·지연·hover/focus·portal 정리 |
| C context·내용 | [Hover Card](https://shadcn-svelte.com/docs/components/hover-card) | 4 | trigger/content·지연·닫힘·portal |
| C context·내용 | [Popover](https://shadcn-svelte.com/docs/components/popover) | 8 | open·trigger child 합성·focus 복귀·portal |
| D overlay | [Alert Dialog](https://shadcn-svelte.com/docs/components/alert-dialog) | 12 | 필수 Title·확인/취소·focus trap/복귀 |
| D overlay | [Dialog](https://shadcn-svelte.com/docs/components/dialog) | 10 | Title/Description·Escape·outside·focus·portal |
| D overlay | [Drawer](https://shadcn-svelte.com/docs/components/drawer) | 11 | 방향·drag·open 제어·focus·cleanup |
| D overlay | [Sheet](https://shadcn-svelte.com/docs/components/sheet) | 10 | 방향·제목·열림/닫힘·focus·portal |
| E 메뉴 | [Command](https://shadcn-svelte.com/docs/components/command) | 11 | 입력 검색·group/item·keyboard·선택 |
| E 메뉴 | [Context Menu](https://shadcn-svelte.com/docs/components/context-menu) | 16 | context trigger·submenu·선택·keyboard |
| E 메뉴 | [Dropdown Menu](https://shadcn-svelte.com/docs/components/dropdown-menu) | 17 | group·submenu·체크/라디오·focus |
| E 메뉴 | [Menubar](https://shadcn-svelte.com/docs/components/menubar) | 17 | 메뉴 간 keyboard·submenu·선택 |
| E 메뉴 | [Navigation Menu](https://shadcn-svelte.com/docs/components/navigation-menu) | 8 | link/trigger/content·keyboard·활성 상태 |
| E 메뉴 | [Select](https://shadcn-svelte.com/docs/components/select) | 12 | group/item·단일/다중 값·keyboard·clear |
| F 레이아웃·이동 | [Carousel](https://shadcn-svelte.com/docs/components/carousel) | 5 | 이전/다음·방향·반응형·cleanup |
| F 레이아웃·이동 | [Resizable](https://shadcn-svelte.com/docs/components/resizable) | 3 | panel/group/handle·pointer/keyboard·크기 이벤트 |
| F 레이아웃·이동 | [Sidebar](https://shadcn-svelte.com/docs/components/sidebar) | 23 | provider·축소·모바일·메뉴·shortcut cleanup |
| F 레이아웃·이동 | [Pagination](https://shadcn-svelte.com/docs/components/pagination) | 9 | 현재 페이지·이전/다음·ellipsis·이벤트 |
| G 날짜 | [Calendar](https://shadcn-svelte.com/docs/components/calendar) | 18 | date 문자열 변환·locale·keyboard·disabled |
| G 날짜 | [Range Calendar](https://shadcn-svelte.com/docs/components/range-calendar) | 18 | 시작/끝·부분 range·경계·reset |
| G 날짜 | [Date Picker](https://shadcn-svelte.com/docs/components/date-picker) | 조합/스타일 | Popover+Calendar·단일/range·선택 후 focus |
| H 조합·서비스 | [Combobox](https://shadcn-svelte.com/docs/components/combobox) | 조합/스타일 | 검색·선택·keyboard·외부 value·clear |
| H 조합·서비스 | [Data Table](https://shadcn-svelte.com/docs/components/data-table) | 조합/스타일 | 열·정렬/필터/페이지/선택·row 문맥·빈 데이터 |
| H 조합·서비스 | [Chart](https://shadcn-svelte.com/docs/components/chart) | 2 | 실제 차트·축/series·결측·tooltip·resize/theme |
| H 조합·서비스 | [Sonner](https://shadcn-svelte.com/docs/components/sonner) | 1 | 표시/dismiss Action·ID·timeout·인스턴스 격리 |
| I 추가 표시·대화 | [Attachment](https://shadcn-svelte.com/docs/components/attachment) | 9 | 파일 정보·미리보기·선택/제거 의미·액션 |
| I 추가 표시·대화 | [Bubble](https://shadcn-svelte.com/docs/components/bubble) | 4 | 방향·variant·내용·상태 표현 |
| I 추가 표시·대화 | [Code Block](https://shadcn-svelte.com/docs/components/code-block) | 8 | 코드 escaping·언어/테마·복사·상태 |
| I 추가 표시·대화 | [Marker](https://shadcn-svelte.com/docs/components/marker) | 3 | 기본 표시·상태/variant·접근성 |
| I 추가 표시·대화 | [Message](https://shadcn-svelte.com/docs/components/message) | 6 | 역할·내용/액션/보조 내용 조합 |
| I 추가 표시·대화 | [Message Scroller](https://shadcn-svelte.com/docs/components/message-scroller) | 6 | 추가 메시지·스크롤 위치·이동·cleanup |
| I 추가 표시·대화 | [Questionnaire](https://shadcn-svelte.com/docs/components/questionnaire) | 15 | 질문/답변 조합·값/이벤트·keyboard |
| I 추가 표시·대화 | [Trace](https://shadcn-svelte.com/docs/components/trace) | 8 | 진행/완료/오류·중첩 항목·열림/닫힘 |

## 이번 계획 검증과 잔여

공식 목록과 고정 소스의 66개 항목을 대조했고, alias 중복을 제거한 386개 부품과 직접 dependency를 기록했다. 표의 9개 묶음은 중복/누락 없이 66개를 덮는다. source barrel의 SHA-256과 immutable source 링크를 inventory에 남겼다.

Svelte 5.57.3의 일반 snippet→provider→child context 연결은 별도 임시 fixture에서 Node 22/Chromium 151로 확인했다. 이는 일반적인 context 전달의 가능성만 확인한 것이며 실제 Bits UI trigger/portal/DataTable row context나 UI 패키지 인수 통과가 아니다. 제품 소스·의존성·기존 실험은 변경하지 않았다.

계획 검증 기록은 [계획 대조 결과](svelte-ui-shadcn-plan-verification.json)를 따른다. 원본 스타일 변환, 모든 public prop의 JSON 적합성, scoped slot/child/ref, 원자적 등록, CSS 격리·portal, Chart/Toast 동작은 구현 0단계에서 증명해야 한다. 이 문서의 사용 예시는 제안 API이므로 실제 package import가 아직 가능하지 않다.

제품 동작을 바꾸는 선택은 전체 카탈로그 범위 변경, JSON 작성 방식 변경, renderer 공개 계약 확장, 기본 등록/전역 효과 추가다. 그런 선택이 실제로 필요해지면 영향과 구체안을 먼저 제시한다. 원본 해시·빌드 경로·테스트 구성 등 기술 세부는 이 계획 안에서 구현자가 해결한다.
