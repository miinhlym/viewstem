---
title: 브라우저에 View 마운트
description: 로컬 Core와 UI 패키지를 설치하고 같은 View JSON을 브라우저에서 실행합니다.
---

## 빌드 및 설치

Viewstem 저장소 루트에서 워크스페이스 의존성을 설치하고 두 패키지를 빌드하세요.

```sh
npm ci
npm run build:ui
mkdir -p ../viewstem-packages
npm pack -w @viewstem/core -w @viewstem/ui --pack-destination ../viewstem-packages
```

앱에 두 패키지 파일을 설치합니다. 아래 예제는 앱이 `viewstem-packages` 디렉터리와 같은 상위 폴더에 있다고 가정합니다.

```sh
npm install ../viewstem-packages/viewstem-core-0.1.0.tgz ../viewstem-packages/viewstem-ui-0.1.0.tgz
```

## 버튼 렌더링

패키지와 CSS import를 처리할 수 있는 브라우저 빌드를 사용하세요. 앱 HTML에 컨테이너와 클라이언트 진입점을 추가합니다.

```html
<div id="app"></div>
<script type="module" src="/main.js"></script>
```

아래 코드를 `main.js`에 넣으면 컨테이너에 **저장** 버튼이 표시됩니다.

```js
import { createRenderer } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

const renderer = createRenderer();
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
await screen.ready;

export async function unmount() {
  await screen.unmount();
  await renderer.dispose();
}
```

## 호스트 수명에 연결하기

프레임워크 앱에서는 대상이 문서에 연결된 뒤 `mount()`를 호출하고, 화면이 닫힐 때 `screen.unmount()`를 호출하세요. 렌더링된 DOM 하위 트리는 Viewstem이 관리합니다. 이 예제의 정리 함수는 렌더러와 그 내부 Runtime도 폐기합니다. 렌더러를 여러 화면에서 공유한다면 앱이 사용을 마칠 때 `renderer.dispose()`를 호출하세요.

기존 View를 표시하려면 [대여 연결](../../api/#attach)을 사용하세요. 연결 오류는 [브라우저 UI API](../../api/)에서, 지원하는 JSON은 [컴포넌트 카탈로그](../../components/)에서 확인하세요.
