---
title: "@viewstem/dom"
description: 직접 구현한 DOM 컴포넌트로 View를 마운트하고 컴포넌트 셋의 CSS 범위를 지정합니다.
---

[Core와 DOM을 설치](../installation/#install-dom)하면 직접 구현한 브라우저 컴포넌트로 View를 표시할 수 있습니다. 아래 예제에는 브라우저 번들러와 `id="app"`인 HTML 요소가 필요합니다.

## 직접 구현한 컴포넌트로 마운트하기

```ts
import { createRuntime, defineResourceSet } from '@viewstem/core';
import { createRenderer, DOM_CONNECTOR_ID, type DomComponent } from '@viewstem/dom';

const label: DomComponent = {
  mount({ parent, anchor, node }) {
    const element = parent.ownerDocument.createElement('span');
    element.textContent = String(node.inputs.text);
    parent.insertBefore(element, anchor);
    return {
      update(next) { element.textContent = String(next.inputs.text); },
      setPending(pending) { element.toggleAttribute('aria-busy', pending); },
      dispose() { element.remove(); },
    };
  },
};

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app.');
const runtime = createRuntime();
runtime.registry.registerResourceSet(defineResourceSet({
  id: 'app-labels',
  version: '1',
  components: [{
    contract: {
      kind: 'Component',
      id: 'Label',
      spec: { ports: { text: { kind: 'Value', schema: { type: 'string' } } } },
    },
    connectorId: DOM_CONNECTOR_ID,
    implementation: label,
  }],
}));

const renderer = createRenderer({ runtime });
const mounted = renderer.mount({
  target,
  source: { render: { id: 'label', componentRef: 'Label', inputs: { text: 'Hello from DOM' } } },
});
await mounted.whenRendered();

export async function shutdown() {
  try {
    await renderer.dispose();
  } finally {
    await runtime.dispose();
  }
}
```

## 렌더러와 연결자 레퍼런스

| API | 동작 |
| --- | --- |
| `createRenderer({ runtime, connectors })` | 전달받은 Runtime을 사용합니다. 연결자를 추가로 전달할 수 있습니다. |
| `renderer.mount({ target, source, fallback })` | 마운트가 소유하는 View를 만듭니다. `fallback`은 선택 항목입니다. |
| `renderer.attach(view, target)` | 기존 View를 빌려 표시합니다. `detach()`로 표시 연결을 해제합니다. |
| `renderer.dispose()` | 렌더러의 표시 연결을 해제합니다. 앱이 소유한 Runtime은 앱에서 별도로 정리합니다. |
| `DomComponent.mount(context)` | `context.parent`의 `context.anchor` 앞에 소유 DOM을 삽입하고 `MountedComponent`를 반환합니다. |

마운트한 컴포넌트는 `update(node, signal)`, `setPending(pending)`, `dispose()`를 구현합니다. 마운트나 갱신보다 오래 걸릴 수 있는 작업은 전달된 중단 신호를 따릅니다. `context.provideSlot(name, host, before?)`로 이름이 있는 자식 호스트를 등록하고, 등록을 철회할 때 반환된 정리 함수를 호출합니다. 등록된 Viewstem 자식의 배치와 해제는 렌더러가 담당합니다.

비동기로 DOM을 갱신한다면 `whenRendered(signal)`을 구현합니다. 렌더러는 연결자와 연결자가 제공한 슬롯의 자식을 기다립니다. 소유권, 준비, 실패는 [공통 런타임·렌더링 계약](../guides/runtime-and-rendering/)을 참고하세요. 기본 컴포넌트는 [@viewstem/ui](../ui/)에서 제공됩니다.

## 컴포넌트 셋의 CSS 범위 지정하기

DOM과 CSS 빌드에 같은 패키지 고유 ID를 사용합니다. 소유 요소에는 `@viewstem/dom/styles`에서 가져온 `createStyleScope`의 `createElement`, `createElementNS`, `mark`를 사용합니다. 빌린 슬롯과 호스트 요소는 기존 범위를 따릅니다.

CSS 빌드에서는 `@viewstem/dom/styles/postcss`의 `scopeUiCss`를 가져옵니다. CSS import를 해석한 뒤 `scopeUiCss(id)`를 PostCSS에 전달합니다. 플러그인은 선택자의 최종 대상을 제한하고 내부 커스텀 속성·레이어·애니메이션 이름에 접두사를 붙입니다. 호스트가 이름으로 설정하는 속성에는 `publicProperties`를 사용합니다. JavaScript에서 내부 속성을 바꿀 때는 스타일 범위의 `localProperty(name)`을 사용합니다.

생성한 CSS를 컴포넌트 셋과 함께 배포합니다. 폰트 정의처럼 문서 전체에 적용되는 자원은 호스트 스타일시트에서 관리합니다.
