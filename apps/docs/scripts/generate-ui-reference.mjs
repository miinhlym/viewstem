import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';
import ts from 'typescript';
import { getComponentDemo } from '../src/examples/component-demos.mjs';
import { getDemoControls, controlFamilies } from '../src/examples/component-demo-controls.mjs';

const demoControls = Object.fromEntries(['en', 'ko'].map(locale => [locale, new Map(controlFamilies.flatMap(family =>
  getDemoControls(family, locale, getComponentDemo(family, locale).view).map(control => [control.reference.slice(1), control]))) ]));

const root = fileURLToPath(new URL('../../../', import.meta.url));
const ui = join(root, 'packages/svelte-ui');
const shadcn = join(ui, 'src/lib/shadcn');
const docs = join(root, 'apps/docs/src/content/docs');
const support = readJson(join(shadcn, 'support.json'));
const domSupport = readJson(join(root, 'packages/ui/dist/support.json'));
const inventory = readJson(join(root, 'docs/handoff/shadcn-component-inventory.json'));
const manifest = readJson(join(ui, 'package.json'));
const args = process.argv.slice(2);
const check = args.includes('--check');
const manifestIndex = args.indexOf('--manifest');
const coveragePath = manifestIndex >= 0 && args[manifestIndex + 1];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const notes = {
  accordion: [
    'Nest Item under Root and put Trigger and Content inside each item. Match the Root value to its type. Single mode uses a string and multiple mode uses an array. Each Item has its own value.',
    'Root 아래에 Item을 두고 각 Item에 Trigger와 Content를 넣습니다. Root의 type에 맞춰 단일 모드에서는 문자열, 다중 모드에서는 배열을 값으로 사용합니다. 각 Item에는 고유한 값을 지정합니다.',
  ],
  'alert-dialog': [
    'Use Root with Trigger and Content. Include Title, Description, and the Cancel and Action controls for the decision.',
    'Root 안에 Trigger와 Content를 배치합니다. 사용자가 결정을 내릴 수 있도록 Title, Description, Cancel, Action을 구성합니다.',
  ],
  alert: [
    'Group Title, Description, and an optional Action inside Root. Use the destructive variant for an error notice that stays in the layout.',
    'Root 안에 Title, Description과 필요한 경우 Action을 넣습니다. 레이아웃에 표시되는 오류 안내에는 destructive 변형을 사용할 수 있습니다.',
  ],
  'aspect-ratio': [
    'Set ratio to width divided by height, such as 1.7777777777777777 for 16:9. Put the content in the default slot.',
    'ratio는 너비를 높이로 나눈 값입니다. 16:9의 경우 1.7777777777777777을 사용합니다. 콘텐츠는 기본 슬롯에 배치합니다.',
  ],
  attachment: [
    'Use Group for a set of attachments. Each Root can contain Media, Content with Title and Description, and Actions.',
    '첨부 파일 목록을 Group으로 묶습니다. 각 Root 안에는 Media, Title과 Description을 담은 Content, Actions를 둘 수 있습니다.',
  ],
  avatar: [
    'Place Image and Fallback under the same Root so that the fallback can appear while the image is unavailable. Group and GroupCount compose stacked avatars.',
    'Image와 Fallback을 같은 Root 아래에 두면 이미지를 사용할 수 없을 때 대체 내용을 표시할 수 있습니다. Group과 GroupCount로 겹쳐 쌓인 아바타를 조합합니다.',
  ],
  badge: [
    'Give the badge a short text label and choose a variant for its visual emphasis.',
    '짧은 텍스트 레이블을 지정하고 variant로 시각적 강조 정도를 선택합니다.',
  ],
  breadcrumb: [
    'Put List under Root and wrap links in Item. Use Page for the current location and Separator between items.',
    'Root 아래에 List를 두고 링크를 Item으로 감쌉니다. 현재 위치에는 Page를, 항목 사이에는 Separator를 사용합니다.',
  ],
  bubble: [
    'Group message bubbles and place Content and Reactions inside each Root. Use align on Root to position a bubble.',
    '말풍선을 Group으로 묶고 각 Root에 Content와 Reactions를 넣습니다. Root의 align으로 말풍선 위치를 정합니다.',
  ],
  'button-group': [
    'Place buttons in the default slot to share the group layout. Register button separately when its ID appears in the View.',
    '기본 슬롯의 버튼은 그룹 레이아웃을 공유합니다. View에 버튼 ID를 쓴다면 button 세트도 별도로 등록합니다.',
  ],
  button: [
    'With a nonempty href the part renders a link. Otherwise it renders a button whose type defaults to "button". Set type to "submit" when you intend to submit a form.',
    'href가 비어 있지 않으면 링크를 렌더링합니다. 그 외에는 type 기본값이 "button"인 버튼을 렌더링합니다. 폼을 제출하려면 type을 "submit"으로 지정합니다.',
  ],
  calendar: [
    'The JSON Root renders the full month grid. In single mode use a date-only string for value, and in multiple mode use an array of those strings. The native Calendar export also renders a complete calendar. To build your own grid from the native parts below, place it inside the children snippet of a Bits UI Calendar root and pass the scoped month and day values to the grid parts.',
    'JSON Root는 월 달력 전체를 렌더링합니다. 단일 모드의 value에는 날짜 문자열, 다중 모드에는 날짜 문자열 배열을 사용합니다. 네이티브 Calendar export도 완성된 달력을 렌더링합니다. 아래 네이티브 부품으로 달력 격자를 직접 조립할 때는 Bits UI Calendar 루트의 children 스니펫 안에서 월과 일 값을 각 격자 부품에 넘깁니다.',
  ],
  card: [
    'Place Title and Description in Header, main content in Content, and controls in Footer. Use Action for a header-level control.',
    'Header에 Title과 Description을, Content에 본문을, Footer에 컨트롤을 넣습니다. 헤더에 컨트롤을 배치할 때는 Action을 사용합니다.',
  ],
  carousel: [
    'Put Item parts inside Content under Root and place Previous and Next beside Content. Supply Embla options, plugins, or an API callback through native Svelte props.',
    'Root 안의 Content에 Item을 넣고 Content 옆에 Previous와 Next를 배치합니다. Embla 옵션, 플러그인, API 콜백은 네이티브 Svelte prop으로 전달합니다.',
  ],
  chart: [
    'Use shadcn.Chart for a line, area, bar, or pie from JSON. Every x must be a unique string or finite number. Each series needs a unique nonempty id and a nonempty key. Every y must be finite or explicitly null. Use one nonnegative series for pie. Invalid data displays an error. Hex colors, CSS color names, and var(--chart-1) through var(--chart-5) are accepted as color strings. Values outside the supported syntax fall back to the palette. Chart.Container requires CSS-safe IDs and config keys (letters, digits, underscores, and hyphens) and valid CSS colors. Use the native Tooltip inside a LayerChart tooltip snippet under Chart.Container in Svelte.',
    'JSON에서 선·영역·막대·원형 차트를 그리려면 shadcn.Chart를 사용합니다. 각 x는 고유한 문자열 또는 유한한 숫자여야 합니다. 각 시리즈에는 고유하고 비어 있지 않은 id와 비어 있지 않은 key가 필요합니다. 각 y는 유한한 숫자 또는 명시적 null이어야 합니다. 원형 차트에는 음수가 없는 시리즈 하나를 사용합니다. 잘못된 데이터는 오류를 표시합니다. 색상에는 16진수, CSS 색상 이름, var(--chart-1)부터 var(--chart-5)까지 사용할 수 있습니다. 지원 구문에 맞지 않으면 기본 팔레트 색상을 사용합니다. Chart.Container의 ID와 config 키에는 영문자, 숫자, 밑줄, 하이픈을 사용하고 색상은 유효한 CSS 색상이어야 합니다. 네이티브 Tooltip은 Svelte에서 Chart.Container 아래 LayerChart의 tooltip 스니펫 안에 배치합니다.',
  ],
  checkbox: [
    'Read or set checked and indeterminate separately. Use checkedChange to write a boolean back to State.',
    'checked와 indeterminate를 별도로 읽거나 설정합니다. checkedChange로 불리언을 State에 기록할 수 있습니다.',
  ],
  'code-block': [
    'Pass a plain source string to Content through code. Use lineNumbers to show line numbers, or pass an array of highlighted tokens to Line.code when you already have token data.',
    '일반 소스 문자열은 Content의 code에 넘깁니다. 줄 번호를 표시하려면 lineNumbers를 설정하세요. 강조할 토큰 데이터가 있다면 Line의 code에 토큰 배열을 넘깁니다.',
  ],
  collapsible: [
    'Put Trigger and Content under Root. Project open from State and handle openChange to keep a controlled section in sync.',
    'Root 아래에 Trigger와 Content를 둡니다. 외부에서 열림 상태를 제어할 때는 State에서 open을 읽고 openChange로 갱신합니다.',
  ],
  combobox: [
    'Supply options with value and label. Duplicate values keep the first option and empty values are skipped. Pass an empty string as value to clear the current selection. Handle valueChange to write the chosen string to State.',
    'options에 value와 label을 지정합니다. 값이 겹치면 첫 항목을 사용하고 빈 값은 건너뜁니다. value에 빈 문자열을 넘기면 선택을 지울 수 있습니다. valueChange로 선택한 문자열을 State에 기록합니다.',
  ],
  command: [
    'Group Input and List under Root, and place Item parts in the List. When the item value differs from its visible label, put that label in keywords so users can search by it.',
    'Root 아래에 Input과 List를 두고 List에 Item을 넣습니다. 항목의 value와 화면에 보이는 레이블이 다르면 레이블로 검색할 수 있도록 keywords에 레이블을 추가합니다.',
  ],
  'context-menu': [
    'Put the target surface in Trigger and put the context actions in Content. Use Sub, SubTrigger, and SubContent for nested menus.',
    '우클릭 대상은 Trigger에, 컨텍스트 동작은 Content에 배치합니다. 하위 메뉴는 Sub, SubTrigger, SubContent로 만듭니다.',
  ],
  'data-table': [
    'Set rowId to the name of a field containing a unique nonempty string per row. Rows without a valid ID or with a repeated ID are omitted. Columns need unique IDs and accessors for JSON fields. Cells render strings, numbers, and booleans. Supply sorting, pageIndex, pageSize, filter, and selectedIds from State and use the corresponding change events. If filtering puts pageIndex out of range, the last page is shown and State remains host-controlled. Selection IDs can outlive their rows. Set `labels` to override the built-in text. Omitted fields use the English defaults. In `selectRow`, `{id}` expands to the row ID. In `page`, `{page}` and `{pages}` expand to the displayed page number and page count. Compose a native Svelte table for custom cells.',
    'rowId에는 행마다 고유하고 비어 있지 않은 문자열을 담은 필드 이름을 지정합니다. 유효한 ID가 없거나 ID가 중복된 행은 표시하지 않습니다. 열에는 고유한 ID와 JSON 필드 접근 키가 필요합니다. 셀에는 문자열, 숫자, 불리언이 표시됩니다. sorting, pageIndex, pageSize, filter, selectedIds를 State에서 공급하고 대응하는 변경 이벤트로 갱신합니다. 필터 때문에 pageIndex가 범위를 벗어나면 마지막 페이지를 표시하고 State는 호스트가 관리합니다. 선택한 ID는 행이 없어져도 유지할 수 있습니다. 기본 문구를 바꾸려면 `labels`를 지정합니다. 생략한 필드에는 영어 기본값이 적용됩니다. `selectRow`의 `{id}`는 행 ID로, `page`의 `{page}`와 `{pages}`는 표시 중인 페이지 번호와 전체 페이지 수로 바뀝니다. 사용자 정의 셀은 네이티브 Svelte에서 테이블을 조합해 구현합니다.',
  ],
  'date-picker': [
    'Use date-only ISO strings such as "2026-11-03". Use value for a single date or range with start and end for a range. When mode is omitted, providing range selects range mode. Each range endpoint can be null.',
    '"2026-11-03" 같은 날짜 전용 ISO 문자열을 사용합니다. 단일 날짜는 value에, 기간은 start와 end를 포함한 range에 넣습니다. mode를 생략하고 range를 넘기면 기간 모드가 됩니다. 기간의 양 끝은 각각 null일 수 있습니다.',
  ],
  dialog: [
    'Put Trigger and Content under Root. Include Title and Description for accessible context. Use open and openChange when State controls visibility. The child slot lets a kit Button render the trigger element.',
    'Root 아래에 Trigger와 Content를 둡니다. 접근성을 위해 Title과 Description을 포함합니다. 표시 여부를 State로 제어할 때는 open과 openChange를 사용합니다. child 슬롯에 키트의 Button을 넣으면 그 버튼이 트리거 요소를 렌더링합니다.',
  ],
  drawer: [
    'Compose Root, Trigger, Content, Title, and Description. Root direction changes the edge from which the drawer opens.',
    'Root, Trigger, Content, Title, Description을 조합합니다. Root의 direction으로 드로어가 열리는 방향을 정합니다.',
  ],
  'dropdown-menu': [
    'Compose Trigger and Content under Root. Item can handle select. Use CheckboxGroup and RadioGroup when State needs to retain a choice.',
    'Root 아래에 Trigger와 Content를 배치합니다. Item에서 select를 처리할 수 있습니다. 선택을 State에 보관할 때는 CheckboxGroup과 RadioGroup을 사용합니다.',
  ],
  empty: [
    'Combine Header, Media, Title, and Description for an empty-state message. Put a recovery or next-step control in Content.',
    '빈 상태 메시지는 Header, Media, Title, Description을 조합합니다. 복구 또는 다음 단계 컨트롤은 Content에 둡니다.',
  ],
  field: [
    'Associate Label and the actual input through for and id. Use Error for the message and data-invalid on the field when the input is invalid.',
    'Label의 for와 실제 입력 요소의 id를 맞춥니다. 오류 메시지는 Error에 두고 입력이 유효하지 않을 때는 필드에 data-invalid를 설정합니다.',
  ],
  'hover-card': [
    'Place Trigger and Content under Root to disclose contextual information on hover or focus.',
    'Root 아래에 Trigger와 Content를 배치해 포인터를 올리거나 포커스했을 때 관련 정보를 표시합니다.',
  ],
  'input-group': [
    'Group the Input or Textarea with Addon, Text, and Button parts under Root. Use the input part’s own event for edits.',
    'Root 아래에 Input 또는 Textarea와 Addon, Text, Button을 배치합니다. 편집은 입력 부품의 이벤트로 처리합니다.',
  ],
  'input-otp': [
    'Set maxlength on Root. For a custom JSON display, give each Slot its cell description. Use valueChange for the current value and complete for the full code. Use Svelte for pasteTransformer or a scoped snippet that builds cells from the native input state.',
    'Root에 maxlength를 지정합니다. JSON으로 표시를 조합할 때는 각 Slot에 cell 설명을 넘깁니다. 현재 값은 valueChange, 완성된 코드는 complete로 받습니다. pasteTransformer나 네이티브 입력 상태에서 셀을 만드는 스코프 스니펫은 Svelte에서 사용합니다.',
  ],
  input: [
    'Use input to capture text edits or change for the committed DOM change. The payload value is a string. FileList and bind:files are native Svelte features.',
    '텍스트 편집은 input으로, 확정된 DOM 변경은 change로 받습니다. 페이로드의 value는 문자열입니다. FileList와 bind:files는 네이티브 Svelte 기능입니다.',
  ],
  item: [
    'Use Root with Media and Content, then nest Title and Description inside Content. Place independent controls in Actions.',
    'Root 아래에 Media와 Content를 두고 Content 안에 Title과 Description을 넣습니다. 독립적인 컨트롤은 Actions에 배치합니다.',
  ],
  kbd: [
    'Use Root for the displayed key and Group to assemble a chord or shortcut.',
    '키 표시는 Root에, 여러 키를 조합한 단축키는 Group에 넣습니다.',
  ],
  label: [
    'Set for to the HTML id of the input it labels. Put the visible label in text or the default slot.',
    'for를 레이블이 가리키는 입력 요소의 HTML id와 맞춥니다. 화면에 보이는 레이블은 text 또는 기본 슬롯에 넣습니다.',
  ],
  marker: [
    'Use Root as an inline visual annotation, with Icon and Content inside it. Choose a variant on Root.',
    '인라인 시각 주석은 Root로 감싸고 안에 Icon과 Content를 둡니다. Root에 variant를 지정합니다.',
  ],
  menubar: [
    'Nest Menu parts under Root, and put Trigger and Content inside each Menu. Use a distinct Menu value for each top-level menu.',
    'Root 아래에 Menu를 두고 각 Menu 안에 Trigger와 Content를 배치합니다. 최상위 Menu마다 고유한 value를 지정합니다.',
  ],
  'message-scroller': [
    'Compose Provider, Root, Viewport, Content, and Item for a scrolling message list. Use Button for scrolling controls. In host Svelte, the three exported hooks give access to scroll commands, scrollability, and visibility from the provider context.',
    'Provider, Root, Viewport, Content, Item으로 스크롤 메시지 목록을 조합합니다. 스크롤 컨트롤에는 Button을 사용합니다. 호스트 Svelte에서는 공개 훅 세 개로 Provider 문맥의 스크롤 명령, 스크롤 가능 여부, 가시성을 조회할 수 있습니다.',
  ],
  message: [
    'Use Group for a conversation section and Root for each message. Use Avatar next to Content and put Header and Footer inside the message content.',
    '대화 단위는 Group, 개별 메시지는 Root로 묶습니다. Content 옆에 Avatar를 배치하고 메시지 본문 안에 Header와 Footer를 둘 수 있습니다.',
  ],
  'native-select': [
    'Use Option parts under Root and OptGroup for grouped options. In multiple mode Root accepts a value array for display, and DOM change emits the first selected value as a string. Use Select for a multiple-selection callback that emits an array.',
    'Root 아래에 Option을 넣고 항목을 묶을 때는 OptGroup을 사용합니다. 다중 모드의 Root는 값 배열을 표시할 수 있고 DOM change는 첫 선택 값만 문자열로 전달합니다. 배열이 필요한 다중 선택 콜백은 Select에서 사용할 수 있습니다.',
  ],
  'navigation-menu': [
    'Put Items in List under Root. Use Trigger with Content for a disclosure and Link for a navigable destination.',
    'Root 아래 List에 Item을 넣습니다. 펼쳐 보는 항목에는 Trigger와 Content를, 이동 대상에는 Link를 사용합니다.',
  ],
  pagination: [
    'Set count and perPage on Root. Project the current page through page and handle pageChange. Page parts receive the page data as an input.',
    'Root에서 count와 perPage를 설정합니다. page로 현재 페이지를 공급하고 pageChange를 처리합니다. Page 부품에는 페이지 데이터를 입력으로 넘깁니다.',
  ],
  popover: [
    'Pair Trigger with Content under Root. Use open and openChange when the view controls visibility.',
    'Root 아래에 Trigger와 Content를 배치합니다. View에서 표시 여부를 제어할 때는 open과 openChange를 사용합니다.',
  ],
  progress: [
    'Use value and max for numeric progress. Provide an accessible name with aria-label or aria-labelledby.',
    '수치 진행률에는 value와 max를 사용합니다. aria-label 또는 aria-labelledby로 접근 가능한 이름을 제공합니다.',
  ],
  questionnaire: [
    'Declare the steps in Root.items. To choose the starting step for internal navigation, set defaultItem to its name. The first enabled step is the fallback. To keep the active step in Viewstem State, read State through item and update it from itemChange. Use Actions for Previous, Next, Skip, or Submit.',
    'Root.items에 단계를 선언합니다. 컴포넌트가 이동을 관리할 때는 defaultItem에 시작 단계의 이름을 지정합니다. 기본으로 첫 번째 활성 단계를 사용합니다. 활성 단계를 Viewstem State에 두려면 item으로 State를 읽고 itemChange로 갱신합니다. Actions에 Previous, Next, Skip, Submit을 배치합니다.',
  ],
  'radio-group': [
    'Put Item parts with distinct values inside Root. Read the selection with valueChange.',
    'Root 안에 서로 다른 value를 가진 Item을 배치합니다. 선택은 valueChange로 받습니다.',
  ],
  'range-calendar': [
    'The JSON Root renders a full calendar. Pass value as a date range with start and end, and read the encoded range from valueChange. For a custom native grid, use the children snippet of a Bits UI RangeCalendar root and supply the scoped month and day values to the native parts.',
    'JSON Root는 달력 전체를 렌더링합니다. value에 start와 end를 담은 날짜 범위를 넘기고 valueChange에서 변환된 범위를 읽습니다. 네이티브 격자를 직접 조합하려면 Bits UI RangeCalendar 루트의 children 스니펫을 사용해 월과 일 값을 네이티브 부품에 전달합니다.',
  ],
  resizable: [
    'Use PaneGroup for the orientation, Pane for each region, and Handle between panes. Use native Svelte for storage with methods and callbacks with multiple arguments.',
    'PaneGroup으로 방향을 정하고 각 영역에는 Pane, 영역 사이에는 Handle을 배치합니다. 메서드가 있는 저장소와 여러 인수를 받는 콜백은 네이티브 Svelte에서 사용합니다.',
  ],
  'scroll-area': [
    'Put content in Root and constrain its size using host CSS. Root creates the viewport and scrollbars for the selected orientation.',
    'Root에 콘텐츠를 넣고 호스트 CSS로 스크롤 영역의 크기를 제한합니다. Root가 뷰포트와 선택한 orientation에 맞는 스크롤바를 생성합니다.',
  ],
  select: [
    'Nest Trigger and Content under Root and put Items inside Content. Single mode uses a string value and multiple mode uses an array. Supply value and label pairs in Root.items to show the label for an initial or externally assigned value while the menu is closed.',
    'Root 아래에 Trigger와 Content를 두고 Content에 Item을 넣습니다. 단일 모드의 value는 문자열, 다중 모드에서는 배열입니다. 메뉴를 열기 전에도 초기값이나 외부에서 설정한 값의 레이블을 표시하려면 Root.items에 value와 label 쌍을 제공합니다.',
  ],
  separator: [
    'Choose horizontal or vertical orientation. Decorative separators can be marked with decorative.',
    '가로 또는 세로 orientation을 선택합니다. 장식용 구분선은 decorative로 표시할 수 있습니다.',
  ],
  sheet: [
    'Compose Root, Trigger, and Content for a panel. Set side on Content to choose the opening edge and add Title and Description to label it.',
    'Root, Trigger, Content로 패널을 조합합니다. Content의 side로 열리는 방향을 정하고 Title과 Description으로 패널에 이름과 설명을 붙입니다.',
  ],
  sidebar: [
    'Wrap the sidebar in Provider. Place the menu and groups inside Root, and put the main content in Inset. The native useSidebar hook reads the Provider context for reactive open state and toggle controls.',
    'Provider로 사이드바를 감쌉니다. Root 안에 메뉴와 그룹을 두고 본문은 Inset에 배치합니다. 네이티브 useSidebar 훅으로 Provider의 반응형 열림 상태와 토글 함수를 가져올 수 있습니다.',
  ],
  skeleton: [
    'Apply a host class to give the placeholder approximately the same size as the content it represents.',
    '호스트 클래스로 자리표시자의 크기를 실제 콘텐츠와 비슷하게 지정합니다.',
  ],
  slider: [
    'Set min, max, and step as needed. With a numeric step, the defaults are 0, 100, and 1. A step array supplies the discrete positions and their bounds. Use a numeric value in single mode or an array in multiple mode. Handle valueChange for edits and valueCommit for the committed value.',
    '필요에 따라 min, max, step을 지정합니다. step이 숫자일 때 기본값은 각각 0, 100, 1입니다. step 배열은 선택 가능한 위치와 기본 범위를 정합니다. 단일 모드는 숫자 값, 다중 모드는 배열을 사용합니다. 편집은 valueChange, 확정된 값은 valueCommit으로 처리합니다.',
  ],
  sonner: [
    'Use shadcn.Notifications for JSON-driven notifications. It reconciles the list by ID, keeps the first duplicate, and clears its notifications on disposal. Handle dismiss to remove the item from State. Use shadcn.Sonner or the native Toaster with the toast helper for imperative notifications. Give each host toaster a distinct toasterId and manage its cleanup.',
    'JSON 기반 알림에는 shadcn.Notifications를 사용합니다. ID로 알림 목록을 반영하고 중복은 첫 항목을 사용하며 정리 시 알림을 제거합니다. dismiss에서 State의 항목을 지울 수 있습니다. 명령형 알림은 shadcn.Sonner 또는 네이티브 Toaster를 toast 함수와 함께 사용합니다. 호스트에서 사용하는 토스터마다 고유한 toasterId를 지정하고 수명을 관리합니다.',
  ],
  spinner: [
    'Use Spinner for a pending indicator and supply an accessible label that explains what is loading.',
    '대기 상태 표시에 Spinner를 쓰고 무엇을 불러오는지 설명하는 접근 가능한 레이블을 제공합니다.',
  ],
  switch: [
    'Import switchSet from the switch subpath and use shadcn.Switch in the View. Project checked from State and use checkedChange to update it.',
    'switch 경로에서 switchSet을 가져오고 View에는 shadcn.Switch를 씁니다. State에서 checked를 읽고 checkedChange로 갱신합니다.',
  ],
  table: [
    'Build rows and cells under Header, Body, or Footer. Use DataTable for the provided sorting, filtering, paging, and selection behavior.',
    'Header, Body, Footer 아래에 행과 셀을 구성합니다. 정렬, 필터링, 페이지 이동, 선택 기능이 필요하면 DataTable을 사용합니다.',
  ],
  tabs: [
    'Place Trigger parts in List and give each a value that matches a Content part. Project Root value and handle valueChange for a controlled tab.',
    'List에 Trigger를 두고 각 value를 대응하는 Content의 값과 맞춥니다. 선택한 탭을 제어할 때는 Root의 value를 공급하고 valueChange를 처리합니다.',
  ],
  textarea: [
    'Use value and input for multiline editing. The input payload preserves the browser string, including line breaks.',
    '여러 줄 편집에는 value와 input을 사용합니다. input 페이로드에는 줄바꿈을 포함한 브라우저 문자열이 들어갑니다.',
  ],
  'toggle-group': [
    'Nest Item parts under Root. Match the Root value to type: a string for single and an array for multiple.',
    'Root 아래에 Item을 배치합니다. Root의 type에 맞춰 단일이면 문자열, 다중이면 배열을 value로 사용합니다.',
  ],
  toggle: [
    'Use pressed to supply the current state and pressedChange to receive user toggles.',
    'pressed로 현재 상태를 전달하고 pressedChange로 사용자가 전환한 값을 받습니다.',
  ],
  tooltip: [
    'Place Root under Provider and pair Trigger with Content. Give the trigger its own accessible name.',
    'Provider 아래에 Root를 두고 Trigger와 Content를 조합합니다. 트리거 자체에도 접근 가능한 이름을 제공합니다.',
  ],
  trace: [
    'Use Trace for a sequence of status lines, with Line status and its supporting text. Compose the steps in display order.',
    '상태 줄 목록을 표시할 때 Trace를 사용합니다. Line에 상태와 설명을 지정하고 표시 순서대로 배치합니다.',
  ],
  typography: [
    'The variant supplies the default semantic element as well as styling. Use as when you need to choose the element separately. Use text for plain text or default for child content.',
    'variant는 스타일과 기본 시맨틱 요소를 정합니다. 요소를 따로 선택하려면 as를 사용합니다. 일반 텍스트는 text에, 자식 콘텐츠는 기본 슬롯에 넣습니다.',
  ],
};

