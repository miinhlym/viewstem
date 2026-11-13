# @viewstem/svelte

Viewstem View를 Svelte 컴포넌트로 표시합니다. Svelte 5.57.3 이상 5.x 앱에서 `@viewstem/core`와 `@viewstem/svelte`를 설치하세요.

| 표시할 곳과 View | 호출 |
| --- | --- |
| 별도 DOM 요소에 새 View 표시 | `renderer.mount({ target, source })` |
| 별도 DOM 요소에 기존 View 표시 | `renderer.attach(view, target)` |
| 기존 Svelte 트리에서 새 View | `<ViewstemView {renderer} {source} />` |
| 기존 Svelte 트리에서 기존 View | `<ViewstemView {renderer} {view} />` |

기존 Svelte 앱에서는 `ViewstemView`를 표시할 위치에 두세요. `source`는 클라이언트에서 View를 만들고 제거 시 생성 작업과 View를 정리합니다. `inputs`는 최초 생성에 쓰이며 새 화면은 `{#key}`로 다시 마운트합니다. `pending`과 `prepareError` 스니펫으로 준비 상태를 표시할 수 있습니다. `view`는 앱이 가진 View를 빌립니다.

기존 앱에서 공유 렌더러를 레이아웃에 두고 페이지를 붙이는 예제는 [Svelte 마운트 가이드](https://github.com/miinhlym/viewstem/blob/main/apps/docs/src/content/docs/ko/docs/svelte/guides/mount-in-svelte.md#existing-app)를 참고하세요.

독립 DOM 예제를 실행하려면 HTML에 `<div id="panel"></div>`를 추가하고 진입점 옆에 다음 `Label.svelte` 파일을 두세요.

```svelte
<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  let { inputs, node }: ComponentAdapterProps = $props();
</script>

{#if node.status === 'ready' && typeof inputs.text === 'string'}
  <p>{inputs.text}</p>
{/if}
```

```ts
import { createRenderer, type ComponentContract, type ViewSpec } from '@viewstem/svelte';
import Label from './Label.svelte';

const contract = { kind: 'Component', id: 'Label', spec: { ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } } } } satisfies ComponentContract;
const source = { states: { text: { kind: 'State', schema: { type: 'string' }, initial: 'Draft' } }, render: { id: 'label', componentRef: 'Label', inputs: { text: { '@path': '/states/text' } } } } satisfies ViewSpec;
const renderer = createRenderer({ components: [{ contract, component: Label }] });
const target = document.querySelector<HTMLElement>('#panel');
if (!target) throw new Error('Missing panel');
const screen = renderer.mount({ target, source });
const view = await screen.ready;
view.getState('text').write('Saved');
await screen.whenRendered();
console.log(target.textContent); // Saved
```

화면이 닫히면 `await screen.unmount()`를, 앱이 렌더러 사용을 마치면 `await renderer.dispose()`를 호출하세요. 최초 Query 보고까지 필요하면 `await screen.whenSettled(view.initial)`을 호출하고 `queryErrors`를 확인하세요.

`createRenderer({ runtime })`은 Runtime을 빌립니다. 기존 코드 Component에 Svelte 구현을 연결하려면 `renderer.bindComponent(id, component)`를 호출하세요. `renderer.attach(view, target)`의 `detach()`는 DOM 연결만 정리합니다. `ViewstemView`는 Svelte 트리에서 제거하면 연결이 정리됩니다. 대여한 View와 주입 Runtime의 수명은 원래 소유자가 관리합니다.

## Svelte 어댑터

어댑터는 공개 `ComponentAdapterProps`를 받는 Svelte Component입니다.

| prop | 의미 |
|---|---|
| `inputs` | core가 검증·평가한 읽기 전용 입력. Value와 명시 전달된 State/Query 핸들 |
| `node` | 현재 `NodeSnapshot`. 주소·세대·준비 상태·오류·이름별 slot 등 |
| `emit(name, payload)` | 현재 인스턴스의 core 이벤트 호출. 실제 Action 결과를 반환하거나 공통 오류로 reject |
| `renderSlot` | `Snippet<[name: string]>`. `{@render renderSlot('body')}`로 지정 slot 표시 |

입력을 임의 DOM attribute로 펼치거나 Svelte prop 이름으로 바꾸지 않습니다. `inputs`의 값은 직접 수정하지 않고, 명시 전달된 State 핸들이나 `emit`으로 쓰기를 수행합니다. 외부 Action 실행 상태를 버튼의 disabled 값에 자동 연결하지도 않습니다.

주소·세대가 있는 코드 Component는 준비 상태가 달라져도 같은 어댑터 인스턴스를 유지합니다. 어댑터가 `node.status`를 확인해 pending/error/missing 표시와 입력 비활성을 처리해야 합니다. 이때 `inputs`가 완전하지 않을 수 있습니다. `emit`은 **호출 순간의 core 상태**가 ready인 경우만 전달하며, 오래된 세대·해제된 연결은 CANCELLED입니다. 입력의 IME 처리·접근성·디자인은 실제 입력을 구현하는 호스트 어댑터의 책임입니다.

레이아웃과 DOM은 호스트 어댑터가 소유합니다. 렌더러는 암묵적인 Row/Column이나 wrapper DOM을 추가하지 않습니다. 이름 있는 slot은 core가 평가한 노드 배열을 원래 순서대로 렌더링하며, 선언형 Component는 core가 확장한 하위 화면으로 연결합니다. 같은 주소·세대의 표시 중인 반복 항목은 keyed 렌더링으로 Svelte 로컬 상태를 유지하고, 제거·재생성은 새 수명입니다. 선언형 부모의 입력이 미준비라 하위 projection이 생략되면 해당 하위 Svelte 화면은 분리되지만 core가 보존한 내부 상태는 유지됩니다.

직접 Svelte 루트에서 `ViewstemView`를 호스팅할 때는 이 패키지의 `transformError`를 Svelte `mount` 또는 `hydrate`에 설정하세요. 경계에 도달하기 전에 호스트의 예외 값을 정제합니다. `fallback` 스니펫으로 대기 또는 오류 노드를 표시할 수 있으며 초기 `mount()`의 렌더 오류는 `screen.ready`를 거절하고 대상을 해제합니다. 살아 있는 연결은 렌더 오류를 `onError`로 보고하고 새 투영에서 다시 시도할 수 있습니다.
