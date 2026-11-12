---
title: 빠른 시작
description: 첫 Viewstem View를 실행해 Svelte 앱에 shadcn 버튼을 표시합니다.
---

JSON View로 **Hello, Viewstem** 버튼 하나를 표시합니다. 앱에서 실행하려면 [설치](../installation/)를 먼저 완료하세요. 브라우저에서 [같은 예제를 바로 실행](../../examples/first-view/)할 수도 있습니다.

## 1. View를 표시할 요소 추가

Vite로 만든 앱의 `index.html`에서 `<div id="app"></div>`를 아래 요소로 바꿉니다. 기존 앱에서는 View를 표시할 위치에 비어 있는 요소를 추가하세요.

```html
<div id="viewstem"></div>
```

## 2. 버튼을 등록하고 View 실행

Vite 앱의 `src/main.js`를 아래 코드로 교체하세요. 기존 앱에서는 대상 요소가 문서에 추가된 뒤 클라이언트에서 실행합니다. `registerShadcn`로 등록한 `shadcn.Button`을 View의 `componentRef`가 가리킵니다.

```js
import { createRegistry, createRuntime } from '@viewstem/core';
import { attach, registerShadcn } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const target = document.querySelector('#viewstem');
const registry = createRegistry();
registerShadcn(registry);
const runtime = createRuntime({ registry });

const mounted = await runtime.createView({
  view: {
    render: {
      id: 'hello',
      componentRef: 'shadcn.Button',
      inputs: { text: 'Hello, Viewstem' },
    },
  },
});
const attachment = attach(mounted.view, target);
await mounted.initialComplete;
```

## 3. 브라우저에서 확인

```sh
npm run dev
```

터미널에 표시된 주소를 열면 **Hello, Viewstem** 버튼이 보입니다. `inputs.text`를 바꿔 버튼 문구가 달라지는지 확인하세요. 화면을 닫을 때는 `attachment.dispose()`와 `runtime.dispose()`를 호출합니다.

## 다음 단계

[View와 Component](../concepts/view-and-component/)에서 정의 구조를 살펴보거나, [클릭해서 State 바꾸기](../../examples/set-state/)에서 버튼을 Action에 연결해 보세요.
