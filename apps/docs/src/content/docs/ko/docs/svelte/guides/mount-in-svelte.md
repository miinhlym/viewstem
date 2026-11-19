---
title: Svelte 앱에 View 마운트하기
description: 작은 어댑터를 등록하고 기존 Svelte 5 컴포넌트 트리 안에 Core View를 표시합니다.
sidebar:
  order: 1
---

사용할 진입점을 먼저 고르세요.

| 표시할 곳과 View | 호출 |
| --- | --- |
| 별도 DOM 요소에 새 View 표시 | [`renderer.mount({ target, source })`](../manage-view-lifecycle/) |
| 별도 DOM 요소에 기존 View 표시 | [`renderer.attach(view, target)`](../../renderer/#mount-and-attach) |
| 기존 Svelte 트리에서 독립 화면 | [`<ViewstemView {source} resourceSets={[ui]} />`](../../viewstem-view/) |
| 기존 Svelte 트리에서 새 View 생성 | [`<ViewstemView {renderer} {source} />`](../../viewstem-view/) |
| 기존 Svelte 트리에서 이미 만든 View 표시 | [`<ViewstemView {renderer} {view} />`](../../viewstem-view/#borrowing-a-view) |

이 가이드에서는 `ViewstemView`로 기존 Svelte 트리에 인사말을 표시합니다. [설치](/ko/docs/installation/#svelte-패키지-빌드-및-설치)에서 준비한 패키지와 Svelte를 컴파일할 수 있는 번들러가 필요합니다.

<a id="prepare-entry"></a>

## 예제 진입점 준비하기

설치나 빠른 시작에서 만든 앱을 사용한다면 `src/main.js` 대신 이 가이드의 `src/main.ts`를 진입점으로 사용합니다. `index.html`의 기존 마운트 요소와 module script를 아래처럼 맞추세요. 빠른 시작에서 사용한 `id="viewstem"`도 `id="app"`으로 바꿉니다. 아래의 모든 소스 파일은 `src/` 안에 둡니다.

```html
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
```

<a id="define-label"></a>

## 1. 어댑터와 공개 계약 정의하기

`Label.svelte`는 평가된 입력을 `inputs`로 받고 준비 상태를 `node`에서 읽습니다. 노드가 준비되면 문자열을, 유효한 입력을 기다리는 동안에는 상태 메시지를 표시합니다.

```svelte
<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';

  let { inputs, node }: ComponentAdapterProps = $props();
</script>

{#if node.status === 'ready' && typeof inputs.text === 'string'}
  <p>{inputs.text}</p>
{:else}
  <p role="status">{node.error?.message ?? '텍스트를 기다리는 중…'}</p>
{/if}
```

`label.ts`에서 어댑터 ID를 `Label`로 지정하고 필수 포트 `text`를 선언합니다. 등록을 마치면 View 정의에서 이 ID를 참조할 수 있습니다.

```ts
import { svelteComponent } from '@viewstem/svelte';
import Label from './Label.svelte';

export const label = svelteComponent({
    kind: 'Component',
    id: 'Label',
    spec: {
      ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } },
    },
}, Label);
```

## 2. View를 만들고 표시하기

`App.svelte`에서 어댑터를 등록하고 `source`를 전달합니다. 컴포넌트가 브라우저에서 View를 만들고, 제거되면 준비 중인 작업을 취소하거나 생성한 View를 폐기합니다. 앱이 만든 렌더러는 앱 종료 시에 정리합니다.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { defineResourceSet } from '@viewstem/core';
  import { createRenderer, ViewstemView, type ViewSpec } from '@viewstem/svelte';
  import { label } from './label.js';

  const renderer = createRenderer();

  renderer.runtime.registry.registerResourceSet(defineResourceSet({ id: 'labels', version: '1', components: [label] }));
  const source: ViewSpec = {
    render: {
      id: 'greeting',
      componentRef: 'Label',
      inputs: { text: 'Viewstem에서 보낸 인사말' },
    },
  };

  onMount(() => () => { void renderer.dispose().catch(console.error); });
</script>

{#snippet pending()}
  <p role="status">인사말을 불러오는 중…</p>
{/snippet}

{#snippet prepareError(error: import('@viewstem/svelte').PublicError)}
  <p role="alert">{error.message}</p>
{/snippet}

<main>
  <h1>내 앱</h1>
  <ViewstemView {renderer} {source} {pending} {prepareError} />
</main>
```

`prepareError`는 View 생성 실패를 표시합니다. 생성 뒤 개별 노드의 실패는 `fallback`에서 표시할 수 있습니다. 아래 루트 오류 정책은 어댑터 렌더링 예외가 Svelte 경계에 전달될 때 적용됩니다.

## 3. Svelte 루트 오류 정책 설정하기

브라우저 진입점인 `main.ts`에 `transformError`를 지정합니다. HTML 진입점에는 `id="app"`인 요소가 있어야 합니다. 앱에 Svelte 루트가 이미 있다면 기존 `mount` 호출에 정책을 추가하세요.

```ts
import { mount } from 'svelte';
import { transformError } from '@viewstem/svelte';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app 요소가 필요합니다.');

mount(App, { target, transformError });
```

앱을 실행해 **내 앱** 아래에 **Viewstem에서 보낸 인사말**이 나타나는지 확인하세요. 인사말 바깥의 HTML은 Svelte 앱에 속하고, [`ViewstemView`](../../viewstem-view/)는 배치한 지점에서 부모 context를 상속합니다.

View를 직접 제어하거나 최초 Query 보고를 기다리려면 [기존 View를 빌려 표시하는 방식](../../viewstem-view/#borrowing-a-view)을 사용하세요. `transformError`는 앱 루트 전체에 적용됩니다. [오류 레퍼런스](../../errors/)에서 적용 범위와 폴백을 확인하세요.

<a id="existing-app"></a>

## 기존 앱에 추가하기

현재 앱의 HTML과 진입점을 사용합니다. 위의 `Label.svelte`와 `label.ts`를 추가하고, 공유 레이아웃에서 렌더러를 한 번 만드세요. 다음 예제에서 레이아웃은 렌더러를 소유하고, 조건부로 표시하는 페이지는 자신의 View를 소유합니다.

```svelte
<!-- Layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { defineResourceSet } from '@viewstem/core';
  import { createRenderer } from '@viewstem/svelte';
  import SettingsPage from './SettingsPage.svelte';
  import { label } from './label.js';

  let { showSettings }: { showSettings: boolean } = $props();
  const renderer = createRenderer();
  renderer.runtime.registry.registerResourceSet(defineResourceSet({ id: 'labels', version: '1', components: [label] }));
  onMount(() => () => { void renderer.dispose().catch(console.error); });
</script>

{#if showSettings}
  <SettingsPage {renderer} />
{/if}
```

```svelte
<!-- SettingsPage.svelte -->
<script lang="ts">
  import { ViewstemView, type Renderer, type ViewSpec } from '@viewstem/svelte';

  let { renderer }: { renderer: Renderer } = $props();
  const source: ViewSpec = {
    render: {
      id: 'settings',
      componentRef: 'Label',
      inputs: { text: '설정' },
    },
  };
</script>

<ViewstemView {renderer} {source} />
```

페이지를 닫으면 `ViewstemView`가 준비 중인 요청이나 생성한 View를 정리합니다. 레이아웃이 남아 있는 동안 공유 렌더러는 다음 페이지에서도 사용할 수 있습니다. 앱이 Svelte의 `mount` 또는 `hydrate`를 직접 호출한다면 기존 루트 오류 정책에 맞춰 [`transformError`](../../errors/#transformerror)를 설정하세요. 프레임워크가 루트를 관리한다면 그 프레임워크의 오류 설정을 확인하세요. 위의 `main.ts`는 루트를 직접 마운트하는 Vite 예제입니다.

<a id="mix-default-ui"></a>

## 기본 UI 버튼과 Svelte 컴포넌트 섞기

Svelte TypeScript 클라이언트 빌드와 Core·DOM·Svelte·UI 로컬 패키지가 필요합니다. [Svelte 설치 절차](/ko/docs/installation/#svelte-패키지-빌드-및-설치)를 따른 뒤 [브라우저 UI 빌드](/ko/docs/installation/#브라우저-ui-패키지-빌드)에서 만든 UI tarball도 설치하세요. 다음 파일로 독립 실행할 수 있습니다.

`index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Viewstem counter</title>
  </head>
  <body>
    <main id="app" data-viewstem-ui></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/counter-contract.ts`

```ts
import type { ComponentContract } from '@viewstem/core';

export const integer = { type: 'integer' } as const;
export const counterContract = {
  kind: 'Component',
  id: 'demo.Counter',
  spec: { ports: { count: { kind: 'Value', required: true, schema: integer } } },
} as const satisfies ComponentContract;
```

`src/Counter.svelte`

```svelte
<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  import type { counterContract } from './counter-contract.js';

  let { node }: ComponentAdapterProps<typeof counterContract> = $props();
</script>

<output aria-label="Count">
  {#if node.status === 'ready'}
    {node.inputs.count.toFixed(0)}
  {:else}
    {node.inputs.count ?? '—'}
  {/if}
</output>
```

`src/main.ts`

```ts
import { defineCodeAction, defineResourceSet, type ViewSpec } from '@viewstem/core';
import { createRenderer, svelteComponent } from '@viewstem/svelte';
import { ui } from '@viewstem/ui';
import '@viewstem/ui/styles.css';
import Counter from './Counter.svelte';
import { counterContract, integer } from './counter-contract.js';

const increment = defineCodeAction({
  definition: {
    kind: 'Action',
    id: 'increment',
    spec: { ports: { count: { kind: 'State', required: true, schema: integer } } },
  },
}).implement(({ inputs }) => {
  inputs.count.write((inputs.count.read() ?? 0) + 1);
});

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app');

export const renderer = createRenderer();
renderer.runtime.registry.registerResourceSet(defineResourceSet({
  id: 'counter-demo',
  version: '1',
  dependencies: [ui],
  components: [svelteComponent(counterContract, Counter)],
  actions: [increment],
}));

const count = { '@path': '/states/count' };
export const source: ViewSpec = {
  states: { count: { kind: 'State', schema: integer, initial: 0 } },
  render: {
    id: 'card',
    componentRef: 'shadcn.Card.Root',
    slots: { default: [
      { id: 'counter', componentRef: counterContract.id, inputs: { count } },
      {
        id: 'plus',
        componentRef: 'shadcn.Button',
        inputs: { text: '+1' },
        on: { click: { actionRef: 'increment', inputs: { count } } },
      },
    ] },
  },
};

export const screen = renderer.mount({ target, source });
await screen.whenRendered();
```

렌더러는 한 View에서 Svelte와 DOM을 연결합니다. 예제 셋의 `dependencies: [ui]`는 기본 UI를 함께 등록합니다. CSS import와 `data-viewstem-ui`로 마운트 영역에 스타일을 적용합니다. Card가 단일 루트가 되고 `default` 슬롯에 두 컴포넌트가 들어갑니다.

기본 `shadcn.Button`이 `click`을 보냅니다. 핸들러가 `/states/count`를 Action의 `State` 포트에 연결하므로 Action은 쓰기 가능한 핸들을 받습니다. Svelte 컴포넌트는 같은 경로를 `Value` 포트에 연결해 타입이 추론된 노드에서 숫자를 읽습니다.

앱을 실행하면 카운트가 0부터 시작합니다. **+1**을 클릭하면 1, 포커스가 있는 버튼에서 Enter를 누르면 2가 표시됩니다. `screen.whenRendered()`는 첫 표시를 기다립니다. View 핸들도 필요하면 `await screen.ready`를 사용하세요. 화면만 닫을 때는 `await screen.unmount()`, 앱에서 렌더러 사용을 끝낼 때는 `await renderer.dispose()`를 호출하세요.

카운터의 입력 경로를 `/states/coutn`으로 바꾸면 첫 화면 준비가 실패하고 아래 오류를 반환합니다. [오류 레퍼런스](../../errors/#failure-and-recovery)

```json
{
  "code": "REFERENCE_NOT_FOUND",
  "message": "Unknown State \"coutn\".",
  "location": "/render/slots/default/0/inputs/count/@path",
  "input": "count"
}
```
