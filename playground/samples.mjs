const path = value => ({ '@path': value });
const schema = type => ({ type });
const port = type => ({ kind: 'Value', schema: schema(type), required: true });
const state = (type, initial) => ({ kind: 'State', schema: schema(type), initial });
const text = (id, content, tone = 'normal') => ({ id, componentRef: 'Text', inputs: { text: content, tone } });
const writeAction = type => ({ kind: 'Action', id: `set-${type}`, spec: {
  ports: { target: { kind: 'State', schema: schema(type), required: true }, value: port(type) },
  steps: [{ kind: 'SetState', target: path('/ports/target'), value: path('/ports/value') }],
} });
const change = (id, target, type) => ({ id, actionRef: `set-${type}`, inputs: { target: path(`/states/${target}`), value: path('/event') } });
const stack = (id, children) => ({ id, componentRef: 'Stack', slots: { default: children } });
export function samples(origin) {
  const search = {
    resources: [
      writeAction('string'), writeAction('boolean'),
      { kind: 'Datasource', id: 'local-api', spec: { kind: 'Http', baseUrl: origin } },
      { kind: 'Query', id: 'find-concepts', spec: {
        ports: { search: port('string'), fail: port('boolean') },
        sources: { response: { datasourceRef: 'local-api', request: { method: 'GET', path: '/api/concepts', params: { search: path('/ports/search'), fail: path('/ports/fail'), delay: 500 } } } },
        transform: { input: path('/sources/response') },
      } },
      { kind: 'Action', id: 'refresh-results', spec: { ports: { query: { kind: 'Query', required: true } }, steps: [{ kind: 'RefreshQuery', target: path('/ports/query') }] } },
      { kind: 'Action', id: 'request-and-return-false', spec: { steps: [{ kind: 'Query', queryRef: 'find-concepts', inputs: { search: '', fail: false } }], output: { schema: schema('boolean'), value: false } } },
    ],
    view: {
      states: { search: state('string', ''), simulateFailure: state('boolean', false) },
      queries: { results: { queryRef: 'find-concepts', inputs: { search: path('/states/search'), fail: path('/states/simulateFailure') } } },
      render: { id: 'search-card', componentRef: 'Card', inputs: { title: '작은 개념 사전' }, slots: { default: [
        text('intro', '검색어를 바꾸면 State가 변하고 Query가 다시 실행됩니다.', 'muted'),
        { id: 'search', componentRef: 'TextInput', inputs: { label: '개념 검색', placeholder: 'State, Query, Action…', value: path('/states/search') }, on: { change: change('changeSearch', 'search', 'string') } },
        { id: 'fail', componentRef: 'Checkbox', inputs: { label: 'Query 오류 재현', value: path('/states/simulateFailure') }, on: { change: change('toggleFailure', 'simulateFailure', 'boolean') } },
        { id: 'buttons', componentRef: 'Row', slots: { default: [
          { id: 'refresh', componentRef: 'Button', inputs: { label: '다시 조회' }, on: { click: { id: 'refreshResults', actionRef: 'refresh-results', inputs: { query: path('/queries/results') } } } },
          { id: 'request', componentRef: 'Button', inputs: { label: '요청 후 false 반환' }, on: { click: { id: 'requestResult', actionRef: 'request-and-return-false' } } },
        ] } },
        { id: 'result-list', componentRef: 'Stack', slots: { default: [
          { id: 'concept', componentRef: 'Card', repeat: { items: path('/queries/results/data/items'), as: 'item', key: path('/repeat/item/id') }, inputs: { title: path('/repeat/item/title') }, slots: { default: [text('description', path('/repeat/item/description'), 'muted')] } },
        ] } },
      ] } },
    },
  };
  const counter = {
    resources: [writeAction('number'), writeAction('boolean'),
      { kind: 'Variable', id: 'double', spec: { ports: { n: port('number') }, expression: 'n * 2.0' } },
    ],
    view: { states: { count: state('number', 2), visible: state('boolean', true), doubled: { kind: 'Derived', schema: schema('number'), variableRef: 'double', inputs: { n: path('/states/count') } } },
      render: { id: 'counter-card', componentRef: 'Card', inputs: { title: 'State와 Derived' }, slots: { default: [
        text('intro', '숫자를 입력하면 CEL 계산과 화면이 함께 바뀝니다.', 'muted'),
        { id: 'number', componentRef: 'NumberInput', inputs: { label: '기준 값', value: path('/states/count') }, on: { change: change('changeCount', 'count', 'number') } },
        { id: 'visible', componentRef: 'Checkbox', inputs: { label: '계산 결과 표시', value: path('/states/visible') }, on: { change: change('toggleResult', 'visible', 'boolean') } },
        { id: 'doubled', componentRef: 'Json', when: path('/states/visible'), inputs: { label: 'n × 2', value: path('/states/doubled') } },
      ] } },
    },
  };
  const composition = {
    resources: [
      { kind: 'Component', id: 'Note', spec: { ports: { title: port('string') }, slots: { body: { required: true } }, render: { id: 'card', componentRef: 'Card', inputs: { title: path('/ports/title') }, slots: { default: path('/slots/body') } } } },
    ],
    view: { states: { notes: state('array', [{ id: 'a', title: '선언은 JSON으로', body: 'Component와 이름 있는 slot을 조합합니다.' }, { id: 'b', title: '실행은 core에서', body: 'repeat의 key가 각 항목의 수명을 구분합니다.' }]) },
      render: stack('notes', [{ id: 'note', componentRef: 'Note', repeat: { items: path('/states/notes'), as: 'note', key: path('/repeat/note/id') }, inputs: { title: path('/repeat/note/title') }, slots: { body: [text('body', path('/repeat/note/body'))] } }]),
    },
  };
  return [
    { id: 'query', label: 'Query와 Action', description: '검색 · HTTP · 실패 후 결과 보존', document: search },
    { id: 'state', label: 'State와 Derived', description: '숫자 입력 · CEL · 조건부 표시', document: counter },
    { id: 'composition', label: 'Component와 반복', description: '재사용 구성 · slot · repeat', document: composition },
  ].map(sample => ({ ...sample, document: { view: sample.document.view, resources: sample.document.resources } }));
}
