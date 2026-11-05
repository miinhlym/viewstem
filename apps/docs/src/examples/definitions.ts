import type {
  ActionSpec, AnyResource, ComponentNode, InputExpressions, JsonValue,
  QuerySpec, ResourceStateDeclaration, Schema, Step, ValueExpression, ViewSpec,
} from '@viewstem/svelte';

export type Locale = 'en' | 'ko';
export type ExampleDefinition = {
  view: ViewSpec;
  resources?: readonly AnyResource[];
  inputs?: Record<string, JsonValue>;
  fixture?: 'projects' | 'project-write';
};

const path = (value: string) => ({ '@path': value });
const string = { type: 'string' } as const;
const bool = { type: 'boolean' } as const;
const valuePort = (schema: Schema) => ({ kind: 'Value', schema, required: true } as const);
const state = (schema: Schema, initial: JsonValue): ResourceStateDeclaration => ({ kind: 'State', schema, initial });
const node = (id: string, name: string, inputs?: InputExpressions): ComponentNode => ({
  id, componentRef: `shadcn.${name}`, ...(inputs ? { inputs } : {}),
});
const badge = (id: string, text: ValueExpression) => node(id, 'Badge', { text });
const button = (id: string, text: string) => node(id, 'Button', { text });
const card = (...children: ComponentNode[]): ComponentNode => ({
  ...node('card', 'Card.Root'),
  slots: { default: [{ ...node('content', 'Card.Content'), slots: { default: children } }] },
});
const action = (target: string, schema: Schema, steps: readonly Step[]): ActionSpec => ({
  ports: { [target]: { kind: 'State', schema, required: true } }, steps,
});
const write = (target: string, value: ValueExpression): Step => ({ kind: 'SetState', target: path(`/ports/${target}`), value });
const click = (control: ComponentNode, action: ActionSpec, inputs: InputExpressions): ComponentNode => ({
  ...control, on: { click: { id: `${control.id}-action`, action, inputs } },
});
const query = (input: ValueExpression): QuerySpec => ({ sources: {}, transform: { input } });
export const projectsEndpoint = {
  baseUrl: 'https://example.test',
  request: { method: 'GET', path: '/projects' },
} as const;

