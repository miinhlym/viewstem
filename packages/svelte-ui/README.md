# @viewstem/svelte-ui

Svelte 5용 Viewstem UI 묶음입니다. 고정된 shadcn-svelte 카탈로그 66개 컴포넌트군을 제공합니다. `@viewstem/svelte`에는 기본 UI를 자동 등록하지 않습니다.

```ts
import { createRenderer } from '@viewstem/svelte';
import { registerComponents } from '@viewstem/svelte-ui';
import { shadcn } from '@viewstem/svelte-ui/shadcn';
import '@viewstem/svelte-ui/shadcn/styles.css';

const renderer = createRenderer();
registerComponents(renderer, shadcn);
const mounted = await renderer.mount({
  target: document.querySelector('#app')!,
  view: { render: { id: 'save', componentRef: 'shadcn.Button', inputs: { text: '저장', variant: 'outline' } } },
});
await mounted.initialComplete;
// 화면 소유자가 닫힐 때:
await mounted.dispose();
await renderer.dispose();
```

필요한 컴포넌트군만 등록할 수도 있습니다. 등록 시 계약과 Svelte 구현을 함께 검증하며, 충돌·잘못된 계약·폐기된 renderer에서는 부분 등록을 남기지 않습니다. 동일 묶음을 두 번 등록하면 충돌 오류입니다.

```ts
import { registerComponents } from '@viewstem/svelte-ui';
import { button } from '@viewstem/svelte-ui/shadcn/button';
import { dialog } from '@viewstem/svelte-ui/shadcn/dialog';
registerComponents(renderer, [button, dialog]);
```

공개 API는 루트의 `registerComponents(renderer, sets)`와 `ComponentSet` 타입, `/shadcn`의 `shadcn`, 66개 family subpath의 명시적 묶음입니다. 묶음 이름은 slug의 camelCase이며 예약어인 switch만 `switchSet`입니다. 직접 원본을 가진 family는 `components` namespace도 내보냅니다. `/shadcn/sonner`는 같은 private Sonner 런타임의 `toast`도 제공합니다. 내부 adapter·vendor 경로는 공개 export가 아닙니다.

## JSON 입력·슬롯·이벤트

단일 부품은 `shadcn.Button`, 복합 부품은 `shadcn.Dialog.Root`, `shadcn.Dialog.Trigger`와 같은 ID를 사용합니다. JSON으로 사용할 수 있는 원본 부품은 351개이며, 추가 조합 6개는 `shadcn.Combobox`, `DatePicker`, `DataTable`, `Typography`, `Chart`, `Notifications`입니다. 전체 묶음은 이 357개 계약과 구현을 등록합니다.

`inputs`는 공개 schema를 통과한 값만 native props로 전달합니다. 텍스트는 `inputs.text`, 자식은 `slots.default`로 넣고 자식이 있으면 text보다 우선합니다. 비어 있는 슬롯은 upstream의 기본 아이콘·선택값·placeholder를 가리지 않습니다. 지원하지 않는 입력이나 이벤트는 core가 거절합니다.

DOM 이벤트는 `click`, `input`, `change`, `keyDown` 등이며 payload는 `{ type, value?, checked?, key?, code?, button?, buttons?, altKey?, ctrlKey?, metaKey?, shiftKey? }`입니다. input의 `value`는 DOM 문자열입니다. 숫자로 쓰려면 Action 입력에서 변환합니다. native 값 변경 callback은 `valueChange`, `checkedChange`, `openChange`처럼 노출하고 payload는 `{ value: ... }`입니다. submit은 페이지 이동을 막고 Action으로 전달합니다. 한글 조합 중 임시 값은 입력 안에 유지하고 확정 후 전달합니다.

`NativeSelect.Root`의 `multiple` 입력과 배열 `value`는 표시·외부 제어에 사용할 수 있지만, DOM `change.value`는 브라우저의 첫 선택 문자열입니다. JSON 이벤트로 다중 선택 배열을 왕복하려면 `Select.Root`의 `type: "multiple"`과 `valueChange`를 사용합니다. 닫힌 Select의 선택값을 외부에서 변경할 때도 label이 필요하면 `Root.items`에 value/label 목록을 제공합니다.

Command 항목의 `value`가 표시명과 다른 식별자라면 검색할 표시명을 `keywords`에 제공합니다. 예를 들어 `{ "value": "settings", "text": "환경 설정", "keywords": ["환경 설정"] }`은 한국어로 검색하면서 State에는 `settings`를 전달합니다.

