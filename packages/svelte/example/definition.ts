import type { ComponentContract, ViewSpec } from '@viewstem/svelte';

/** Host contracts and a serializable View definition; no Svelte implementation lives here. */
export const contracts: ComponentContract[] = [
  { kind: 'Component', id: 'Stack', spec: { slots: { default: {}, footer: {} } } },
  { kind: 'Component', id: 'Label', spec: { ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } } } },
  { kind: 'Component', id: 'Input', spec: {
    ports: {
      label: { kind: 'Value', schema: { type: 'string' }, required: true },
      value: { kind: 'Value', schema: { type: 'string' }, required: true },
    },
    events: { change: { schema: { type: 'string' } } },
  } },
  { kind: 'Component', id: 'Button', spec: {
    ports: { label: { kind: 'Value', schema: { type: 'string' }, required: true } },
    events: { click: { schema: { type: 'null' } } },
  } },
];

export const viewDefinition: ViewSpec = {
  states: {
    name: { kind: 'State', schema: { type: 'string' }, initial: 'Svelte' },
    greeting: {
      kind: 'Derived', schema: { type: 'string' },
      variable: {
        ports: { name: { kind: 'Value', schema: { type: 'string' }, required: true } },
        expression: 'name == "" ? "이름을 입력하세요." : "안녕하세요, " + name + "!"',
      },
      inputs: { name: { '@path': '/states/name' } },
    },
  },
  render: {
    id: 'greeting-form', componentRef: 'Stack',
    slots: {
      default: [
        {
          id: 'name-input', componentRef: 'Input',
          inputs: { label: '이름', value: { '@path': '/states/name' } },
          on: { change: {
            action: {
              ports: {
                target: { kind: 'State', schema: { type: 'string' }, required: true },
                value: { kind: 'Value', schema: { type: 'string' }, required: true },
              },
              steps: [{ kind: 'SetState', target: { '@path': '/ports/target' }, value: { '@path': '/ports/value' } }],
            },
            inputs: { target: { '@path': '/states/name' }, value: { '@path': '/event' } },
          } },
        },
        { id: 'greeting', componentRef: 'Label', inputs: { text: { '@path': '/states/greeting' } } },
      ],
      footer: [
        {
          id: 'reset', componentRef: 'Button', inputs: { label: '초기화' },
          on: { click: {
            action: {
              ports: { target: { kind: 'State', schema: { type: 'string' }, required: true } },
              steps: [{ kind: 'SetState', target: { '@path': '/ports/target' }, value: 'Svelte' }],
            },
            inputs: { target: { '@path': '/states/name' } },
          } },
        },
      ],
    },
  },
};