const recipeExamples = {
  'shadcn.Chart': ko => ({
    kind: 'bar',
    label: ko ? '주간 방문' : 'Weekly visits',
    x: 'day',
    data: [{ day: 'Mon', visits: 17 }, { day: 'Tue', visits: 23 }],
    series: [{ id: 'visits', key: 'visits', label: ko ? '방문 수' : 'Visits' }],
  }),
  'shadcn.Combobox': ko => ({
    value: 'seoul',
    options: [
      { value: 'seoul', label: ko ? '서울' : 'Seoul' },
      { value: 'busan', label: ko ? '부산' : 'Busan' },
    ],
  }),
  'shadcn.DataTable': ko => ({
    rowId: 'code',
    data: [{ code: 'weekly', report: ko ? '주간 보고서' : 'Weekly report', count: 17 }],
    columns: [
      { id: 'report', accessorKey: 'report', label: ko ? '보고서' : 'Report' },
      { id: 'count', accessorKey: 'count', label: ko ? '건수' : 'Count', sortable: true },
    ],
  }),
  'shadcn.DatePicker': ko => ({
    mode: 'range',
    range: { start: '2026-11-03', end: '2026-11-06' },
    min: '2026-11-01',
    max: '2026-11-30',
    locale: ko ? 'ko-KR' : 'en-US',
  }),
  'shadcn.Notifications': ko => ({
    notifications: [{ id: 'report', title: ko ? '보고서를 저장했습니다' : 'Report saved', kind: 'success' }],
  }),
  'shadcn.Typography': ko => ({ as: 'h2', variant: 'h3', text: ko ? '주간 요약' : 'Weekly summary' }),
};

