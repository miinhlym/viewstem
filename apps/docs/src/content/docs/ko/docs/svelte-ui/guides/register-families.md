---
title: 컴포넌트 패밀리 등록
description: 패밀리 세트를 가져와 렌더러에 등록하고 View를 마운트합니다.
sidebar:
  order: 1
---

번들러에서 `@viewstem/svelte`와 `@viewstem/svelte-ui`를 사용할 수 있는 Svelte 5 앱을 준비하세요. 페이지에 `<div id="app"></div>`를 추가하고 브라우저 진입점에서 아래 코드를 실행합니다.

## 버튼 마운트

패밀리 진입점에서 `button` 세트를 가져와 마운트 전에 `registerComponents`에 넘깁니다. `componentRef`에는 패밀리 레퍼런스에 나오는 컴포넌트 ID를 씁니다.

```ts
import { createRenderer } from '@viewstem/svelte';
import { registerComponents } from '@viewstem/svelte-ui';
import { button } from '@viewstem/svelte-ui/shadcn/button';
import '@viewstem/svelte-ui/shadcn/styles.css';

const target = document.querySelector('#app');
if (!target) throw new Error('Missing #app');

const renderer = createRenderer();
registerComponents(renderer, [button]);

const mounted = await renderer.mount({
  target,
  view: {
    render: {
      id: 'save',
      componentRef: 'shadcn.Button',
      inputs: { text: '저장', variant: 'outline' },
    },
  },
});
await mounted.initialComplete;
```

컴포넌트를 추가할 때 각 세트를 가져와 같은 호출에 넘기세요. 예를 들어 `shadcn.Dialog.Trigger`에 `shadcn.Button`을 넣는 View에는 `button`과 `dialog`가 모두 필요합니다. [컴포넌트 세트](../../component-sets/)에서 import 이름과 ID를 확인할 수 있습니다.

## 전체 세트 등록

실행 중 View 정의를 받아오는 호스트처럼 모든 패밀리가 필요하면 앞의 선택 등록 호출을 아래 코드로 바꿉니다.

```ts
import { shadcn } from '@viewstem/svelte-ui/shadcn';

registerComponents(renderer, shadcn);
```

렌더러를 설정할 때 한 번 등록하세요. 같은 렌더러에 항목이 겹치는 세트를 등록하면 충돌합니다. 패밀리 단위로 import하면 번들러에서 쓰지 않는 JavaScript를 뺄 수 있습니다. 두 방식은 같은 스타일시트를 사용합니다.

## 화면을 닫을 때 정리

화면을 닫을 때 마운트한 View를 정리합니다. 화면에서 렌더러를 소유한다면 렌더러도 정리합니다.

```ts
await mounted.dispose();
await renderer.dispose();
```

메서드 계약은 [렌더러 수명 주기](/ko/docs/svelte/renderer/)와 [등록 API](../../registration/)를 참고하세요.