예를 들어 Input의 변경을 State에 쓰는 JSON은 다음과 같습니다.

```json
{
  "states": { "name": { "kind": "State", "schema": { "type": "string" }, "initial": "" } },
  "render": {
    "id": "name", "componentRef": "shadcn.Input",
    "inputs": { "value": { "@path": "/states/name" }, "aria-label": "이름" },
    "on": {
      "input": {
        "action": {
          "ports": {
            "target": { "kind": "State", "schema": { "type": "string" }, "required": true },
            "next": { "kind": "Value", "schema": { "type": "string" }, "required": true }
          },
          "steps": [{ "kind": "SetState", "target": { "@path": "/ports/target" }, "value": { "@path": "/ports/next" } }]
        },
        "inputs": { "target": { "@path": "/states/name" }, "next": { "@path": "/event/value" } }
      }
    }
  }
}
```

Trigger의 `slots.child`에는 이 묶음의 DOM 부품 하나를 넣습니다. props·이벤트·Svelte attachment를 해당 부품에 전달하며 wrapper나 중첩 button을 만들지 않습니다. 여러 자식이나 임의의 composite/host adapter를 자동으로 DOM trigger로 변환하지 않습니다. 자유로운 Svelte 합성은 아래 namespace를 사용합니다.

## 원본 조합과 지원표

386개 원본 부품 모두 native Svelte export를 제공합니다. Calendar·RangeCalendar의 각 하위 부품 17개와 Chart.Tooltip은 scoped snippet/LayerChart 문맥이 필요해 **JSON ID로 등록하지 않는 35개**입니다. 해당 부품은 공개 `components` namespace로 host Svelte 안에서 조합합니다. Calendar.Root와 RangeCalendar.Root의 JSON 어댑터는 내부 날짜 UI 전체를 표시합니다. host 코드에서 DateValue를 직접 만들 때는 `@internationalized/date`를 앱의 직접 의존성으로 선언합니다.

```svelte
<script lang="ts">
  import { components as Calendar } from '@viewstem/svelte-ui/shadcn/calendar';
  import { parseDate } from '@internationalized/date';
</script>
<Calendar.Root type="single" value={parseDate('2026-11-03')} />
```

전체 native 문맥 조합 예제는 [RawComposition.svelte](test/fixtures/RawComposition.svelte), 66개 JSON 예제는 [samples.mjs](test/fixtures/samples.mjs)에 있습니다. 함수 props, DOM ref, FileList, scoped formatter/cell snippet, Svelte `bind:` 등은 host 코드에서 사용합니다. JSON에 함수나 DOM 객체를 직렬화하는 문법은 추가하지 않습니다.

```ts
import support from '@viewstem/svelte-ui/shadcn/support.json' with { type: 'json' };
const entry = support.components.find(component => component.id === 'shadcn.Button')!;
const inputs = Reflect.get(support.properties, entry.propertiesRef);
const events = Reflect.get(support.callbacks, entry.callbacksRef);
const hostOnly = Reflect.get(support.unsupported, entry.unsupportedRef);
```

지원표는 원본 commit, 부품별 `json`/`native-context`, 모든 입력 schema·필수값·변환 codec, callback schema, 슬롯, host 전용 사유를 제공합니다. 중복되는 schema 집합은 참조 키로 묶습니다. callback schema는 인자 값이며 `codec: "dom"`인 이벤트만 payload 자체, 나머지는 `{ value: 인자 }`로 전달됩니다.

## 조합 컴포넌트의 범위

| 조합 | JSON 계약 |
|---|---|
| Combobox | 문자열 value, `{value,label,disabled?}` options, 검색·선택, `valueChange` |
| DatePicker | date-only ISO 문자열 또는 null, `{start,end}` 범위, locale·min/max·disabled, `valueChange`/`rangeChange`. native Calendar 날짜도 같은 문자열 codec 사용 |
| DataTable | 실제 TanStack Table. JSON columns와 data, 정렬·필터·페이지·행 선택 제어값과 이벤트. rowId는 고유한 비어 있지 않은 문자열, 표시 셀은 문자열·숫자·boolean. custom cell은 host 코드 |
| Chart | 실제 LayerChart의 line/area/bar/pie. x는 고유 문자열/유한 숫자, series는 고유 id·key, y는 유한 숫자 또는 명시적 null. pie는 비음수 series 하나. 색상은 hex·CSS 이름·`var(--chart-1)`~5. 잘못된 데이터는 오류 표시. ECharts/Canvas 선택 차트 계약 완료를 뜻하지 않음 |
| Notifications | 실제 Sonner. ID별 알림 생성·갱신·삭제, 중복 ID는 첫 항목 사용, dismiss 이벤트는 `{value:{id,reason}}`. 인스턴스별 격리, unmount 시 해당 알림·timer 정리 |
| Typography | heading·paragraph·blockquote·code 등의 의미 있는 요소와 variant. 문자열은 HTML로 실행하지 않음 |