function node(id, component, inputs, children) {
  return {
    id, componentRef: 'shadcn.' + component,
    ...(inputs && { inputs }),
    ...(children && { slots: { default: children } }),
  };
}

const familyExamples = {
  accordion: {
    result: ['Open “Shipping” to reveal the delivery estimate.', '‘배송’을 누르면 예상 배송 기간이 표시됩니다.'],
    render: ko => node('faq', 'Accordion.Root', { type: 'single' }, [
      node('shipping', 'Accordion.Item', { value: 'shipping' }, [
        node('question', 'Accordion.Trigger', { text: ko ? '배송' : 'Shipping' }),
        node('answer', 'Accordion.Content', { text: ko ? '영업일 기준 2일' : 'Two business days' }),
      ]),
    ]),
  },
  button: {
    result: ['The View renders a button labeled “Save” with the outline variant.', '외곽선 스타일의 ‘저장’ 버튼을 표시합니다.'],
    render: ko => node('save', 'Button', { text: ko ? '저장' : 'Save', variant: 'outline' }),
  },
  card: {
    result: ['The card shows “Weekly report” above its summary.', '카드에서 ‘주간 보고서’ 제목 아래에 요약을 표시합니다.'],
    render: ko => node('report', 'Card.Root', null, [
      node('header', 'Card.Header', null, [node('title', 'Card.Title', { text: ko ? '주간 보고서' : 'Weekly report' })]),
      node('summary', 'Card.Content', { text: ko ? '보고서 3건 완료' : 'Three reports completed' }),
    ]),
  },
  dialog: {
    result: ['Open the settings dialog with the trigger and close it with Escape.', '‘설정 열기’를 눌러 대화상자를 열고 Escape 키로 닫습니다.'],
    render: ko => node('settings', 'Dialog.Root', null, [
      node('open', 'Dialog.Trigger', { text: ko ? '설정 열기' : 'Open settings' }),
      node('content', 'Dialog.Content', null, [
        node('title', 'Dialog.Title', { text: ko ? '설정' : 'Settings' }),
        node('description', 'Dialog.Description', { text: ko ? '작업 공간의 환경설정입니다.' : 'Workspace preferences.' }),
      ]),
    ]),
  },
  input: {
    result: [
      'The textbox starts with “Ada” and accepts edits. To store edits in State, follow the [input binding example](../../guides/compose-json/#write-user-edits-to-state).',
      '입력란에 ‘Ada’가 표시되며 텍스트를 편집할 수 있습니다. 편집값을 State에 저장하는 방법은 [입력 연결 예제](../../guides/compose-json/#사용자-입력을-state에-기록)를 참고하세요.',
    ],
    render: ko => node('name', 'Input', { 'aria-label': ko ? '이름' : 'Name', value: 'Ada' }),
  },
  select: {
    result: ['The trigger starts with “Seoul”. Open it and choose “Busan” to update the selection.', '처음에는 ‘서울’이 표시됩니다. 목록을 열고 ‘부산’을 선택하면 표시가 바뀝니다.'],
    render: ko => {
      const items = [{ value: 'seoul', label: ko ? '서울' : 'Seoul' }, { value: 'busan', label: ko ? '부산' : 'Busan' }];
      return node('region', 'Select.Root', { type: 'single', value: 'seoul', items }, [
        node('trigger', 'Select.Trigger', { 'aria-label': ko ? '지역' : 'Region' }, [node('value', 'Select.Value')]),
        node('content', 'Select.Content', null, items.map(item => node(item.value, 'Select.Item', { ...item, text: item.label }))),
      ]);
    },
  },
  tabs: {
    result: ['“Summary” is selected first. Choose “Activity” to display its panel.', '처음에는 ‘요약’이 선택되어 있습니다. ‘활동’을 누르면 해당 패널이 표시됩니다.'],
    render: ko => node('report', 'Tabs.Root', { value: 'summary' }, [
      node('list', 'Tabs.List', null, [
        node('summary', 'Tabs.Trigger', { value: 'summary', text: ko ? '요약' : 'Summary' }),
        node('activity', 'Tabs.Trigger', { value: 'activity', text: ko ? '활동' : 'Activity' }),
      ]),
      node('summary-panel', 'Tabs.Content', { value: 'summary', text: ko ? '보고서 3건 완료' : 'Three reports completed' }),
      node('activity-panel', 'Tabs.Content', { value: 'activity', text: ko ? '오늘 보고서 1건 생성' : 'One report created today' }),
    ]),
  },
};

