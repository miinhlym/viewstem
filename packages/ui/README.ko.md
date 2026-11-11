# @viewstem/ui

[English](README.md) | 한국어

`@viewstem/ui`는 `@viewstem/core`의 View를 브라우저 DOM에 연결합니다. 기본 컴포넌트는 66개 계열, 357개 JSON Component ID를 제공하며 Basecoat Vega와 Neutral 팔레트를 사용합니다. 순수 JS·React·Vue·Svelte에서 같은 JSON을 실행할 수 있습니다.

```js
import { createRegistry, createRuntime } from '@viewstem/core';
import { attach, registerShadcn } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const registry = createRegistry();
registerShadcn(registry);
const runtime = createRuntime({ registry });
const { view, initialComplete } = await runtime.createView({
  view: {
    render: {
      id: 'save',
      componentRef: 'shadcn.Button',
      inputs: { text: '저장' },
    },
  },
});
const attachment = attach(view, document.querySelector('#app'));
await initialComplete;

// 화면을 제거할 때
attachment.dispose();
runtime.dispose();
```

호스트 앱은 연결된 DOM 컨테이너와 View·Runtime의 수명을 관리합니다. 지원하는 입력·슬롯·이벤트는 `@viewstem/ui/support.json`에서 확인하세요. 앱 자체의 Svelte 컴포넌트를 연결할 때는 별도 `@viewstem/svelte` 어댑터를 사용할 수 있습니다.

Slider의 `type: "multiple"`은 `value`의 숫자마다 손잡이를 만들고, `thumbLabels`로 각 손잡이의 접근성 이름을 지정할 수 있습니다. `valueChange`는 조작 중 값, `valueCommit`은 드래그를 마치거나 키보드로 값을 조절한 뒤의 확정 값을 전달합니다. 이벤트의 `value`는 다중 모드에서 숫자 배열이고 단일 모드에서 숫자입니다.

저장소에서 `npm run check:ui`를 실행하면 설치된 tarball로 네 가지 브라우저 호스트의 실행 및 원본 카탈로그 예제를 검사합니다.
