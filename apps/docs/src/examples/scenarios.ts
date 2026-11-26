import type { ActionSpec, AnyResource, ComponentNode, InputExpressions, JsonValue, Schema, Step, ValueExpression, ViewSpec } from '@viewstem/core';
import type { ExampleDefinition, Locale } from './definitions';

const textSchema = { type: 'string' } as const;
const idsSchema = { type: 'array', items: { type: 'string' } } as const;
const numberSchema = { type: 'integer', minimum: 1 } as const;
const indexSchema = { type: 'integer', minimum: 0 } as const;
const breakdownRef = { typeRef: 'support-channel-rows' } as const;
const breakdownSchema = { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', properties: {
  id: textSchema, channel: textSchema, requests: numberSchema, resolved: { type: 'integer', minimum: 0 },
}, required: ['id', 'channel', 'requests', 'resolved'] } } as const;
const path = (value: string) => ({ '@path': value });
const state = (schema: Schema, initial: JsonValue) => ({ kind: 'State' as const, schema, initial });
const valuePort = (schema: Schema) => ({ kind: 'Value' as const, schema, required: true as const });
const statePort = (schema: Schema) => ({ kind: 'State' as const, schema, required: true });
const node = (id: string, component: string, inputs?: InputExpressions): ComponentNode => ({ id, componentRef: `shadcn.${component}`, ...(inputs && { inputs }) });
const text = (id: string, value: ValueExpression, variant = 'p') => node(id, 'Typography', { text: value, variant, as: variant === 'h3' ? 'h3' : 'p' });
const layout = (id: string, component: string, children: ComponentNode[]): ComponentNode => ({ ...node(id, component), slots: { default: children } });
const panel = (id: string, title: string, description: string, children: ComponentNode[]): ComponentNode => layout(id, 'Card.Root', [
  layout(`${id}-header`, 'Card.Header', [node(`${id}-title`, 'Card.Title', { text: title }), node(`${id}-description`, 'Card.Description', { text: description })]),
  layout(`${id}-content`, 'Card.Content', [layout(`${id}-group`, 'Field.Group', children)]),
]);
const write = (name: string, value: ValueExpression): Step => ({ kind: 'SetState', target: path(`/ports/${name}`), value });
const connect = (control: ComponentNode, event: string, action: ActionSpec, inputs: InputExpressions): ComponentNode => ({
  ...control, on: { [event]: { action, inputs } },
});
const select = (id: string, stateName: string, options: { value: string; label: string }[]): ComponentNode => connect(
  { ...node(`${id}-select`, 'NativeSelect.Root', { id, value: path(`/states/${stateName}`) }),
    slots: { default: options.map((option, index) => node(`${id}-option-${index}`, 'NativeSelect.Option', { value: option.value, text: option.label })) } },
  'change', { ports: { target: statePort(textSchema), next: valuePort(textSchema) }, steps: [write('target', path('/ports/next'))] },
  { target: path(`/states/${stateName}`), next: path('/event/value') },
);
const tableEvents = {
  selectedIdsChange: { action: { ports: { target: statePort(idsSchema), next: valuePort(idsSchema) }, steps: [write('target', path('/ports/next'))] }, inputs: { target: path('/states/selectedIds'), next: path('/event/value') } },
  pageSizeChange: { action: { ports: { target: statePort(numberSchema), next: valuePort(numberSchema) }, steps: [write('target', path('/ports/next'))] }, inputs: { target: path('/states/pageSize'), next: path('/event/value') } },
};
const pageIndexChange = { action: { ports: { target: statePort(indexSchema), next: valuePort(indexSchema) }, steps: [write('target', path('/ports/next'))] }, inputs: { target: path('/states/pageIndex'), next: path('/event/value') } };
const input = (id: string, label: string, name: string, component = 'Input'): ComponentNode => layout(`${id}-field`, 'Field.Field', [
  node(`${id}-label`, 'Label', { for: id, text: label }),
  connect(node(`${id}-control`, component, { id, name, ...(name === 'title' ? { required: true } : {}), value: path(`/states/${name}`) }), 'input',
    { ports: { target: statePort(textSchema), next: valuePort(textSchema) }, steps: [write('target', path('/ports/next'))] },
    { target: path(`/states/${name}`), next: path('/event/value') }),
]);