const objectInputs = {
  'shadcn.Chart.Container': {
    input: 'config', type: 'object',
    description: [
      'Key `config` by series ID. Each entry can provide a tooltip `label`, a single `color`, or a `theme` with both `light` and `dark` colors. The container exposes each color as `--color-<series ID>`. For example, `{"visits":{"label":"Visits","color":"var(--chart-1)"}}` exposes `--color-visits`. The native Tooltip reads the configuration when it resolves a series label.',
      '`config`의 키는 시리즈 ID입니다. 항목별로 툴팁 `label`과 함께 단일 `color` 또는 `light`와 `dark` 색을 모두 지정한 `theme`을 사용할 수 있습니다. 컨테이너는 색을 `--color-<시리즈 ID>`로 제공합니다. 예를 들어 `{"visits":{"label":"방문 수","color":"var(--chart-1)"}}`는 `--color-visits`를 만듭니다. 네이티브 Tooltip은 시리즈 레이블을 찾을 때 이 설정을 읽습니다.',
    ],
    fields: schema => [['config[key]', schema.additionalProperties]],
  },
  'shadcn.Questionnaire.Root': {
    input: 'items', type: 'Array<object>',
    description: [
      'List the steps in navigation order. Match each definition’s `name` to a rendered `Questionnaire.Item` and each choice’s `value` to a rendered `Questionnaire.Choice`. Keep `disabled` and `required` consistent with the rendered parts. An example definition is `{"name":"region","required":true,"choices":[{"value":"seoul"}]}`.',
      '이동 순서대로 단계를 나열합니다. 정의의 `name`은 렌더링한 `Questionnaire.Item`에, 선택지의 `value`는 렌더링한 `Questionnaire.Choice`에 대응합니다. `disabled`와 `required`도 렌더링한 부품과 맞춥니다. 예를 들어 `{"name":"region","required":true,"choices":[{"value":"seoul"}]}`처럼 정의합니다.',
    ],
    fields: schema => [['items[]', schema.items], ['items[].choices[]', schema.items.properties.choices.items]],
  },
  'shadcn.Sonner': {
    input: 'toastOptions', type: 'object',
    description: [
      '`toastOptions` sets shared defaults for toasts on this Toaster. `duration` is in milliseconds. Under `classes`, use CSS class strings keyed by toast region or kind. For example, `{"duration":5000,"classes":{"toast":"notice","title":"notice-title","success":"notice-success"}}` styles the toast wrapper, title, and success variant. Supplying `toastOptions` replaces the wrapper’s preset options.',
      '`toastOptions`는 이 Toaster에 표시하는 알림의 공통 기본값입니다. `duration`의 단위는 밀리초입니다. `classes`에는 알림 영역이나 종류를 키로, CSS 클래스 문자열을 값으로 지정합니다. 예를 들어 `{"duration":5000,"classes":{"toast":"notice","title":"notice-title","success":"notice-success"}}`로 알림 래퍼, 제목, 성공 유형을 꾸밉니다. `toastOptions`를 넘기면 래퍼에서 지정한 옵션을 대체합니다.',
    ],
    fields: schema => [['toastOptions', schema], ['toastOptions.classes', schema.properties.classes]],
  },
};

const contextParts = {
  Caption: ['Formats the current month or renders month and year selects. Pass the scoped month DateValue and a bound placeholder for navigation.', '현재 월을 서식화하거나 월·연도 선택기를 렌더링합니다. 이동에 사용할 월 DateValue와 바인딩한 placeholder를 넘깁니다.'],
  Cell: ['Wraps a day in the grid. Pass date and month as DateValue instances.', '격자의 날짜를 감쌉니다. date와 month를 DateValue 인스턴스로 넘깁니다.'],
  Day: ['Renders the day control using its enclosing Cell context.', '상위 Cell의 문맥을 사용해 날짜 컨트롤을 렌더링합니다.'],
  Grid: ['Wraps the grid for a month.', '월별 격자를 감쌉니다.'],
  GridBody: ['Wraps the week rows.', '주 단위 행을 감쌉니다.'],
  GridHead: ['Wraps the weekday header row.', '요일 헤더 행을 감쌉니다.'],
  GridRow: ['Wraps a week of cells or a row of weekday headings.', '일주일의 날짜 셀 또는 요일 제목 행을 감쌉니다.'],
  HeadCell: ['Displays a weekday heading inside GridHead and GridRow.', 'GridHead와 GridRow 안에서 요일을 표시합니다.'],
  Header: ['Wraps the month heading and caption.', '월 제목과 캡션을 감쌉니다.'],
  Heading: ['Reads the calendar context for its heading.', '달력 문맥에서 제목을 가져옵니다.'],
  Month: ['Wraps one month’s header and grid.', '한 달의 헤더와 격자를 감쌉니다.'],
  Months: ['Wraps the rendered months and navigation.', '렌더링할 월과 탐색 영역을 감쌉니다.'],
  MonthSelect: ['Displays the month selector. Pass the current month number as value.', '월 선택기를 표시합니다. value에 현재 월 번호를 넘깁니다.'],
  Nav: ['Wraps the next and previous month controls.', '이전·다음 달 이동 컨트롤을 감쌉니다.'],
  NextButton: ['Advances the calendar. The default variant is ghost.', '달력을 다음으로 이동합니다. 기본 variant는 ghost입니다.'],
  PrevButton: ['Moves the calendar backward. The default variant is ghost.', '달력을 이전으로 이동합니다. 기본 variant는 ghost입니다.'],
  YearSelect: ['Displays the year selector. Pass the year number as value.', '연도 선택기를 표시합니다. value에 연도 숫자를 넘깁니다.'],
  Tooltip: ['Requires both Chart.Container and LayerChart context. indicator defaults to dot. The formatter snippet receives value, name, item, index, and payload. The labelFormatter function receives the value and series payload array.', 'Chart.Container와 LayerChart 문맥이 모두 필요합니다. indicator 기본값은 dot입니다. formatter 스니펫은 value, name, item, index, payload를 받습니다. labelFormatter 함수에는 값과 시리즈 페이로드 배열을 전달합니다.'],
};

