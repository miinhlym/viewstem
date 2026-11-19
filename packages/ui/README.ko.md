# @viewstem/ui

[English](README.md) | 한국어

`@viewstem/ui`는 `@viewstem/core`의 View를 브라우저 DOM에 연결합니다. 기본 컴포넌트는 66개 계열, 357개 JSON Component ID를 제공하며 Basecoat Vega와 Neutral 팔레트를 사용합니다. 순수 JS·React·Vue·Svelte에서 같은 JSON을 실행할 수 있습니다.

```js
import { createRuntime } from '@viewstem/core';
import { createRenderer } from '@viewstem/dom';
import { ui } from '@viewstem/ui';

const runtime = createRuntime();
runtime.registry.registerResourceSet(ui);
const renderer = createRenderer({ runtime });
const target = document.querySelector('#app');
if (!target) throw new Error('Missing #app element');
const screen = renderer.mount({
  target,
  source: {
    render: {
      id: 'save',
      componentRef: 'shadcn.Button',
      inputs: { text: 'Save', variant: 'outline' },
    },
  },
});
await screen.ready;
await screen.whenRendered();
```

화면이 닫히면 `await screen.unmount()`를, 앱에서 렌더러 사용을 마치면 `await renderer.dispose()`를 호출하세요. 최초 Query 보고까지 필요하면 `await screen.whenSettled(view.initial)`을 사용하세요. 여기서 `view`는 `screen.ready`가 반환한 View입니다.

View를 만들기 전에 Runtime의 Registry에 `ui` 셋을 등록합니다. Vite 같은 브라우저 번들러는 `@viewstem/ui`를 가져올 때 기본 UI의 CSS도 포함합니다. 스타일시트를 직접 불러오는 호스트는 `@viewstem/ui/styles.css`를 사용할 수 있습니다. `renderer.attach(view, target)`은 기존 View를 빌리며 `await attachment.detach()`로 연결을 정리합니다. `whenRendered()`는 해당 표시 연결의 DOM 반영을 기다립니다.

Slider의 `type: "multiple"`은 `value`의 숫자마다 손잡이를 만들고, `thumbLabels`로 각 손잡이의 접근성 이름을 지정할 수 있습니다. `valueChange`는 조작 중 값, `valueCommit`은 드래그를 마치거나 키보드로 값을 조절한 뒤의 확정 값을 전달합니다. 이벤트의 `value`는 다중 모드에서 숫자 배열이고 단일 모드에서 숫자입니다.

Slider의 숫자 `step`은 일정한 간격을 지정합니다. 비어 있지 않은 배열은 마우스와 키보드로 선택할 수 있는 값 목록입니다. `min`이나 `max`를 생략하면 각각 목록의 최솟값과 최댓값을 사용합니다. 목록의 모든 값이 범위 밖이면 선택 가능한 값이 생길 때까지 Slider가 비활성화됩니다. 다중 모드의 `value: []`는 손잡이를 모두 제거합니다.

`Command.Dialog`는 Escape로 닫으면 `openChange`에 `{ value: false }`를 전달합니다. `open`을 State에 연결했다면 이 이벤트에서 State를 갱신할 수 있습니다. 핸들러가 없는 기존 View도 Escape로 닫히며 이후 `open` 값이 `true`로 바뀌면 다시 열립니다. `Popover.Root`와 `Tooltip.Root`에 `open`을 제공하면 사용자 조작은 `openChange`로 전환을 요청합니다. 입력값이 실제 화면에 반영되고 전환이 끝나면 `openChangeComplete`가 발생합니다.

Date Picker는 `min`과 `max` 범위에 맞춰 트리거와 그리드에 같은 날짜를 표시합니다. State 값은 호출자가 관리합니다. Data Table은 문자열과 숫자 행 ID를 지원하며, 문자열로 변환한 ID가 고유해야 합니다. `selectedIds`와 `selectedIdsChange`는 문자열 ID를 사용합니다. 페이지 크기를 바꾸면 현재 화면의 첫 행을 기준으로 새 페이지를 계산합니다.

저장소에서 `npm run check:ui`를 실행하면 설치된 tarball로 네 가지 브라우저 호스트의 실행 및 원본 카탈로그 예제를 검사합니다.

`--viewstem-primary`, `--viewstem-radius`처럼 접두사가 있는 변수를 조상에 선언해 테마를 조정하세요. 기존 `data-viewstem-ui`의 역할은 이전 테마 변수의 범위를 지정하는 것입니다. 여러 셋을 섞으면 각 셋의 CSS가 자기 요소에 직접 적용됩니다.
