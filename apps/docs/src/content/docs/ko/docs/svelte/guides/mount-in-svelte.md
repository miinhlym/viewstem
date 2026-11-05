---
title: Svelte 앱에 View 마운트하기
description: 작은 어댑터를 등록하고 기존 Svelte 5 컴포넌트 트리 안에 Core View를 표시합니다.
sidebar:
  order: 1
---

`ViewstemView`로 Svelte 앱 안에 Viewstem 인사말을 표시합니다. Svelte를 컴파일할 수 있는 번들러와 [설치](/ko/docs/installation/)에서 준비한 패키지를 사용하는 클라이언트 Svelte 5 앱에서 시작합니다. 아래 파일을 앱 진입점과 같은 디렉터리에 추가하세요.

<a id="prepare-entry"></a>

## 예제 진입점 준비하기

설치나 빠른 시작에서 만든 앱을 사용한다면 `src/main.js` 대신 이 가이드의 `src/main.ts`를 진입점으로 사용합니다. `index.html`의 기존 마운트 요소와 module script를 아래처럼 맞추세요. 빠른 시작에서 사용한 `id="viewstem"`도 `id="app"`으로 바꿉니다. 아래의 모든 소스 파일은 `src/` 안에 둡니다.

```html
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
```

<a id="define-label"></a>

## 1. 어댑터와 공개 계약 정의하기

`Label.svelte`는 평가된 입력을 하나의 prop으로 받습니다. 노드가 준비되면 문자열을, 유효한 입력을 기다리는 동안에는 상태 메시지를 표시합니다.

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
import type { ComponentRegistration } from '@viewstem/svelte';
import Label from './Label.svelte';

export const label: ComponentRegistration = {
  contract: {
    kind: 'Component',
    id: 'Label',
    spec: {
      ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } },
    },
  },
  component: Label,
};
```

## 2. View를 만들고 표시하기

`App.svelte`에서 어댑터를 등록하고 앱이 브라우저에 마운트되면 Core View를 생성합니다. View가 준비되는 즉시 `ViewstemView`에 전달합니다. `onMount`가 반환하는 정리 함수는 렌더러와 렌더러가 소유한 Runtime을 폐기합니다. 여기에서 만든 View는 그 Runtime이 소유합니다.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createRenderer, ViewstemView, type View } from '@viewstem/svelte';
  import { label } from './label.js';

  const renderer = createRenderer();
  renderer.registerComponents([label]);

  let view = $state.raw<View | null>(null);
  let issue = $state('');

  onMount(() => {
    let active = true;

    async function start() {
      const created = await renderer.runtime.createView({
        view: {
          render: {
            id: 'greeting',
            componentRef: 'Label',
            inputs: { text: 'Viewstem에서 보낸 인사말' },
          },
        },
      });
      if (active) view = created.view;
      await created.initialComplete;
    }

    void start().catch(() => {
      if (active) issue = '인사말을 불러오지 못했습니다.';
    });

    return () => {
      active = false;
      void renderer.dispose().catch(console.error);
    };
  });
</script>

<main>
  <h1>내 앱</h1>
  {#if issue}
    <p role="alert">{issue}</p>
  {/if}
  {#if view}
    <ViewstemView {renderer} {view} onError={({ error }) => (issue = error.message)} />
  {:else if !issue}
    <p role="status">인사말을 불러오는 중…</p>
  {/if}
</main>
```

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

앱을 실행해 **내 앱** 아래에 **Viewstem에서 보낸 인사말**이 나타나는지 확인하세요. 인사말 바깥의 HTML은 Svelte 앱에 속하고, [`ViewstemView`](../../viewstem-view/)는 배치한 지점에 빌린 View를 표시합니다.

Core의 `created.initialComplete`는 최초 Query 실행을 기다립니다. 그 결과가 DOM에 반영된 뒤 읽으려면 [컴포넌트 인스턴스의 `whenRendered()`](../../viewstem-view/#whenrendered)도 호출하세요. 루트 정책, 진단, 폴백의 관계는 [오류 레퍼런스](../../errors/)를 참고하세요.