export function exampleDefinitions(locale: Locale) {
  const t = (en: string, ko: string) => locale === 'ko' ? ko : en;
  const first = t('Hello, Viewstem', '안녕, Viewstem');
  const draft = t('Draft', '초안');
  const saved = t('Saved', '저장됨');
  const project = t('Projects', '프로젝트');
  const billing = t('Billing', '결제');
  const onboarding = t('Onboarding', '온보딩');
  const name = t('Project name', '프로젝트 이름');
  const short = t('Short name', '짧은 이름');
  const long = t('Long name', '긴 이름');
  const details = t('Details are visible', '세부 정보가 표시됩니다');
  const changed = t('Renamed', '이름 변경됨');
  const title = path('/states/title');
  const enabled = path('/states/enabled');
  const setTitle = (next: ValueExpression) => action('title', string, [write('title', next)]);
  const saveButton = (source: ValueExpression) => click(node('save', 'Button', { text: source }), setTitle(saved), { title: source });
  const toggle = (text: string): [ComponentNode, ComponentNode] => [{
    ...node('toggle', 'Switch', { id: 'example-toggle', checked: enabled }),
    on: { checkedChange: {
      id: 'toggle-setting',
      action: { ports: { enabled: { kind: 'State', schema: bool, required: true }, next: valuePort(bool) }, steps: [write('enabled', path('/ports/next'))] },
      inputs: { enabled, next: path('/event/value') },
    } },
  }, node('toggle-label', 'Label', { for: 'example-toggle', text })];
  const http: AnyResource = { kind: 'Datasource', id: 'projects-api', spec: { kind: 'Http', baseUrl: projectsEndpoint.baseUrl } };
  const httpQuery: QuerySpec = {
    sources: { main: { datasourceRef: 'projects-api', request: projectsEndpoint.request } },
    transform: { input: path('/sources/main/title') },
  };

  return {
    'first-view': { view: { render: button('hello', first) } },
    'component-inputs': { view: { render: node('save', 'Button', { text: draft, variant: 'outline', disabled: true }) } },
    'slots': { view: { render: card(badge('draft', draft), badge('saved', saved)) } },
    'conditions': { view: { render: card({ ...badge('draft', draft), when: true }, { ...badge('saved', saved), when: false }) } },
    'repeat': { view: { render: card({
      ...badge('project', path('/repeat/project/name')),
      repeat: {
        items: [{ id: 'onboarding', name: onboarding }, { id: 'billing', name: billing }],
        as: 'project', key: path('/repeat/project/id'),
      },
    }) } },
    'view-inputs': { inputs: { title: project }, view: {
      ports: { title: valuePort(string) },
      render: badge('title', path('/ports/title')),
    } },
    'port-default': { inputs: {}, view: {
      ports: { title: { kind: 'Value', schema: string, default: project } },
      render: badge('title', path('/ports/title')),
    } },
    'value-call': { inputs: { title: project }, view: {
      ports: { title: valuePort(string) },
      render: badge('title', { '@call': 'concat', args: [t('Open ', '열기 · '), path('/ports/title')] }),
    } },
    'state': { view: {
      states: { title: state(string, draft) },
      render: badge('status', title),
    } },
    'set-state': { view: {
      states: { title: state(string, draft) },
      render: card(badge('status', title), click(button('save', t('Save', '저장')), setTitle(saved), { title })),
    } },
    'event-payload': { view: {
      states: { title: state(string, project) },
      render: card(node('name-label', 'Label', { for: 'example-name', text: name }), {
        ...node('name', 'Input', { id: 'example-name' }),
        on: { input: {
          id: 'change-title',
          action: { ports: { title: { kind: 'State', schema: string, required: true }, next: valuePort(string) }, steps: [write('title', path('/ports/next'))] },
          inputs: { title, next: path('/event/value') },
        } },
      }, badge('title', title)),
    } },
    'conditional-ui': { view: {
      states: { enabled: state(bool, false) },
      render: card(...toggle(t('Show details', '세부 정보 표시')), { ...badge('details', details), when: enabled }),
    } },
    'derived': { view: {
      states: {
        title: state(string, t('Task', '업무')),
        label: {
          kind: 'Derived', schema: string,
          variable: { ports: { title: valuePort(string), short: valuePort(string), long: valuePort(string) }, expression: 'size(title) > 5 ? long : short' },
          inputs: { title, short, long },
        },
      },
      render: card(
        node('current-name', 'Badge', { text: title, variant: 'outline' }),
        badge('length', path('/states/label')),
        click(button('rename', t('Use a longer name', '긴 이름으로 변경')), setTitle(t('Project plan', '프로젝트 계획')), { title }),
      ),
    } },
    'state-reaction': { view: {
      states: { title: state(string, onboarding), selection: state(string, t('Row selected', '행 선택됨')) },
      reactions: [{ watch: [title], target: path('/states/selection'), value: t('No selection', '선택 없음') }],
      render: card(
        badge('project', title),
        badge('selection', path('/states/selection')),
        click(button('change-project', t('Open Billing', '결제 열기')), setTitle(billing), { title }),
      ),
    } },
    'action-ref': {
      resources: [{ kind: 'Action', id: 'save-draft', spec: setTitle(saved) }],
      view: {
        states: { title: state(string, draft) },
        render: card(badge('status', title), {
          ...button('save', t('Save', '저장')),
          on: { click: { id: 'save-action', actionRef: 'save-draft', inputs: { title } } },
        }),
      },
    },
    'action-branch': { view: {
      states: { enabled: state(bool, false), title: state(string, draft) },
      render: card(...toggle(t('Enable setting', '설정 켜기')), badge('status', title), click(button('check', t('Check setting', '설정 확인')), {
        ports: { enabled: valuePort(bool), title: { kind: 'State', schema: string, required: true } },
        steps: [{
          kind: 'If', condition: path('/ports/enabled'),
          then: [write('title', t('Enabled', '켜짐'))],
          else: [write('title', t('Disabled', '꺼짐'))],
        }],
      }, { enabled, title })),
    } },
    'action-assert': { view: {
      states: { enabled: state(bool, false), title: state(string, draft) },
      render: card(...toggle(t('Allow saving', '저장 허용')), badge('status', title), click(button('save', t('Save', '저장')), {
        ports: { enabled: valuePort(bool), title: { kind: 'State', schema: string, required: true } },
        steps: [
          { kind: 'Assert', condition: path('/ports/enabled'), message: t('Enable the setting before saving.', '저장하기 전에 설정을 켜세요.') },
          write('title', saved),
        ],
      }, { enabled, title })),
    } },
    'action-output': {
      resources: [{ kind: 'Action', id: 'make-label', spec: { steps: [], output: { schema: string, value: saved } } }],
      view: {
        states: { title: state(string, draft) },
        render: card(badge('status', title), click(button('save', t('Save', '저장')), action('title', string, [
          { kind: 'Action', id: 'label', actionRef: 'make-label' },
          write('title', path('/steps/label')),
        ]), { title })),
      },
    },
    'action-status': { view: {
      render: card(
        badge('status', path('/actions/check-action/status')),
        click(button('check', t('Run check', '검사 실행')), { steps: [{ kind: 'Assert', condition: true }] }, {}),
      ),
    } },
    'action-variable': { view: {
      states: { title: state(string, project) },
      render: card(badge('title', title), click(button('mark', t('Add a mark', '기호 붙이기')), {
        ports: { title: { kind: 'State', schema: string, required: true } },
        steps: [
          {
            kind: 'Variable', id: 'marked',
            spec: { ports: { text: valuePort(string) }, expression: 'text + "!"' },
            inputs: { text: path('/ports/title') },
          },
          write('title', path('/steps/marked')),
        ],
      }, { title })),
    } },
    'query-result': { view: {
      queries: { projects: { query: query(project) } },
      render: badge('query-result', path('/queries/projects/data')),
    } },
    'query-inputs': { view: {
      states: { title: state(string, project) },
      queries: { projects: { query: { ...query(path('/ports/title')), ports: { title: valuePort(string) } }, inputs: { title } } },
      render: card(
        node('current-title', 'Badge', { text: title, variant: 'outline' }),
        badge('query-result', path('/queries/projects/data')),
        click(button('rename', t('Rename', '이름 변경')), setTitle(changed), { title }),
      ),
    } },
    'query-ref': {
      resources: [{ kind: 'Query', id: 'project-title', spec: query(project) }],
      view: { queries: { projects: { queryRef: 'project-title' } }, render: badge('query-result', path('/queries/projects/data')) },
    },
    'http-datasource': {
      fixture: 'projects', resources: [http],
      view: { queries: { projects: { query: httpQuery } }, render: badge('query-result', path('/queries/projects/data')) },
    },
    'query-on-click': {
      fixture: 'project-write', resources: [http],
      view: {
        states: { title: state(string, t('No project created', '만들어진 프로젝트 없음')) },
        render: card(badge('status', title), click(button('create', t('Create project', '프로젝트 만들기')), action('title', string, [
          {
            kind: 'Query', id: 'created',
            spec: {
              sources: { main: { datasourceRef: 'projects-api', request: { method: 'POST', path: '/projects', body: { title: onboarding } } } },
              transform: { input: path('/sources/main/title') },
            },
          },
          write('title', path('/steps/created')),
        ]), { title })),
      },
    },
    'query-gate': {
      fixture: 'projects', resources: [http],
      view: {
        states: { enabled: state(bool, false) },
        queries: { projects: { query: httpQuery, executeWhen: enabled } },
        render: card(
          ...toggle(t('Allow request', '요청 허용')),
          badge('status', path('/queries/projects/status')),
          badge('data', path('/queries/projects/data')),
        ),
      },
    },
    'refresh-query': {
      fixture: 'projects', resources: [http],
      view: {
        queries: { projects: { query: httpQuery } },
        render: card(badge('query-result', path('/queries/projects/data')), click(button('refresh', t('Refresh', '새로고침')), {
          ports: { projects: { kind: 'Query', required: true } },
          steps: [{ kind: 'RefreshQuery', target: path('/ports/projects') }],
        }, { projects: path('/queries/projects') })),
      },
    },
    'query-polling': {
      fixture: 'projects', resources: [http],
      view: {
        states: { enabled: state(bool, false) },
        queries: { projects: { query: httpQuery, intervalMs: 1500, autoRefreshWhen: enabled } },
        render: card(...toggle(t('Auto-refresh', '자동 갱신')), badge('data', path('/queries/projects/data'))),
      },
    },
    'query-concat': { view: {
      queries: { projects: { query: { sources: {}, transform: {
        input: [{ id: 'onboarding', name: onboarding }],
        steps: [{ kind: 'Concat', with: [[{ id: 'billing', name: billing }]] }],
      } } } },
      render: card({
        ...badge('project', path('/repeat/project/name')),
        repeat: { items: path('/queries/projects/data'), as: 'project', key: path('/repeat/project/id') },
      }),
    } },
    'query-join': { view: {
      queries: { projects: { query: { sources: {}, transform: {
        input: [{ id: 'onboarding', name: onboarding }, { id: 'billing', name: billing }],
        steps: [{
          kind: 'Join', mode: 'inner', right: [
            { projectId: 'billing', status: draft },
            { projectId: 'onboarding', status: saved },
          ],
          on: [{ left: 'id', right: 'projectId' }],
        }],
      } } } },
      render: {
        ...node('card', 'Card.Root'),
        slots: { default: [{
          ...node('row', 'Card.Content'),
          repeat: { items: path('/queries/projects/data'), as: 'project', key: path('/repeat/project/id') },
          slots: { default: [
            badge('name', path('/repeat/project/name')),
            badge('status', path('/repeat/project/status')),
          ] },
        }] },
      },
    } },
    'query-sources': { view: {
      queries: {
        projects: { query: {
          sources: {
            active: { query: query([{ id: 'onboarding', name: onboarding }]) },
            archived: { query: query([{ id: 'billing', name: billing }]) },
          },
          transform: { input: path('/sources/active'), steps: [{ kind: 'Concat', with: [path('/sources/archived')] }] },
        } },
      },
      render: card({
        ...badge('project', path('/repeat/project/name')),
        repeat: { items: path('/queries/projects/data'), as: 'project', key: path('/repeat/project/id') },
      }),
    } },
    'reusable-component': {
      resources: [{
        kind: 'Component', id: 'project-label',
        spec: { ports: { name: valuePort(string) }, render: node('label', 'Badge', { text: path('/ports/name'), variant: 'secondary' }) },
      }],
      view: { render: card(
        { id: 'onboarding', componentRef: 'project-label', inputs: { name: onboarding } },
        { id: 'billing', componentRef: 'project-label', inputs: { name: billing } },
      ) },
    },
    'inline-component': { view: {
      render: {
        id: 'project-label',
        component: {
          ports: { name: valuePort(string) },
          render: badge('name', path('/ports/name')),
        },
        inputs: { name: onboarding },
      },
    } },
    'component-state': {
      resources: [{ kind: 'Component', id: 'project-save', spec: { states: { title: state(string, draft) }, render: saveButton(title) } }],
      view: { render: card({ id: 'first', componentRef: 'project-save' }, { id: 'second', componentRef: 'project-save' }) },
    },
    'shared-state-port': {
      resources: [{
        kind: 'Component', id: 'project-save',
        spec: { ports: { title: { kind: 'State', schema: string, required: true } }, render: saveButton(path('/ports/title')) },
      }],
      view: {
        states: { title: state(string, draft), other: state(string, draft) },
        render: card(
          { id: 'first', componentRef: 'project-save', inputs: { title } },
          { id: 'second', componentRef: 'project-save', inputs: { title } },
        ),
      },
    },
    'forward-slot': {
      resources: [{
        kind: 'Component', id: 'project-panel',
        spec: {
          slots: { body: { required: true } },
          render: { ...node('panel', 'Card.Root'), slots: { default: [{
            ...node('content', 'Card.Content'), slots: { default: path('/slots/body') },
          }] } },
        },
      }],
      view: { render: { id: 'project', componentRef: 'project-panel', slots: { body: [badge('label', onboarding)] } } },
    },
    'component-event': {
      resources: [{
        kind: 'Component', id: 'project-picker',
        spec: {
          events: { select: { schema: { type: 'object', properties: { title: string }, required: ['title'] } } },
          render: {
            ...button('pick', t('Pick Onboarding', '온보딩 선택')),
            on: { click: { emit: 'select', payload: { title: onboarding } } },
          },
        },
      }],
      view: {
        states: { title: state(string, t('No project selected', '선택한 프로젝트 없음')) },
        render: card(badge('selection', title), {
          id: 'picker', componentRef: 'project-picker',
          on: { select: {
            action: {
              ports: { title: { kind: 'State', schema: string, required: true }, next: valuePort(string) },
              steps: [write('title', path('/ports/next'))],
            },
            inputs: { title, next: path('/event/title') },
          } },
        }),
      },
    },
    'variable-ref': {
      resources: [{
        kind: 'Variable', id: 'project-label',
        spec: { ports: { title: valuePort(string) }, expression: 'title + "!"' },
      }],
      view: {
        states: {
          projectLabel: { kind: 'Derived', schema: string, variableRef: 'project-label', inputs: { title: project } },
          billingLabel: { kind: 'Derived', schema: string, variableRef: 'project-label', inputs: { title: billing } },
        },
        render: card(badge('projects', path('/states/projectLabel')), badge('billing', path('/states/billingLabel'))),
      },
    },
    'shared-type': {
      resources: [{ kind: 'Type', id: 'project-status', spec: { schema: { type: 'string', enum: [draft, saved] } } }],
      inputs: { title: saved, next: draft },
      view: {
        ports: {
          title: { kind: 'Value', typeRef: 'project-status', required: true },
          next: { kind: 'Value', typeRef: 'project-status', required: true },
        },
        render: card(badge('status', path('/ports/title')), badge('next', path('/ports/next'))),
      },
    },
  } satisfies Record<string, ExampleDefinition>;
}

export type ExampleId = keyof ReturnType<typeof exampleDefinitions>;
