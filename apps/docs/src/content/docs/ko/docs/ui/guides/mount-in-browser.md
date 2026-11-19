---
title: 브라우저에 View 마운트
description: Core, DOM, UI를 설치하고 브라우저에 View를 마운트합니다.
---

## 빌드 및 설치

[Core, DOM, UI 패키지 파일](../../../installation/#브라우저-ui-패키지-빌드)을 빌드하고 앱에 설치합니다.

## 버튼 렌더링

패키지와 CSS import를 처리할 수 있는 브라우저 빌드를 사용하세요. 앱 HTML에 컨테이너와 클라이언트 진입점을 추가합니다.

```html
<div id="app"></div>
<script type="module" src="/main.js"></script>
```

아래 코드를 `main.js`에 넣으면 컨테이너에 **저장** 버튼이 표시됩니다.

```js
import { createRuntime } from '@viewstem/core';
import { createRenderer } from '@viewstem/dom';
import { ui } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

const runtime = createRuntime();
runtime.registry.registerResourceSet(ui);
const renderer = createRenderer({ runtime });
const screen = renderer.mount({
  target,
  source: {
    render: {
      id: 'save',
      componentRef: 'shadcn.Button',
      inputs: { text: '저장', variant: 'outline' },
    },
  },
});
await screen.whenRendered();

export async function shutdown() {
  try {
    await renderer.dispose();
  } finally {
    runtime.dispose();
  }
}
```

## 호스트 수명에 연결하기

대상이 문서에 연결된 뒤 `mount()`를 호출하고, 화면이 닫힐 때는 `screen.unmount()`를 기다립니다. 렌더링된 DOM 하위 트리는 Viewstem이 관리합니다. 앱을 종료할 때 예제의 `shutdown()`을 호출하면 렌더러의 연결과 앱이 생성한 Runtime을 정리합니다.

기존 View를 표시하려면 [대여 연결](../../api/#attach)을 사용하세요. 연결 오류는 [브라우저 UI API](../../api/)에서, 지원하는 JSON은 [컴포넌트 카탈로그](../../components/)에서 확인하세요.
