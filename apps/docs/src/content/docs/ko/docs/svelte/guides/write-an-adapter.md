---
title: 슬롯과 이벤트가 있는 어댑터 만들기
description: Svelte 어댑터에 이름 있는 슬롯을 추가하고 버튼으로 View가 선언한 Action을 실행합니다.
sidebar:
  order: 2
---

`body` 슬롯과 **상세 보기** 버튼이 있는 패널을 만듭니다. 패널은 마크업을 담당합니다. View는 슬롯의 내용과 버튼을 눌렀을 때의 동작을 정합니다.

[Svelte 앱에 View 마운트하기](../mount-in-svelte/#define-label)의 `Label.svelte`와 `label.ts`를 사용하세요. HTML 진입점에는 `<main id="app"></main>`을 둡니다.

먼저 [예제 진입점 준비](../mount-in-svelte/#prepare-entry)에 따라 `index.html`을 `/src/main.ts`와 `id="app"`에 연결하세요. 아래 예제는 기존 `src/main.ts`를 교체합니다.

## 1. 버튼과 슬롯 연결하기

`Panel.svelte`를 추가합니다. 선언한 이벤트 이름과 페이로드로 `emit`을 호출합니다. 어댑터 입력이 준비되기 전에는 버튼을 비활성화하고, 이벤트가 거절되면 버튼을 누른 사용자에게 실패를 표시합니다.

```svelte
<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';

  let { node, emit, renderSlot }: ComponentAdapterProps = $props();
  let eventError = $state(false);

  async function reveal() {
    eventError = false;
    try {
      await emit('reveal', null);
    } catch {
      eventError = true;
    }
  }
</script>

<section aria-label="상세 정보">
  <button type="button" disabled={node.status !== 'ready'} onclick={reveal}>
    상세 보기
  </button>
  {#if eventError}
    <p role="alert">상세 내용을 표시하지 못했습니다.</p>
  {/if}
  {@render renderSlot('body')}
</section>
```

## 2. 패널을 등록하고 View 마운트하기

다음 코드를 `main.ts`에 넣습니다. `Panel` 계약은 `body`와 페이로드가 `null`인 `reveal` 이벤트를 선언합니다. View는 `body`에 `Label`을 전달하고 자체 State로 표시 여부를 정합니다.

```ts
import { createRenderer } from '@viewstem/svelte';
import Panel from './Panel.svelte';
import { label } from './label.js';

const target = document.getElementById('app');
if (!target) throw new Error('#app 요소가 필요합니다.');

const renderer = createRenderer({ components: [
  label,
  {
    contract: {
      kind: 'Component',
      id: 'Panel',
      spec: {
        slots: { body: {} },
        events: { reveal: { schema: { type: 'null' } } },
      },
    },
    component: Panel,
  },
] });

const mounted = renderer.mount({
  target,
  source: {
    states: {
      showDetails: { kind: 'State', schema: { type: 'boolean' }, initial: false },
    },
    render: {
      id: 'details-panel',
      componentRef: 'Panel',
      slots: {
        body: [
          {
            id: 'details-text',
            componentRef: 'Label',
            inputs: { text: '이 상세 내용은 View에서 전달했습니다.' },
            when: { '@path': '/states/showDetails' },
          },
        ],
      },
      on: {
        reveal: {
          action: {
            ports: { shown: { kind: 'State', schema: { type: 'boolean' }, required: true } },
            steps: [{ kind: 'SetState', target: { '@path': '/ports/shown' }, value: true }],
          },
          inputs: { shown: { '@path': '/states/showDetails' } },
        },
      },
    },
  },
});
const view = await mounted.ready;
await mounted.whenSettled(view.initial);
```

처음에는 버튼이 보입니다. **상세 보기**를 누르면 **이 상세 내용은 View에서 전달했습니다.**가 나타납니다. 어댑터가 `reveal`을 전달하면 Core가 페이로드를 검증하고 Action을 실행한 뒤 State 쓰기를 반영해 슬롯을 다시 평가합니다. 슬롯 내용을 작성한 주체가 View이므로 슬롯의 `when`은 View의 State를 읽습니다.

호스트에서 화면을 제거할 때 `await renderer.dispose()`를 호출해 연결과 렌더러가 소유한 Runtime을 정리하세요. 입력 준비 상태, 슬롯 순서, 보관한 이벤트 콜백은 [어댑터 레퍼런스](../../adapters/)에서 확인할 수 있습니다.