DataTable은 데이터나 필터가 바뀌어 `pageIndex`가 전체 페이지를 벗어나면 마지막 유효 페이지를 표시합니다. 입력 State를 자동으로 덮어쓰지 않으며 다음 사용자 페이지 이동은 실제 표시 페이지에서 계산합니다. `selectedIds`도 호스트가 소유하므로 목록에서 사라진 ID를 자동 삭제하지 않습니다.

알림을 코드 Action에서 호출하려면 `/shadcn/sonner`의 `toast`를 사용합니다. 외부 `svelte-sonner`의 전역 toast와는 저장소가 다릅니다. 여러 renderer의 알림을 자동 격리하려면 JSON `Notifications`를 사용하고, raw `Sonner`와 `toast`를 쓰는 host는 toasterId와 cleanup을 소유합니다.

## 스타일·환경·재현

Nova·neutral·Lucide 한 조합을 고정했습니다. CSS는 사전 빌드하며 호스트에 Tailwind 설정이 없어도 동작합니다. 선택 import는 JS 번들을 줄이며 npm 설치 의존성은 패키지 전체가 공유합니다. 전체 CSS를 공유하므로 family import가 CSS를 부품별로 나누지는 않습니다. 임의 Tailwind class의 CSS를 런타임에 생성하지 않으므로 호스트 CSS 또는 호스트 Tailwind 빌드를 사용합니다.

CSS는 `data-viewstem-shadcn` 영역에 적용하고 호스트의 전역 reset을 추가하지 않습니다. `html.dark` 또는 `data-theme="dark"`로 전환하며, `--viewstem-primary` 같은 변수로 색상을 조절합니다. body portal도 같은 테마를 쓰려면 html/body에 theme와 변수를 두세요. 특정 subtree의 theme가 body portal로 자동 이동하지 않습니다.

Node 22/24, Svelte 5.57.3, 브라우저 클라이언트와 TypeScript Bundler 해석을 검증합니다. SSR/hydration 통합은 현재 renderer 범위 밖입니다. 전체 묶음의 mode-watcher는 localStorage 접근이 가능한 origin을 사용합니다. upstream LayerChart/TanStack 선언 자체의 오류 때문에 소비자 typecheck는 `strict: true, skipLibCheck: true`를 사용하며, 자체 소스의 타입 오류는 허용하지 않습니다.

원본 shadcn commit은 `fe4b0ad3b8b30c6745346db008c3307b5afeabb1`이고 CLI 기준은 1.7.2입니다. [NOTICE](upstream/NOTICE.txt), 고정 원본 archive/hash, vendor 변환 스크립트, Sonner의 고정 runtime/license와 lockfile을 함께 보존합니다. npm 발행은 별도 작업입니다.

```sh
npm run example:svelte-ui       # JSON 편집·실제 화면·State/Query/Action, 기본 :4175
npm run check:svelte-ui         # 빌드·타입·재생성 일치·브라우저·격리 tarball
npm run generate -w @viewstem/svelte-ui # 고정 원본·설치된 고정 dependency에서 재생성
npm run audit:matrix -w @viewstem/svelte-ui # 66개 동작 검증표 재생성
```

66개 컴포넌트군의 입력·이벤트·State·중첩·키보드 동작은 [검증표](../../docs/handoff/svelte-ui-audit-matrix.md)와 [감사 인계](../../docs/handoff/svelte-ui-audit-2026-11-03.md)에 연결합니다. `npm test`는 기존 테스트와 이 동작 사례를 함께 실행하고 `test/results/current.json`에 결과를 저장합니다. 검증표의 필수 사례가 하나라도 실행되지 않거나 실패하면 검사가 실패합니다. 모든 HTML 속성의 모든 조합, 다른 브라우저 엔진이나 실제 모바일 터치까지 통과했다는 뜻은 아닙니다.
