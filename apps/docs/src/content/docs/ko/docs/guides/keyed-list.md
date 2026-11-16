---
title: 고유 키로 목록 그리기
description: 항목 ID를 기준으로 하나의 템플릿을 반복합니다.
sidebar:
  order: 3
---

프로젝트 목록을 하나의 행 템플릿으로 표시합니다. [시작 가이드](../../quickstart/)에서 워크스페이스와 `<div id="viewstem"></div>`를 준비한 뒤 클라이언트 진입 코드를 아래 코드로 교체하세요.

```js
import { createRenderer } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const target = document.querySelector('#viewstem');
const renderer = createRenderer();
const source = {
  render: {
    id: 'projects',
    componentRef: 'shadcn.Card.Root',
    slots: {
      default: [{
        id: 'project-list',
        componentRef: 'shadcn.Card.Content',
        slots: {
          default: [{
            id: 'project',
            componentRef: 'shadcn.Typography',
            repeat: {
              items: [
                { id: 'onboarding', name: '온보딩' },
                { id: 'billing', name: '결제' },
              ],
              as: 'project',
              key: { '@path': '/repeat/project/id' },
            },
            inputs: {
              as: 'p',
              text: { '@path': '/repeat/project/name' },
            },
          }],
        },
      }],
    },
  },
};
const screen = renderer.mount({ target, source });
await screen.ready;
```

카드에 **온보딩**과 **결제**이 표시됩니다. `items`에 고유한 `id`를 가진 항목을 하나 더 넣고 새로고침하면 행이 하나 늘어납니다. 실행 중 데이터 순서가 바뀌어도 Viewstem은 ID를 기준으로 기존 행 인스턴스를 유지합니다. 목록 안에서 ID는 서로 달라야 합니다.

반복 노드와 키의 상세 규칙은 [Component와 View 명세](../../dsl/view-and-component/)를 참고하세요.