const variantHelpers = {
  alertVariants: ['variant'],
  attachmentVariants: ['size', 'orientation'],
  badgeVariants: ['variant'],
  bubbleReactionsVariants: ['side', 'align'],
  bubbleVariants: ['variant'],
  buttonGroupVariants: ['orientation'],
  buttonVariants: ['variant', 'size'],
  codeBlockLineVariants: ['variant'],
  codeBlockVariants: ['variant'],
  markerVariants: ['variant'],
  tabsListVariants: ['variant'],
  toggleVariants: ['variant', 'size'],
};

const helperDescriptions = {
  getPayloadConfigFromPayload: [
    'Looks up the matching ChartConfig entry for a native tooltip series and key. Takes config, payload, key, and optional row data. Returns the matched config entry or undefined.',
    '네이티브 툴팁의 시리즈와 키에 대응하는 ChartConfig 항목을 조회합니다. config, payload, key와 선택적 행 데이터를 받아 일치하는 항목 또는 undefined를 반환합니다.',
  ],
  useSidebar: [
    'Returns the nearest Sidebar Provider’s reactive state object. Read open, openMobile, isMobile, and state from the returned object. Call toggle(), setOpen(value), or setOpenMobile(value) to change the relevant state.',
    '가장 가까운 Sidebar Provider의 반응형 상태 객체를 반환합니다. 반환 객체에서 open, openMobile, isMobile, state를 읽습니다. toggle(), setOpen(value), setOpenMobile(value)로 상태를 변경합니다.',
  ],
  useMessageScroller: [
    'Returns scrollToEnd(options?), scrollToStart(options?), and scrollToMessage(id, options?) from the message scroller context. Each command returns a boolean.',
    '메시지 스크롤러 문맥에서 scrollToEnd(options?), scrollToStart(options?), scrollToMessage(id, options?)를 반환합니다. 각 명령은 불리언을 반환합니다.',
  ],
  useMessageScrollerScrollable: [
    'Returns the message scroller’s reactive scrollability state from context.',
    '문맥에서 메시지 스크롤러의 반응형 스크롤 가능 상태를 반환합니다.',
  ],
  useMessageScrollerVisibility: [
    'Returns the message scroller’s reactive visibility state from context.',
    '문맥에서 메시지 스크롤러의 반응형 가시성 상태를 반환합니다.',
  ],
};

const commonAttributes = new Set(
  'about accesskey autocapitalize autofocus autosave contenteditable contextmenu datatype dir draggable elementtiming enterkeyhint hidden inert inlist inputmode is itemid itemprop itemref itemscope itemtype lang part popover prefix property radiogroup resource results security slot spellcheck tabindex title translate typeof unselectable vocab writingsuggestions xmlns'.split(' '),
);
const secondaryAttributes = new Set(['color', 'role', 'style', 'data-invalid', 'data-disabled', 'data-icon']);
const spinnerInputs = new Set(['aria-label', 'class', 'color', 'height', 'id', 'name', 'role', 'stroke', 'width']);
const profiles = { attributes: new Map(), dom: new Map() };
const code = value => '\u0060' + String(value).replaceAll('|', '\\|') + '\u0060';
const codeList = values => values.map(code).join(', ');
const asAnchor = id => id.toLowerCase().replaceAll('.', '-');
const generated = '<!-- Generated by apps/docs/scripts/generate-ui-reference.mjs. -->';

function table(headers, rows) {
  return [
    '| ' + headers.join(' | ') + ' |',
    '| ' + headers.map(() => '---').join(' | ') + ' |',
    ...rows.map(row => '| ' + row.join(' | ') + ' |'),
  ].join('\n');
}

function unionText(values) {
  const boolean = values.includes('true') && values.includes('false');
  return [...new Set(values.map(value => boolean && ['true', 'false'].includes(value) ? 'boolean' : value))].join(' | ');
}

function schemaText(schema) {
  if (schema === true) return 'JSON';
  if (schema === false) return 'never';
  if (schema.anyOf) return unionText(schema.anyOf.map(schemaText));
  if (Object.hasOwn(schema, 'const')) return JSON.stringify(schema.const);
  if (schema.enum) return unionText(schema.enum.map(value => JSON.stringify(value)));
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  if (schema.type === 'array') {
    if (schema.prefixItems) return '[' + schema.prefixItems.map(schemaText).join(', ') + ']';
    return 'Array<' + schemaText(schema.items ?? true) + '>';
  }
  if (schema.type === 'object' && (schema.properties || typeof schema.additionalProperties === 'object')) {
    const fields = Object.entries(schema.properties ?? {}).map(([key, value]) =>
      key + (schema.required?.includes(key) ? '' : '?') + ': ' + schemaText(value));
    if (typeof schema.additionalProperties === 'object') fields.push('[key: string]: ' + schemaText(schema.additionalProperties));
    return '{ ' + fields.join(', ') + ' }';
  }
  return schema.type ?? 'JSON';
}

function qualifiers(schema, ko, path = '') {
  if (!schema || typeof schema !== 'object') return [];
  const result = [];
  const at = label => path ? code(path) + ' ' + label : label;
  const add = (key, label) => {
    if (schema[key] !== undefined) result.push(at(label + ' ' + schema[key]));
  };
  add('minimum', ko ? '최솟값' : 'minimum');
  add('maximum', ko ? '최댓값' : 'maximum');
  add('minItems', ko ? '최소 항목' : 'min items');
  add('maxItems', ko ? '최대 항목' : 'max items');
  if (schema.pattern) result.push(at((ko ? '패턴 ' : 'pattern ') + code(schema.pattern)));
  if (schema.not?.required) result.push(at((ko ? '함께 사용할 수 없는 필드 ' : 'mutually exclusive fields ') + codeList(schema.not.required)));
  if (schema.additionalProperties === false) result.push(at(ko ? '추가 필드 금지' : 'no extra fields'));
  const nested = [
    ...Object.entries(schema.properties ?? {}).flatMap(([name, field]) => qualifiers(field, ko, path ? path + '.' + name : name)),
    ...(schema.items ? qualifiers(schema.items, ko, path + '[]') : []),
    ...(schema.anyOf ?? []).flatMap(item => qualifiers(item, ko, path)),
    ...(typeof schema.additionalProperties === 'object' ? qualifiers(schema.additionalProperties, ko, path + '[key]') : []),
  ];
  return [...new Set([...result, ...nested])];
}

function profile(kind, data) {
  const key = JSON.stringify(data);
  if (!profiles[kind].has(key)) {
    const hash = createHash('sha256').update(key).digest('hex').slice(0, 10);
    profiles[kind].set(key, { id: kind + '-' + hash, data });
  }
  return profiles[kind].get(key);
}

function defaults(path) {
  const source = readFileSync(path, 'utf8');
  const ast = parse(source, { modern: true, filename: path });
  const values = {};
  for (const statement of ast.instance?.content.body ?? []) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const { id, init } of statement.declarations) {
      if (init?.callee?.name !== '$props' || id.type !== 'ObjectPattern') continue;
      for (const item of id.properties) {
        if (item.value?.type !== 'AssignmentPattern') continue;
        const value = item.value.right;
        const expr = value.callee?.name === '$bindable' ? value.arguments[0] : value;
        if (!expr) continue;
        try {
          const json = expr.type === 'Literal' ? expr.value : JSON.parse(source.slice(expr.start, expr.end));
          if (json === null || ['string', 'number', 'boolean'].includes(typeof json) || Array.isArray(json)) {
            values[item.key.name ?? item.key.value] = json;
          }
        } catch {
          // Dynamic defaults depend on runtime context and are documented separately.
        }
      }
    }
  }
  return values;
}

const pascal = slug => slug.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
const setName = slug => slug === 'switch' ? 'switchSet' : slug[0] + pascal(slug).slice(1);

function nativeExports(family) {
  const path = join(shadcn, 'vendor', family.slug, 'index.ts');
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest);
  const exported = file.statements.flatMap(statement => {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) return [];
    return statement.exportClause.elements.map(element => ({
      name: element.name.text, type: statement.isTypeOnly || element.isTypeOnly,
    }));
  });
  assert.deepEqual(exported.map(item => item.name).sort(), [
    ...family.componentExports.flatMap(item => item.runtimeExports),
    ...family.typeExports, ...family.helperRuntimeExports,
  ].sort(), path);
  assert.deepEqual(exported.filter(item => item.type).map(item => item.name).sort(), [...family.typeExports].sort(), path);
}

assert.equal(support.formatVersion, 1);
assert.equal(support.families, inventory.catalogItems.length);
assert.equal(support.upstreamComponents, inventory.counts.directSourceFamilyUniqueComponentExports);
assert.equal(support.components.length, support.upstreamComponents + support.recipes);
assert.equal(new Set(support.components.map(item => item.id)).size, support.components.length);
assert.deepEqual(Object.keys(notes).sort(), inventory.catalogItems.map(family => family.slug).sort());
assert.deepEqual(Object.keys(manifest.exports).sort(), [
  '.', './shadcn', './shadcn/styles.css', './shadcn/support.json',
  ...inventory.catalogItems.map(family => './shadcn/' + family.slug),
].sort());

