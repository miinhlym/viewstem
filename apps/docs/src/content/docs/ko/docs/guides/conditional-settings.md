---
title: 스위치로 설정 항목 표시하기
description: 스위치 이벤트로 State를 갱신하고 선택 설정을 표시합니다.
sidebar:
  order: 4
---

이메일 알림을 켰을 때 주간 요약 설정을 표시합니다. [시작 가이드](../../quickstart/)에서 워크스페이스와 `<div id="viewstem"></div>`를 준비한 뒤 클라이언트 진입 코드를 아래 코드로 교체하세요.

```js
import { createRegistry, createRuntime } from '@viewstem/core';
import { attach, registerShadcn } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const registry = createRegistry();
registerShadcn(registry);
const runtime = createRuntime({ registry });

const boolean = { type: 'boolean' };
const enabled = { '@path': '/states/emailEnabled' };
const target = document.querySelector('#viewstem');
const mounted = await runtime.createView({
  view: {
    states: {
      emailEnabled: { kind: 'State', schema: boolean, initial: false },
    },
    render: {
      id: 'preferences',
      componentRef: 'shadcn.Field.Group',
      slots: {
        default: [
          {
            id: 'email-label',
            componentRef: 'shadcn.Field.Label',
            inputs: { for: 'email-switch', text: '이메일 알림' },
          },
          {
            id: 'email',
            componentRef: 'shadcn.Switch',
            inputs: { id: 'email-switch', checked: enabled },
            on: {
              checkedChange: {
                id: 'update-email',
                action: {
                  ports: {
                    enabled: { kind: 'State', schema: boolean, required: true },
                    next: { kind: 'Value', schema: boolean, required: true },
                  },
                  steps: [{
                    kind: 'SetState',
                    target: { '@path': '/ports/enabled' },
                    value: { '@path': '/ports/next' },
                  }],
                },
                inputs: { enabled, next: { '@path': '/event/value' } },
              },
            },
          },
          {
            id: 'digest',
            componentRef: 'shadcn.Typography',
            when: enabled,
            inputs: { as: 'p', text: '주간 요약: 매주 월요일' },
          },
        ],
      },
    },
  },
});
const attachment = attach(mounted.view, target);
await mounted.initialComplete;
```

**이메일 알림**를 켜면 `checkedChange`가 새 값을 Action에 전달합니다. `SetState`가 값을 기록하면 `when` 조건이 충족되어 **주간 요약: 매주 월요일**가 표시됩니다. 스위치를 끄면 이 문구가 사라집니다.

State 포트와 `SetState`의 상세 규칙은 [Action 명세](../../dsl/actions/)를 참고하세요.
