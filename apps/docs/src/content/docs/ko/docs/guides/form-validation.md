---
title: 폼 입력 검증하기
description: 이름을 State에 저장하고 입력이 바뀔 때 검증 메시지를 계산합니다.
sidebar:
  order: 1
---

필수 항목인 이름이 비어 있거나 공백뿐이면 메시지를 표시합니다. [시작 가이드](../../quickstart/)를 완료한 뒤 `index.html`의 `<div id="viewstem"></div>`를 유지하고 `src/main.js`를 아래 코드로 교체하세요. `npm run dev`를 실행하고 Vite가 출력하는 URL을 여세요.

## 입력과 검증 메시지 연결하기

```js title="src/main.js"
import { createRegistry, createRuntime } from '@viewstem/core';
import { attach, registerShadcn } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const registry = createRegistry();
registerShadcn(registry);
const runtime = createRuntime({ registry });

const string = { type: 'string' };
const name = { '@path': '/states/name' };

const target = document.querySelector('#viewstem');
const mounted = await runtime.createView({
  view: {
    states: {
      name: { kind: 'State', schema: string, initial: '' },
      nameMessage: {
        kind: 'Derived',
        schema: string,
        variable: {
          ports: { name: { kind: 'Value', schema: string, required: true } },
          expression: 'name.trim() == "" ? "이름을 입력하세요." : ""',
        },
        inputs: { name },
      },
    },
    render: {
      id: 'name-field',
      componentRef: 'shadcn.Field.Field',
      slots: {
        default: [
          {
            id: 'label',
            componentRef: 'shadcn.Field.Label',
            inputs: { for: 'project-name', text: '프로젝트 이름' },
          },
          {
            id: 'name-input',
            componentRef: 'shadcn.Input',
            inputs: {
              id: 'project-name',
              value: name,
              required: true,
              'aria-describedby': 'name-message',
            },
            on: {
              input: {
                action: {
                  ports: {
                    target: { kind: 'State', schema: string, required: true },
                    next: { kind: 'Value', schema: string, required: true },
                  },
                  steps: [{
                    kind: 'SetState',
                    target: { '@path': '/ports/target' },
                    value: { '@path': '/ports/next' },
                  }],
                },
                inputs: { target: name, next: { '@path': '/event/value' } },
              },
            },
          },
          {
            id: 'validation',
            componentRef: 'shadcn.Field.Description',
            inputs: {
              id: 'name-message',
              text: { '@path': '/states/nameMessage' },
              'aria-live': 'polite',
            },
          },
        ],
      },
    },
  },
});
const attachment = attach(mounted.view, target);
await mounted.initialComplete;
```

1. **입력값을 저장합니다.** 텍스트 상자는 `/states/name`을 읽습니다. `input` 이벤트는 `/event/value`로 편집된 문자열을 Action에 전달합니다. `target` State 포트가 쓰기 가능한 셀에 연결되므로 `SetState`는 텍스트 상자가 읽는 값을 갱신합니다.
2. **메시지를 다시 계산합니다.** `nameMessage`는 Value 포트로 새 이름을 받습니다. CEL 식은 양쪽 공백을 제거한 값이 비어 있으면 메시지를, 이름이 있으면 빈 문자열을 반환합니다. 텍스트 상자에는 입력한 문자열이 그대로 남습니다.
3. **메시지를 입력에 연결합니다.** `for`와 `id`는 화면의 레이블과 텍스트 상자를 연결합니다. 설명 영역은 `/states/nameMessage`를 읽습니다. 이 영역은 계속 마운트되어 있어 보조 기술이 변경된 메시지를 알릴 수 있습니다.

## 실행 결과 확인하기

빈 텍스트 상자에는 **이름을 입력하세요.**가 표시됩니다. **온보딩**을 입력하면 메시지가 사라집니다. 내용을 모두 지우거나 공백만 입력하면 메시지가 다시 표시됩니다.

다른 계산 필드를 추가하려면 [State와 Derived 선언](../../dsl/state-and-ports/#state-선언)을, 제출 Action에도 같은 검증 규칙을 적용하려면 [Action 단계](../../dsl/actions/#단계)를 참고하세요.