const families = inventory.catalogItems.map((family, index) => {
  const { slug, title } = family;
  const path = join(shadcn, 'families', slug + '.ts');
  const source = readFileSync(path, 'utf8');
  const entries = support.components.filter(item => item.family === slug);
  const native = entries.filter(item => !item.recipe);
  if (native.length) nativeExports(family);
  const parts = new Map(family.componentExports.map(item => {
    const prefix = pascal(slug);
    const binding = item.binding.startsWith(prefix) && item.binding !== prefix
      ? item.binding.slice(prefix.length) : item.binding;
    const id = 'shadcn.' + prefix + (native.length === 1 ? '' : '.' + binding);
    return [id, item];
  }));
  assert.deepEqual([...parts.keys()].sort(), native.map(item => item.id).sort(), slug);
  assert.ok(source.includes('export const ' + setName(slug) + ': ComponentSet'), path);
  assert.deepEqual([...source.matchAll(/\{id:"([^"]+)",family:/g)].map(match => match[1]),
    entries.filter(item => item.mode === 'json').map(item => item.id), path);
  return { ...family, slug, title, index, entries: entries.map(item => {
    const nativePart = parts.get(item.id);
    const props = support.properties[item.propertiesRef];
    const callbacks = support.callbacks[item.callbacksRef];
    const unsupported = support.unsupported[item.unsupportedRef];
    assert.ok(props && callbacks && unsupported, item.id);
    const wrapper = nativePart
      ? join(shadcn, 'vendor', slug, nativePart.source)
      : join(shadcn, 'recipes', item.id.split('.').at(-1) + '.svelte');
    const propDefaults = item.mode === 'json' && (!nativePart || nativePart.source.startsWith('./')) ? defaults(wrapper) : {};
    const inputs = Object.entries(props);
    const shared = inputs.filter(([name, property]) =>
      (name.startsWith('aria-') && name !== 'aria-label' || commonAttributes.has(name)) &&
      !Object.hasOwn(propDefaults, name) && !property.required && !property.codec);
    const specific = inputs.filter(([name]) => !shared.some(([key]) => key === name));
    const secondary = specific.filter(([name, property]) =>
      !item.recipe && !Object.hasOwn(propDefaults, name) && !property.required && !property.codec &&
      (item.id === 'shadcn.Spinner' ? !spinnerInputs.has(name) : secondaryAttributes.has(name)));
    const dom = Object.keys(callbacks).filter(name => callbacks[name].codec === 'dom');
    return {
      ...item, nativePart, props, callbacks, unsupported,
      defaults: propDefaults,
      primary: specific.filter(([name]) => !secondary.some(([key]) => key === name)),
      secondary,
      shared: item.mode === 'json' && shared.length ? profile('attributes', shared) : undefined,
      dom: item.mode === 'json' && dom.length ? profile('dom', dom) : undefined,
    };
  }) };
});

const routes = {};
const catalogFile = join(root, 'apps/docs/src/examples/component-catalog.ts');
const catalogSource = '// Generated by scripts/generate-ui-reference.mjs.\n'
  + "import type { ComponentSet } from '@viewstem/svelte-ui';\n\n"
  + 'export const componentCatalog: Record<string, { set: string; load: () => Promise<ComponentSet> }> = {\n'
  + families.map(({ slug }) => `  '${slug}': { set: '${setName(slug)}', load: () => import('@viewstem/svelte-ui/shadcn/${slug}').then(module => module.${setName(slug)}) },`).join('\n')
  + '\n};\n\nexport const componentFamilies: Record<string, string> = '
  + JSON.stringify(Object.fromEntries(support.components.filter(item => item.mode === 'json').map(item => [item.id, item.family])), null, 2) + ';\n';
if (check) assert.equal(readFileSync(catalogFile, 'utf8'), catalogSource, 'Out of date: ' + catalogFile);
else writeFileSync(catalogFile, catalogSource);

function write(locale, route, title, description, order, body, navigation, packageName = 'svelte-ui') {
  const file = join(docs, locale, 'docs', packageName, route);
  const sidebar = navigation === 'hidden' ? '  hidden: true' : '  order: ' + order;
  const frontmatter = [
    '---',
    'title: ' + JSON.stringify(title),
    'description: ' + JSON.stringify(description),
    'sidebar:',
    sidebar,
    '---',
  ].join('\n');
  const content = [frontmatter, generated, ...body.filter(Boolean)].join('\n\n') + '\n';
  if (check) assert.equal(readFileSync(file, 'utf8'), content, 'Out of date: ' + file);
  else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

function propTable(entries, defaults, ko, { types = {}, fields = false, component } = {}) {
  const priority = ([name, value]) => value.required ? 0 : Object.hasOwn(defaults, name) ? 1 : 2;
  return table([fields ? (ko ? '필드' : 'Field') : (ko ? '입력' : 'Input'), ko ? 'JSON 타입' : 'JSON type', ko ? '세부 정보' : 'Details'],
    entries.toSorted((left, right) => priority(left) - priority(right) || left[0].localeCompare(right[0], 'en')).map(([name, value]) => {
      const anchor = component && asAnchor(component) + '-input-' + name.toLowerCase();
      const control = demoControls[ko ? 'ko' : 'en'].get(anchor);
      return [
      (control ? '<span id="' + anchor + '"></span> ' : '') + code(name), types[name] ?? code(schemaText(value.schema)),
      [
        value.required ? (ko ? '**필수**' : '**Required**') : '',
        Object.hasOwn(defaults, name) ? (ko ? '기본값 ' : 'Default ') + code(JSON.stringify(defaults[name])) : '',
        value.codec ? code(value.codec) : '',
        value.uncertain ? (ko ? '스키마가 형태를 제한하지 않음' : 'shape not restricted by the schema') : '',
        value.limitation ? (ko ? '직렬화할 수 있는 값만 지원' : 'serializable values only') : '',
        ...(Object.hasOwn(types, name) ? [] : qualifiers(value.schema, ko)),
        control ? control.description + ' <a data-demo-option-link href="#demo-option-' + control.id + '">' + (ko ? '직접 바꾸기' : 'Try this option') + '</a>' : '',
      ].filter(Boolean).join(' · '),
    ]; }));
}

function objectDoc(item, object, ko) {
  const schema = item.props[object.input].schema;
  const groups = object.fields(schema);
  const constraints = qualifiers(schema, ko);
  return [
    object.description[ko ? 1 : 0],
    '<details id="' + asAnchor(item.id) + '-' + object.input.toLowerCase() + '-fields">\n<summary>' +
      object.input + (ko ? ' 필드 보기' : ' fields') + '</summary>',
    ...groups.flatMap(([path, group], index) => {
      const nested = groups[index + 1]?.[0].split('.').at(-1);
      const types = nested ? { [nested.replace(/\[\]$/, '')]: code(nested.endsWith('[]') ? 'Array<object>' : 'object') } : {};
      const fields = Object.entries(group.properties).map(([name, schema]) => [name, {
        schema, required: group.required?.includes(name),
      }]);
      return ['**' + code(path) + '**', propTable(fields, {}, ko, { types, fields: true })];
    }),
    constraints.length ? (ko ? '제약 ' : 'Constraints ') + constraints.join(' · ') + '.' : '',
    '</details>',
  ];
}

function partDoc(item, ko) {
  const prefix = '../../attributes/#';
  const object = objectInputs[item.id];
  const types = object ? {
    [object.input]: code(object.type) + ' · [' + (ko ? '필드' : 'fields') + '](#' + asAnchor(item.id) + '-' + object.input.toLowerCase() + '-fields)',
  } : {};
  const lines = [
    '<a id="' + asAnchor(item.id) + '"></a>',
    '### ' + code(item.id),
  ];
  if (item.nativePart) lines.push((ko ? '네이티브 export는 ' : 'Native exports include ') + codeList(item.nativePart.runtimeExports.map(name => 'components.' + name)) + (ko ? '입니다.' : '.'));
  if (item.recipe) lines.push(ko ? 'JSON 조합입니다.' : 'This is a JSON composition.');
  if (item.primary.length) lines.push(propTable(item.primary, item.defaults, ko, { types, component: item.id }));
  if (object) lines.push(...objectDoc(item, object, ko));
  if (item.secondary.length || item.shared) {
    const svg = item.id === 'shadcn.Spinner';
    const label = ko ? (svg ? '추가 SVG·ARIA 입력' : '추가 HTML·ARIA 입력') : (svg ? 'Additional SVG and ARIA inputs' : 'Additional HTML and ARIA inputs');
    lines.push('<details>\n<summary>' + label + '</summary>');
    if (item.secondary.length) lines.push(propTable(item.secondary, item.defaults, ko, { component: item.id }));
    if (item.shared) lines.push(ko
      ? '[이 부품에 적용되는 공통 입력](' + prefix + item.shared.id + ')도 사용할 수 있습니다.'
      : 'This part also supports the [listed shared inputs](' + prefix + item.shared.id + ').');
    lines.push('</details>');
  }
  if (!item.primary.length && !item.secondary.length && !item.shared) lines.push(ko ? '입력 없음.' : 'No inputs.');
  lines.push(item.slots.length
    ? (ko ? '슬롯 ' : 'Slots ') + codeList(item.slots) + '.'
    : ko ? '슬롯 없음.' : 'No slots.');
  if (item.dom) lines.push(ko
    ? '[이 부품의 DOM 이벤트](' + prefix + item.dom.id + ')는 [직접 페이로드](../../support/#event-payloads)를 전달합니다.'
    : 'The [DOM events for this part](' + prefix + item.dom.id + ') use a [direct payload](../../support/#event-payloads).');
  const callbacks = Object.entries(item.callbacks).filter(([, value]) => value.codec !== 'dom');
  if (callbacks.length) lines.push(table(ko ? ['이벤트', '페이로드의 `value`', '코덱과 제약'] : ['Event', '`value` in payload', 'Codec and constraints'],
    callbacks.map(([name, value]) => [code(name), code(schemaText(value.schema)), [value.codec ? code(value.codec) : '', ...qualifiers(value.schema, ko)].filter(Boolean).join(', ') || '—'])));
  if (!item.dom && !callbacks.length) lines.push(ko ? '이벤트 없음.' : 'No events.');
  const limitations = Object.entries(item.unsupported)
    .filter(([name, reason]) => name !== 'ref' && !name.startsWith('bind:') && !['legacy/capture listener', 'DOM event outside policy'].includes(reason));
  if (limitations.length) lines.push((ko ? '네이티브에서 사용하는 기능 또는 JSON에서 별도 이벤트로 매핑되는 prop ' :
    'Props that need native code or are mapped to a different JSON event ') + codeList(limitations.map(([name]) => name)) + '.');
  if (item.recipe) {
    const example = recipeExamples[item.id];
    assert.ok(example, item.id);
    const view = { render: { id: 'example', componentRef: item.id, inputs: example(ko) } };
    lines.push(ko ? '#### View 예제' : '#### Example View', '```json\n' + JSON.stringify(view, null, 2) + '\n```');
  }
  return lines;
}

function familyDoc(family, locale) {
  const ko = locale === 'ko';
  const { slug, title, index, entries, helperRuntimeExports, typeExports } = family;
  const importPath = '@viewstem/svelte-ui/shadcn/' + slug;
  const json = entries.filter(item => item.mode === 'json');
  const nativeOnly = entries.filter(item => item.mode === 'native-context');
  const hasNative = entries.some(item => item.nativePart);
  const example = familyExamples[slug];
  const lines = [
    notes[slug][ko ? 1 : 0],
    ko ? '## 사용법' : '## Usage',
    '```ts\nimport { ' + setName(slug) + (hasNative ? ', components' : '') + (slug === 'sonner' ? ', toast' : '') +
      " } from '" + importPath + "';\n```",
    ko ? '세트 ID는 ' + code('shadcn/' + slug) + '이며 JSON에서 사용할 수 있는 컴포넌트가 ' + json.length + '개입니다. [세트 등록 방법](../../registration/)을 참고하세요.' :
      'The set ID is ' + code('shadcn/' + slug) + '. It [registers](../../registration/) ' + json.length +
        ' component' + (json.length === 1 ? '' : 's') + ' for use in JSON.',
  ];
  if (example) lines.push(
    ko ? '### View 예제' : '### Example View',
    ko ? code(setName(slug)) + ' 세트를 등록한 뒤 이 JSON을 `renderer.mount`의 `view`에 전달합니다.' :
      'Register the ' + code(setName(slug)) + ' set and pass this JSON as `view` to `renderer.mount`.',
    '```json\n' + JSON.stringify({ render: example.render(ko) }, null, 2) + '\n```',
    example.result[ko ? 1 : 0],
  );
  lines.push(ko
    ? '## JSON 레퍼런스' : '## JSON reference',
  ko
    ? '**필수** 표시가 없는 입력은 생략할 수 있으며, 타입에서 `?`는 생략 가능한 객체 필드를 뜻합니다. **기본값**은 Svelte 래퍼에 리터럴로 선언된 값입니다. 표에서 기본값을 명시하지 않은 입력은 기저 컴포넌트나 브라우저 또는 다른 입력에 따라 값이 정해질 수 있습니다.'
    : 'Inputs without **Required** are optional. In a type, `?` marks an optional object field. **Default** shows a literal default declared by the Svelte wrapper. Other defaults are unspecified here and may come from the underlying component, the browser, or other inputs.');
  for (const item of json) lines.push(...partDoc(item, ko));
  if (nativeOnly.length) lines.push(
    '<a id="native-context"></a>',
    ko ? '## 네이티브 문맥이 필요한 부품' : '## Parts that require native context',
    ko ? 'Svelte에서 아래 export를 사용합니다. 이 부품은 세트에 JSON 어댑터로 등록되지 않습니다.' :
      'Use these exports in Svelte. This set provides them as native components without JSON adapter registration.',
    table(ko ? ['카탈로그 부품', '네이티브 export', '사용법'] : ['Catalog part', 'Native exports', 'Usage'],
      nativeOnly.map(item => {
        const part = item.id.split('.').at(-1);
        return [code(part), codeList(item.nativePart.runtimeExports.map(name => 'components.' + name)), contextParts[part][ko ? 1 : 0]];
      })),
  );
  if (hasNative) {
    lines.push(ko ? '## 네이티브 타입과 조합' : '## Native types and composition');
    lines.push(ko
      ? 'Svelte에서는 `ComponentProps<typeof components.' + entries.find(item => item.nativePart).nativePart.runtimeExports[0] + '>`로 실제 prop 타입을 가져올 수 있습니다. 스니펫, 함수 prop, DOM 참조와 바인딩은 각 네이티브 타입을 따릅니다.'
      : 'In Svelte, use `ComponentProps<typeof components.' + entries.find(item => item.nativePart).nativePart.runtimeExports[0] + '>` for the native prop type. Snippets, function props, DOM refs, and bindings follow the native types.');
    if (typeExports.length) lines.push((ko ? '네임스페이스의 타입 export ' : 'Namespace type exports ') + codeList(typeExports.map(name => 'components.' + name)) + '.');
    for (const name of helperRuntimeExports) {
      if (variantHelpers[name]) lines.push('- ' + code('components.' + name) + (ko
        ? '는 ' + codeList(variantHelpers[name]) + ' 선택값과 필요에 따라 추가 클래스를 받아 CSS 클래스 문자열을 반환합니다.'
        : ' takes options ' + codeList(variantHelpers[name]) + ' and optional additional classes, and returns a CSS class string.'));
      else {
        assert.ok(helperDescriptions[name], name);
        lines.push('- ' + code('components.' + name) + ' · ' + helperDescriptions[name][ko ? 1 : 0]);
      }
    }
  }
  if (slug === 'sonner') lines.push(
    '## `toast`',
    ko ? '패밀리 진입점에서 가져옵니다. `toast(message, options?)`는 문자열 또는 Svelte 컴포넌트를 표시하고 문자열 또는 숫자 ID를 반환합니다. `toasterId` 옵션을 표시할 Toaster의 ID와 맞춥니다.' :
      'Import this helper from the family entry point. `toast(message, options?)` displays a string or Svelte component and returns its string or numeric ID. Match the `toasterId` option to the ID of the Toaster that should display it.',
    ko ? '주요 옵션으로 알림 ID인 `id`, 설명인 `description`, 밀리초 단위 `duration`, 닫기 버튼을 표시하는 `closeButton`이 있습니다. 같은 ID로 호출하면 해당 알림을 갱신합니다. 타입스크립트에서 전체 옵션 타입은 `Parameters<typeof toast>[1]`로 확인할 수 있습니다.' :
      'Common options include `id`, `description`, `duration` in milliseconds, and `closeButton`. Calling with the same ID updates that notification. In TypeScript, use `Parameters<typeof toast>[1]` to inspect all options.',
    ko ? '함수에는 `success`, `info`, `warning`, `error`, `loading`, `message`, `custom`, `promise`, `dismiss`, `getActiveToasts` 메서드가 있습니다. `dismiss(id)`로 특정 알림을 닫습니다. 별도로 설치한 `svelte-sonner`의 전역 저장소와는 독립적인 저장소를 사용합니다.' :
      'The function also exposes `success`, `info`, `warning`, `error`, `loading`, `message`, `custom`, `promise`, `dismiss`, and `getActiveToasts`. Call `dismiss(id)` to dismiss one notification. This helper uses a store separate from the global store of a separately installed `svelte-sonner`.',
    '```ts\nimport { toast } from "@viewstem/svelte-ui/shadcn/sonner";\n\nconst id = toast.success("' + (ko ? '저장됨' : 'Saved') + '", { toasterId: "workspace" });\ntoast.dismiss(id);\n```',
  );
  write(locale, 'components/' + slug + '.md', title, ko
    ? title + ' 세트와 각 부품의 JSON 입력, 이벤트, 슬롯, 네이티브 export입니다.'
    : 'Reference for the ' + title + ' set and its JSON inputs, events, slots, and native exports.', index + 1, lines);
}

for (const locale of ['', 'ko']) {
  const ko = locale === 'ko';
  for (const family of families) familyDoc(family, locale);
  const rows = families.map(({ title, slug, entries }) => [
    '[' + title + '](../components/' + slug + '/)',
    code('/shadcn/' + slug), code(setName(slug)),
    String(entries.filter(item => item.mode === 'json').length),
    String(entries.filter(item => item.mode === 'native-context').length),
  ]);
  write(locale, 'component-sets/index.md', ko ? '컴포넌트 세트' : 'Component sets', ko
    ? '모든 shadcn 패밀리의 import 경로와 컴포넌트 레퍼런스입니다.'
    : 'Import paths and component references for all shadcn families.', 5, [
    ko ? '## 전체 세트' : '## Full set',
    '```ts\nimport { shadcn } from "@viewstem/svelte-ui/shadcn";\nimport type { ComponentSet } from "@viewstem/svelte-ui";\n\nconst sets: readonly ComponentSet[] = shadcn;\n```',
    ko
      ? '이 진입점은 전체 패밀리를 담은 읽기 전용 `shadcn` 배열을 export합니다. [등록 API](../registration/)에 이 배열을 그대로 넘길 수 있습니다. 필요한 패밀리만 가져오려면 아래 경로를 사용하세요.'
      : 'This entry point exports the readonly `shadcn` array containing every family. Pass it directly to the [registration API](../registration/). Use the paths below to import selected families.',
    ko ? '## 패밀리별 레퍼런스' : '## Family reference',
    ko
      ? '아래 import 경로는 `@viewstem/svelte-ui` 뒤에 붙입니다. 각 페이지에서 JSON ID, 타입, 기본값, 이벤트, 슬롯, 네이티브 export를 찾을 수 있습니다. 네이티브 전용 수는 Svelte 문맥이 필요해 JSON ID로 등록되지 않는 부품의 수입니다.'
      : 'Append each import path to `@viewstem/svelte-ui`. Each page lists JSON IDs, types, defaults, events, slots, and native exports. The native-only count covers parts that require Svelte context and have no JSON registration.',
    table(ko ? ['패밀리', 'import 경로', '세트 export', 'JSON ID', '네이티브 전용'] :
      ['Family', 'Import path', 'Set export', 'JSON IDs', 'Native-only'], rows),
  ]);
  write(locale, 'attributes/index.md', ko ? 'HTML·ARIA 입력과 DOM 이벤트' : 'HTML, ARIA, and DOM events', ko
    ? '패밀리 레퍼런스에서 연결하는 공통 입력 및 DOM 이벤트 목록입니다.'
    : 'Shared input and DOM event groups linked from individual components.', 7, [
    ko
      ? '부품별 페이지가 이 문서의 적용 가능한 입력 또는 이벤트 목록에 연결합니다. 각 이름은 명시된 목록에 속한 부품에서 사용할 수 있습니다.'
      : 'Each component reference links to the input or event group it accepts. Use a name from the group linked by that component.',
    ...(Object.entries(profiles).flatMap(([kind, values]) => [
      kind === 'dom' ? (ko ? '## DOM 이벤트 그룹' : '## DOM event groups') : (ko ? '## 입력 그룹' : '## Input groups'),
      ...[...values.values()].flatMap(({ id, data }, index) => [
        '<a id="' + id + '"></a>',
        '### ' + (ko ? '그룹 ' : 'Group ') + (index + 1),
        kind === 'dom' ? codeList(data) :
          table(ko ? ['입력', 'JSON 타입'] : ['Inputs', 'JSON type'], [...Map.groupBy(data, ([, value]) => schemaText(value.schema))]
            .map(([schema, entries]) => [codeList(entries.map(([name]) => name)), code(schema)])),
      ]),
    ])),
    ko ? 'DOM 구조는 [이벤트 페이로드](../support/#event-payloads)를 참고하세요.' :
      'See [event payloads](../support/#event-payloads) for the DOM payload shape.',
  ], 'hidden');
  const directory = join(docs, locale, 'docs/svelte-ui/components');
  assert.deepEqual(readdirSync(directory).sort(), families.map(family => family.slug + '.md').sort(), 'Unexpected family pages');
  routes[locale || 'en'] = {
    '.': '/docs/svelte-ui/registration/',
    './shadcn': '/docs/svelte-ui/component-sets/',
    './shadcn/styles.css': '/docs/svelte-ui/support/#stylesheet',
    './shadcn/support.json': '/docs/svelte-ui/support/',
    ...Object.fromEntries(families.map(family => ['./shadcn/' + family.slug, '/docs/svelte-ui/components/' + family.slug + '/'])),
  };
  if (ko) routes.ko = Object.fromEntries(Object.entries(routes.ko).map(([key, path]) => [key, '/ko' + path]));
}

if (coveragePath) writeFileSync(coveragePath, JSON.stringify({
  package: manifest.name,
  exportPaths: routes,
  rootSymbols: {
    registerComponents: { en: routes.en['.'], ko: routes.ko['.'] },
    ComponentSet: { en: routes.en['.'], ko: routes.ko['.'] },
  },
  families: families.map(({ slug, entries, typeExports, helperRuntimeExports }) => ({
    slug,
    set: setName(slug),
    en: routes.en['./shadcn/' + slug],
    ko: routes.ko['./shadcn/' + slug],
    json: entries.filter(item => item.mode === 'json').map(item => item.id),
    nativeOnly: entries.filter(item => item.mode === 'native-context').map(item => item.id),
    nativeExports: entries.flatMap(item => item.nativePart?.runtimeExports ?? []),
    nativeTypeExports: typeExports,
    nativeHelperExports: helperRuntimeExports,
    extraExports: slug === 'sonner' ? ['toast'] : [],
  })),
}, null, 2) + '\n');

// The DOM reference describes the DOM contract, rather than Svelte native exports.
assert.equal(new Set(domSupport.map(item => item.family)).size, families.length);
assert.deepEqual(domSupport.map(item => item.id).sort(), support.components.filter(item => item.mode === 'json').map(item => item.id).sort());
for (const locale of ['', 'ko']) {
  const ko = locale === 'ko';
  for (const { slug, title, index } of families) {
    const entries = domSupport.filter(item => item.family === slug);
    const demo = getComponentDemo(slug, ko ? 'ko' : 'en');
    const lines = [
      ko
        ? '위 미리보기는 기존 Svelte UI 예제 JSON을 그대로 받아 `@viewstem/ui`의 DOM 렌더러로 실행합니다. 입력 변경, 이벤트에 연결한 Action, State 갱신을 직접 조작할 수 있습니다. **앱에서 실행하기**에는 이 예제의 전체 연결 코드가 있습니다.'
        : 'The preview runs the existing Svelte UI example JSON unchanged through the `@viewstem/ui` DOM renderer. Try input changes, event Actions, and State updates. **Run in your app** includes the complete setup for this example.',
      ko ? '## 등록과 실행' : '## Registration and rendering',
      '```ts\nimport { createRegistry, createRuntime } from "@viewstem/core";\nimport { registerShadcn, attach } from "@viewstem/ui";\nimport "@viewstem/ui/styles.css";\n\nconst registry = createRegistry();\nregisterShadcn(registry);\nconst runtime = createRuntime({ registry });\n```',
      ko
        ? '`registerShadcn`은 66개 계열을 한 번에 등록합니다. [브라우저 마운트 가이드](../../guides/mount-in-browser/)에서 View 생성과 정리 방법을 확인하세요. 같은 계열의 [Svelte UI 레퍼런스](../../../svelte-ui/components/' + slug + '/)도 볼 수 있습니다.'
        : '`registerShadcn` registers all 66 families. See the [browser mount guide](../../guides/mount-in-browser/) for View creation and disposal, or open the matching [Svelte UI reference](../../../svelte-ui/components/' + slug + '/).',
      ko ? '## JSON 컴포넌트' : '## JSON components',
      ko
        ? '아래 표는 `@viewstem/ui/support.json`의 입력·슬롯·이벤트 계약입니다. 생략한 입력에는 렌더러 기본 동작이 적용됩니다. 이벤트는 DOM Event 객체 대신 아래 스키마에 맞는 JSON 페이로드를 전달합니다. Svelte 네이티브 export와 문맥 전용 부품은 이 패키지의 API가 아닙니다.'
        : 'These tables describe inputs, slots, and events from `@viewstem/ui/support.json`. Omitted inputs use renderer defaults. Events deliver JSON payloads matching these schemas rather than DOM Event objects. Svelte native exports and context-only parts are outside this package API.',
      ...entries.flatMap(item => {
        const inputs = Object.entries(item.ports);
        const shared = inputs.filter(([name]) => name.startsWith('aria-') || commonAttributes.has(name) || secondaryAttributes.has(name));
        const primary = inputs.filter(([name]) => !shared.some(([key]) => key === name));
        const events = [...Map.groupBy(Object.entries(item.events), ([, event]) => JSON.stringify(event.schema))];
        return [
          '### ' + code(item.id),
          primary.length ? propTable(primary, {}, ko, { component: item.id }) : (ko ? '고유 입력이 없습니다.' : 'No component-specific inputs.'),
          ...(shared.length ? ['<details>\n<summary>' + (ko ? 'HTML·ARIA 입력' : 'HTML and ARIA inputs') + '</summary>', propTable(shared, {}, ko, { component: item.id }), '</details>'] : []),
          '**' + (ko ? '슬롯' : 'Slots') + '**',
          Object.keys(item.slots).length ? table(ko ? ['이름', '필수'] : ['Name', 'Required'], Object.entries(item.slots).map(([name, slot]) => [code(name), slot.required ? (ko ? '예' : 'Yes') : (ko ? '아니요' : 'No')])) : (ko ? '없음.' : 'None.'),
          '**' + (ko ? '이벤트와 페이로드' : 'Events and payloads') + '**',
          events.length ? table(ko ? ['이벤트', 'JSON 페이로드', '제약'] : ['Events', 'JSON payload', 'Constraints'], events.map(([, group]) => [codeList(group.map(([name]) => name)), code(schemaText(group[0][1].schema)), qualifiers(group[0][1].schema, ko).join(' · ')])) : (ko ? '없음.' : 'None.'),
        ];
      }),
    ];
    write(locale, 'components/' + slug + '.md', title, demo.description, index + 1, lines, undefined, 'ui');
  }
  write(locale, 'components.md', ko ? '컴포넌트와 JSON 지원' : 'Components and JSON support', ko ? '66개 계열의 DOM 미리보기와 입력, 이벤트, 슬롯 레퍼런스입니다.' : 'DOM previews and input, event, and slot references for all 66 families.', 4, [
    ko
      ? '`@viewstem/ui`는 **66개 계열과 ' + domSupport.length + '개 JSON Component ID**를 등록합니다. 각 상세 페이지에서 기존 예제 JSON을 `@viewstem/ui`로 직접 실행하고, 옵션과 State를 바꿔볼 수 있습니다.'
      : '`@viewstem/ui` registers **66 families and ' + domSupport.length + ' JSON Component IDs**. Each detail page runs the existing example JSON directly with `@viewstem/ui`, including editable options and State interactions.',
    ko ? '## 전체 컴포넌트' : '## All components',
    table(ko ? ['컴포넌트', 'JSON ID 수'] : ['Component', 'JSON IDs'], families.map(({ slug, title }) => ['[' + title + '](./' + slug + '/)', String(domSupport.filter(item => item.family === slug).length)])),
    ko ? '## 지원 메타데이터' : '## Support metadata',
    '```js\nimport support from "@viewstem/ui/support.json" with { type: "json" };\n\nconst button = support.find(component => component.id === "shadcn.Button");\nconsole.log(button.ports, button.slots, button.events);\n```',
    ko
      ? '입력 스키마는 `ports`, 이름 있는 슬롯은 `slots`, 이벤트별 페이로드 스키마는 `events`에서 확인합니다. [마운트 가이드](../guides/mount-in-browser/)와 [등록 API](../api/)도 참고하세요.'
      : 'Use `ports` for input schemas, `slots` for named slots, and `events` for event payload schemas. See the [mount guide](../guides/mount-in-browser/) and [registration API](../api/).',
  ], undefined, 'ui');
  assert.deepEqual(readdirSync(join(docs, locale, 'docs/ui/components')).sort(), families.map(family => family.slug + '.md').sort(), 'Unexpected DOM family pages');
}

console.log((check ? 'Verified' : 'Generated') + ' ' + families.length + ' family references for both UI packages in each locale.');
