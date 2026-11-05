---
title: View 갱신, 교체, 폐기하기
description: 실행 중인 View를 편집하거나 새 수명을 시작하고, 사용을 마친 연결을 정리합니다.
sidebar:
  order: 3
---

내부 State를 가진 View를 마운트합니다. State를 유지하면서 정의를 갱신한 뒤 View를 교체해 새 State로 시작해 봅니다. [Svelte 앱에 View 마운트하기](../mount-in-svelte/#define-label)의 `Label.svelte`와 `label.ts`를 사용하고 HTML 진입점에 `<main id="app"></main>`을 둡니다.

아래의 세 코드 블록을 순서대로 `main.ts`에 넣으세요. 각 단계에서 DOM에 반영된 텍스트는 브라우저 콘솔에서 확인할 수 있습니다.

먼저 [예제 진입점 준비](../mount-in-svelte/#prepare-entry)에 따라 `index.html`을 `/src/main.ts`와 `id="app"`에 연결하세요. 아래 예제는 기존 `src/main.ts`를 교체합니다.

## 1. 마운트하고 DOM 반영 기다리기

```ts
import { createRenderer, type ViewSpec } from '@viewstem/svelte';
import { label } from './label.js';

const target = document.getElementById('app');
if (!target) throw new Error('#app 요소가 필요합니다.');

const renderer = createRenderer();
renderer.registerComponents([label]);

const spec: ViewSpec = {
  states: {
    message: { kind: 'State', schema: { type: 'string' }, initial: '새 초안' },
  },
  render: {
    id: 'message',
    componentRef: 'Label',
    inputs: { text: { '@path': '/states/message' } },
  },
};
const mounted = await renderer.mount({ target, view: spec });
await mounted.initialComplete;
console.log(target.textContent?.trim()); // 새 초안

mounted.view.getState('message').write('저장한 초안');
await mounted.whenRendered();
console.log(target.textContent?.trim()); // 저장한 초안
```

마운트한 핸들의 `initialComplete`는 실행 가능한 최초 Query와 Svelte의 DOM 반영을 기다립니다. State에 쓴 뒤에는 `whenRendered()`로 DOM 반영을 기다립니다. Query 실행과 브라우저 페인트는 이 DOM 대기와 별개입니다.

## 2. 현재 View를 갱신하고 수명 교체하기

```ts
const editedSpec: ViewSpec = {
  ...spec,
  states: {
    message: { kind: 'State', schema: { type: 'string' }, initial: '다시 시작한 초안' },
  },
};

const updated = await mounted.update(editedSpec);
await updated.initialComplete;
console.log(target.textContent?.trim()); // 저장한 초안

const replaced = await mounted.replace({ view: editedSpec });
await replaced.initialComplete;
console.log(target.textContent?.trim()); // 다시 시작한 초안
```

이 예제에서 `update`는 호환되는 기존 State를 유지합니다. `replace`는 새 수명을 시작하고 새 정의로 `message`를 초기화합니다. 교체 후에는 `mounted.view`에서 State나 Query 핸들을 다시 얻으세요.

Core 검증에 실패한 갱신이나 교체는 적용 전에 거절됩니다. 정의를 적용한 뒤 Svelte 어댑터가 렌더링에 실패하면 Core 변경은 적용된 상태에서 `initialComplete`가 거절될 수 있습니다. UI에서 두 결과를 구분해야 한다면 적용과 완료를 별도로 기다리세요.

## 3. DOM과 소유 View 정리하기

```ts
await mounted.dispose();
console.log(target.textContent?.trim()); // 빈 문자열
await renderer.dispose();
```

같은 타깃을 다시 사용하려면 연결의 폐기를 기다리세요. 기존 View를 [`renderer.attach`](../../renderer/#attach)나 [`ViewstemView`](../../viewstem-view/)로 표시했다면 View를 만든 호스트가 해당 View를 폐기합니다. 세대별 완료 시점과 빌린 View의 수명은 [핸들 레퍼런스](../../mounted-view/)를 참고하세요.