export function scenarioDefinitions(locale: Locale): Record<'issue-intake' | 'issue-queue' | 'service-overview', ExampleDefinition> {
  const t = (en: string, ko: string) => locale === 'ko' ? ko : en;
  const draft = t('Not submitted', '아직 제출하지 않음');
  const issueForm: ViewSpec = {
    states: {
      title: state(textSchema, ''), details: state(textSchema, ''), priority: state(textSchema, t('Medium', '보통')),
      status: state(textSchema, draft), preparedDetails: state(textSchema, ''),
    },
    render: panel('issue-form', t('Report an issue', '문제 신고'), t('Describe the problem and choose a priority. This demonstration does not send or persist the report.', '문제 내용과 우선순위를 입력하세요. 이 예제는 신고를 전송하거나 영구 저장하지 않습니다.'), [
      input('issue-title', t('Title (required)', '제목 (필수)'), 'title'),
      input('issue-details', t('Details', '상세 내용'), 'details', 'Textarea'),
      layout('priority-field', 'Field.Field', [node('priority-label', 'Label', { for: 'issue-priority', text: t('Priority', '우선순위') }),
      select('issue-priority', 'priority', [
        { value: t('Low', '낮음'), label: t('Low', '낮음') }, { value: t('Medium', '보통'), label: t('Medium', '보통') }, { value: t('High', '높음'), label: t('High', '높음') },
      ])]),
      connect(node('submit-issue', 'Button', { text: t('Submit report', '신고 제출'), type: 'button' }), 'click', {
        ports: { title: valuePort(textSchema), priority: valuePort(textSchema), details: valuePort(textSchema),
          status: statePort(textSchema), preparedDetails: statePort(textSchema) },
        steps: [
          { kind: 'Variable', id: 'valid', spec: { ports: { title: valuePort(textSchema) }, expression: 'size(title.trim()) > 0' }, inputs: { title: path('/ports/title') } },
          { kind: 'If', condition: path('/steps/valid'),
            then: [
              write('status', { '@call': 'formatString', args: { value: t('Report prepared: ${/ports/title} (${/ports/priority})', '신고 내용 확인: ${/ports/title} (${/ports/priority})') } }),
              write('preparedDetails', path('/ports/details')),
            ],
            else: [write('status', t('Enter a title before submitting.', '제목을 입력한 뒤 제출하세요.')), write('preparedDetails', '')],
          },
        ],
      }, { title: path('/states/title'), priority: path('/states/priority'), details: path('/states/details'),
        status: path('/states/status'), preparedDetails: path('/states/preparedDetails') }),
      { ...layout('form-result', 'Alert.Root', [
        node('report-status', 'Alert.Title', { text: path('/states/status') }),
        node('report-details', 'Alert.Description', { text: path('/states/preparedDetails') }),
      ]), inputs: { role: 'status' } },
    ]),
  };

  const issues: JsonValue[] = [
    { id: 'INC-104', title: t('Checkout fails on mobile', '모바일 결제 오류'), priority: t('High', '높음'), owner: t('Mina', '민아'), status: t('Investigating', '조사 중') },
    { id: 'INC-103', title: t('Invite email delayed', '초대 메일 지연'), priority: t('Medium', '보통'), owner: t('Alex', '알렉스'), status: t('Open', '열림') },
    { id: 'INC-102', title: t('Export button is missing', '내보내기 버튼 누락'), priority: t('Low', '낮음'), owner: t('Jin', '진'), status: t('Resolved', '해결됨') },
    { id: 'INC-107', title: t('Search results repeat', '검색 결과 중복'), priority: t('Medium', '보통'), owner: t('Yuri', '유리'), status: t('Open', '열림') },
    { id: 'INC-106', title: t('Calendar is one day off', '달력 날짜가 하루 밀림'), priority: t('Low', '낮음'), owner: t('Jin', '진'), status: t('Investigating', '조사 중') },
    { id: 'INC-105', title: t('Account settings fail to load', '계정 설정을 불러오지 못함'), priority: t('High', '높음'), owner: t('Yuri', '유리'), status: t('Open', '열림') },
  ];
  const queueResource: AnyResource = { kind: 'Query', id: 'incident-queue', spec: { sources: {}, transform: { input: issues } } };
  const queue: ViewSpec = { states: { selectedIds: state(idsSchema, []), pageSize: state(numberSchema, 5), pageIndex: state(indexSchema, 0), filter: state(textSchema, ''), sorting: state({ type: 'array', items: { type: 'object', properties: { id: textSchema, desc: { type: 'boolean' } }, required: ['id', 'desc'], additionalProperties: false } }, []) }, queries: { incidents: { queryRef: 'incident-queue' } }, render: panel('queue', t('Incident queue', '장애 처리 현황'), t('Sample records. Filter or sort the table to find the next issue.', '샘플 데이터입니다. 표를 검색하거나 정렬해 처리할 항목을 찾으세요.'), [
    { ...node('incident-table', 'DataTable', {
      columns: [
        { id: 'id', accessorKey: 'id', label: t('ID', '번호'), sortable: true, filterable: true },
        { id: 'title', accessorKey: 'title', label: t('Issue', '문제'), sortable: true, filterable: true },
        { id: 'priority', accessorKey: 'priority', label: t('Priority', '우선순위'), sortable: true, filterable: true },
        { id: 'owner', accessorKey: 'owner', label: t('Owner', '담당자'), sortable: true, filterable: true },
        { id: 'status', accessorKey: 'status', label: t('Status', '상태'), sortable: true, filterable: true },
      ], data: path('/queries/incidents/data'), filter: path('/states/filter'), sorting: path('/states/sorting'), selectedIds: path('/states/selectedIds'), rowId: 'id', pageSize: path('/states/pageSize'), pageIndex: path('/states/pageIndex'),
      labels: { filter: t('Filter incidents', '장애 검색'), select: t('Select', '선택'), selectRow: t('Select row {id}', '{id} 행 선택'), noRows: t('No incidents found.', '검색 결과가 없습니다.'), previous: t('Previous', '이전'), next: t('Next', '다음'), page: t('Page {page} of {pages}', '{page} / {pages} 페이지'), rowsPerPage: t('Rows per page', '페이지당 행') },
    }), on: {
      ...tableEvents,
      pageIndexChange,
      filterChange: { action: { ports: { target: statePort(textSchema), next: valuePort(textSchema) }, steps: [write('target', path('/ports/next'))] }, inputs: { target: path('/states/filter'), next: path('/event/value') } },
      sortingChange: { action: { ports: { target: statePort({ type: 'array', items: { type: 'object', properties: { id: textSchema, desc: { type: 'boolean' } }, required: ['id', 'desc'], additionalProperties: false } }), next: valuePort({ type: 'array', items: { type: 'object', properties: { id: textSchema, desc: { type: 'boolean' } }, required: ['id', 'desc'], additionalProperties: false } }) }, steps: [write('target', path('/ports/next'))] }, inputs: { target: path('/states/sorting'), next: path('/event/value') } },
    } },
  ]) };

  const overview: ViewSpec = { states: { selectedIds: state(idsSchema, []), pageSize: state(numberSchema, 5), period: state(textSchema, 'week'), note: state(textSchema, t('Sample data', '샘플 데이터')),
    breakdown: { kind: 'Derived', ...breakdownRef, variable: { ports: { period: valuePort(textSchema), weekly: { kind: 'Value', ...breakdownRef, required: true }, monthly: { kind: 'Value', ...breakdownRef, required: true } }, expression: 'period == "week" ? weekly : monthly' }, inputs: { period: path('/states/period'), weekly: [{ id: 'email', channel: t('Email', '이메일'), requests: 58, resolved: 56 }, { id: 'chat', channel: t('Chat', '채팅'), requests: 45, resolved: 43 }, { id: 'web', channel: t('Web form', '웹 양식'), requests: 25, resolved: 24 }], monthly: [{ id: 'email', channel: t('Email', '이메일'), requests: 235, resolved: 220 }, { id: 'chat', channel: t('Chat', '채팅'), requests: 195, resolved: 181 }, { id: 'web', channel: t('Web form', '웹 양식'), requests: 110, resolved: 101 }] } },
    requests: { kind: 'Derived', schema: numberSchema, variable: { ports: { rows: { kind: 'Value', ...breakdownRef, required: true } },
      expression: 'rows[0].requests + rows[1].requests + rows[2].requests' }, inputs: { rows: path('/states/breakdown') } },
    resolved: { kind: 'Derived', schema: { type: 'integer' }, variable: { ports: { rows: { kind: 'Value', ...breakdownRef, required: true } },
      expression: 'rows[0].resolved + rows[1].resolved + rows[2].resolved' }, inputs: { rows: path('/states/breakdown') } },
    rate: { kind: 'Derived', schema: { type: 'integer' }, variable: { ports: { requests: valuePort(numberSchema), resolved: valuePort({ type: 'integer' }) },
      expression: '(resolved * 100 + requests / 2) / requests' }, inputs: { requests: path('/states/requests'), resolved: path('/states/resolved') } },
  }, render: panel('overview', t('Service overview', '서비스 운영 현황'), t('Change the reporting period to review a sample support summary.', '조회 기간을 바꿔 샘플 지원 현황을 확인하세요.'), [
    layout('period-field', 'Field.Field', [node('period-label', 'Label', { for: 'report-period', text: t('Reporting period', '조회 기간') }),
    select('report-period', 'period', [{ value: 'week', label: t('Last 7 days', '최근 7일') }, { value: 'month', label: t('Last 30 days', '최근 30일') }])]),
    text('summary-heading', t('Support requests', '지원 요청'), 'h3'),
    text('summary-value', { '@call': 'formatString', args: { value: t('${/states/requests} requests · ${/states/rate}% resolved', '요청 ${/states/requests}건 · 해결률 ${/states/rate}%') } }, 'large'),
    { ...node('channel-table', 'DataTable', { columns: [{ id: 'channel', accessorKey: 'channel', label: t('Channel', '접수 채널') }, { id: 'requests', accessorKey: 'requests', label: t('Requests', '요청') }, { id: 'resolved', accessorKey: 'resolved', label: t('Resolved', '해결') }], data: path('/states/breakdown'), rowId: 'id', pageSize: path('/states/pageSize'), selectedIds: path('/states/selectedIds'), labels: { select: t('Select', '선택'), selectRow: t('Select row {id}', '{id} 행 선택'), previous: t('Previous', '이전'), next: t('Next', '다음'), page: t('Page {page} of {pages}', '{page} / {pages} 페이지'), rowsPerPage: t('Rows per page', '페이지당 행') } }), on: tableEvents },
    node('overview-note', 'Alert.Root', { text: path('/states/note'), role: 'status', 'aria-live': 'polite' }),
    connect(node('overview-refresh', 'Button', { text: t('Show data source', '데이터 출처 보기'), variant: 'outline', type: 'button' }), 'click', { ports: { note: statePort(textSchema) }, steps: [write('note', t('Illustrative data; no server is connected.', '예시 데이터이며 서버에 연결되어 있지 않습니다.'))] }, { note: path('/states/note') }),
  ]) };
  return {
    'issue-intake': { view: issueForm },
    'issue-queue': { view: queue, resources: [queueResource] },
    'service-overview': { view: overview, resources: [{ kind: 'Type', id: breakdownRef.typeRef, spec: { schema: breakdownSchema } }] },
  };
}
