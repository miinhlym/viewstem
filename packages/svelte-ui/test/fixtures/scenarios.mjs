// Authoring helpers produce ordinary, serializable ViewSpec JSON. No host Actions
// or hidden state are needed: every example runs with the public shadcn set.
import { path, read, string, boolean, number, choice, array, record, nullable, state, derived, stateWriter } from './scenario-state.mjs';
const format = value => ({ '@call': 'formatString', args: { value } });
const node = (name, inputs = {}, children = [], extra = {}) => ({
  componentRef: 'shadcn.' + name, inputs,
  ...(children.length ? { slots: { default: children } } : {}), ...extra,
});
const text = (name, value, inputs = {}, extra = {}) => node(name, { text: value, ...inputs }, [], extra);
const group = children => node('Field.Group', {}, children);
const field = (label, control, help) => node('Field.Field', control.inputs['aria-invalid'] !== undefined ? { 'data-invalid': control.inputs['aria-invalid'] } : {}, [
  control.inputs.id ? text('Field.Label', label, { for: control.inputs.id }) : text('Field.Title', label), control,
  ...(help ? [text('Field.Description', help)] : []),
]);
const card = (title, description, children, footer = [], inputs = {}) => node('Card.Root', inputs, [
  node('Card.Header', {}, [text('Card.Title', title), text('Card.Description', description)]),
  node('Card.Content', {}, children), ...(footer.length ? [node('Card.Footer', {}, footer)] : []),
]);
const notice = (title, description, when) => node('Alert.Root', {}, [text('Alert.Title', title), text('Alert.Description', description)], { when });
const query = value => ({ query: { ports: { value: { kind: 'Value', schema: true, required: true } }, sources: {}, transform: { input: path('/ports/value') } }, inputs: { value } });
function controls(states) {
  const write = stateWriter(states);
  const change = (name, event = 'valueChange') => ({ [event]: write({ [name]: path('/event/value') }) });
  const button = (label, values, inputs = {}) => text('Button', label, inputs, { on: { click: write(values) } });
  const bound = (component, name, inputs = {}, property = 'value', event = 'valueChange', children = []) =>
    node(component, { ...inputs, [property]: read(name) }, children, { on: change(name, event) });
  const input = (name, inputs = {}) => bound('Input', name, { id: name, ...inputs }, 'value', 'input');
  const select = (name, options, inputs = {}) => bound('NativeSelect.Root', name, { id: name, ...inputs }, 'value', 'change',
    options.map(([value, label]) => text('NativeSelect.Option', label, { value })));
  const tabs = (name, options, contents) => bound('Tabs.Root', name, {}, 'value', 'valueChange', [
    node('Tabs.List', {}, options.map(([value, label]) => text('Tabs.Trigger', label, { value }))),
    ...contents.map(([value, children]) => node('Tabs.Content', { value }, children)),
  ]);
  return { write, change, button, bound, input, select, tabs };
}
function scenario(slug, states, render, queries = {}) {
  let index = 0;
  const identify = item => {
    const id = slug + '-' + ++index;
    return { id, ...item,
      ...(item.on ? { on: Object.fromEntries(Object.entries(item.on).map(([event, action]) => [event, { id: id + '-' + event, ...action }])) } : {}),
      ...(item.slots ? { slots: Object.fromEntries(Object.entries(item.slots).map(([key, children]) => [key, children.map(identify)])) } : {}),
    };
  };
  return { slug, view: { states, ...(Object.keys(queries).length ? { queries } : {}), render: identify(group(render(controls(states)))) } };
}

const profileSchema = record({ name: string, email: string, team: choice('product', 'engineering', 'design'), emailAlerts: boolean, weeklyReport: boolean });
const initialProfile = { name: '김서윤', email: 'seoyun@example.com', team: 'product', emailAlerts: true, weeklyReport: false };
const profile = scenario('profile', {
  tab: state('profile', choice('profile', 'notifications')),
  form: state(initialProfile, profileSchema), receipt: state(null, nullable(profileSchema)),
  nameInvalid: derived({ name: read('form/name') }, 'size(name.trim()) == 0', boolean),
  emailInvalid: derived({ email: read('form/email') }, "!email.matches('^[^ @]+@[^ @]+[.][^ @]+$')", boolean),
  invalid: derived({ nameInvalid: read('nameInvalid'), emailInvalid: read('emailInvalid') }, 'nameInvalid || emailInvalid', boolean),
  saved: derived({ receipt: read('receipt') }, 'receipt != null', boolean),
  baseline: derived({ receipt: read('receipt'), initial: initialProfile }, 'receipt == null ? initial : receipt', profileSchema),
  unchanged: derived({ form: read('form'), baseline: read('baseline') }, 'form == baseline', boolean),
}, ({ tabs, input, select, bound, button }) => [
  tabs('tab', [['profile', '프로필'], ['notifications', '알림']], [
    ['profile', [card('계정 설정', '팀에 표시되는 프로필과 연락처를 관리합니다.', [group([
      field('이름', input('form/name', { autocomplete: 'name', 'aria-invalid': read('nameInvalid') })),
      field('이메일', input('form/email', { type: 'email', autocomplete: 'email', 'aria-invalid': read('emailInvalid') })),
      field('팀', select('form/team', [['product', '프로덕트'], ['engineering', '개발'], ['design', '디자인']])),
    ])])]],
    ['notifications', [card('알림 설정', '받고 싶은 소식만 선택하세요.', [group([
      field('이메일 알림', bound('Switch', 'form/emailAlerts', { id: 'emailAlerts' }, 'checked', 'checkedChange'), '댓글과 멘션 알림'),
      field('주간 리포트', bound('Switch', 'form/weeklyReport', { id: 'weeklyReport' }, 'checked', 'checkedChange'), '매주 월요일 활동 요약'),
    ])])]],
  ]),
  notice('입력을 확인하세요', '프로필 탭에서 이름과 올바른 이메일 주소를 입력하세요.', read('invalid')),
  group([
    button('설정 적용', { receipt: read('form') }, { disabled: read('invalid') }),
    button('변경 취소', { form: read('baseline') }, { variant: 'outline', disabled: read('unchanged') }),
  ]),
  notice('프로필 적용 완료', format('${/states/receipt/name} · ${/states/receipt/email}'), read('saved')),
]);

const customerRows = [
  { id: 'c1', name: '김서윤', email: 'seoyun@example.com', company: '모노랩', status: '활성' },
  { id: 'c2', name: '이도현', email: 'dohyun@example.com', company: '오브젝트', status: '체험' },
  { id: 'c3', name: '박지우', email: 'jiwoo@example.com', company: '스튜디오 온', status: '활성' },
  { id: 'c4', name: '최하린', email: 'harin@example.com', company: '페이지', status: '체험' },
  { id: 'c5', name: '정민준', email: 'minjun@example.com', company: '모노랩', status: '활성' },
  { id: 'c6', name: '윤수아', email: 'sua@example.com', company: '오브젝트', status: '활성' },
];
const customerFormSchema = record({ name: string, email: string, company: string });
const emptyCustomer = { name: '', email: '', company: '' };
const customerRowsSchema = array(record({ id: string, ...customerFormSchema.properties, status: choice('활성', '체험') }));
const filtersSchema = record({ segment: choice('all', '활성', '체험'), search: string });
const paginationSchema = record({ pageIndex: { type: 'integer', minimum: 0 }, pageSize: { type: 'integer', minimum: 1 } });
const customers = scenario('customers', {
  rows: state(customerRows, customerRowsSchema), filters: state({ segment: 'all', search: '' }, filtersSchema),
  pagination: state({ pageIndex: 0, pageSize: 4 }, paginationSchema),
  sorting: state([], array(record({ id: string, desc: boolean }))), selected: state([], array(string)),
  open: state(false, boolean), form: state(emptyCustomer, customerFormSchema),
  filtered: derived({ rows: read('rows'), segment: read('filters/segment') }, "segment == 'all' ? rows : rows.filter(row, row.status == segment)", customerRowsSchema),
  selectionLabel: derived({ selected: read('selected') }, "string(size(selected)) + '명 선택'", string),
  cannotAdd: derived({ form: read('form') }, "size(form.name.trim()) == 0 || !form.email.matches('^[^ @]+@[^ @]+[.][^ @]+$')", boolean),
}, ({ write, change, input, select, bound, button }) => {
  // Construct the submitted row when Add runs, rather than recomputing an
  // alternate rows collection for every keystroke in the draft form.
  const add = write({ rows: read('rows'), open: false, form: emptyCustomer, filters: { segment: 'all', search: '' }, 'pagination/pageIndex': 0, selected: [] });
  add.action.steps.find(step => step.target['@path'] === '/ports/rows').value = path('/steps/appendCustomer');
  add.action.steps.unshift({ kind: 'Variable', id: 'appendCustomer',
    spec: { ports: { rows: { kind: 'Value', schema: customerRowsSchema, required: true }, form: { kind: 'Value', schema: customerFormSchema, required: true } },
      expression: "rows + [{'id': 'c' + string(size(rows) + 1), 'name': form.name, 'email': form.email, 'company': form.company, 'status': '체험'}]" },
    inputs: { rows: path('/ports/rows'), form: path('/ports/form') },
  });
  return [card('고객 목록', '샘플 고객 데이터 · 검색, 정렬, 선택과 새 고객 추가', [
  group([
    field('고객 상태', { ...select('filters/segment', [['all', '전체 고객'], ['활성', '활성'], ['체험', '체험'] ]), on: { change: write({ 'filters/segment': path('/event/value'), 'pagination/pageIndex': 0 }) } }),
    text('Badge', read('selectionLabel'), { variant: 'secondary' }),
  ]),
  node('DataTable', {
    data: path('/queries/customers/data'), rowId: 'id', pageSize: read('pagination/pageSize'),
    columns: [['name', '이름'], ['email', '이메일'], ['company', '회사'], ['status', '상태']].map(([id, label]) => ({ id, accessorKey: id, label, sortable: true, filterable: true })),
    filter: read('filters/search'), sorting: read('sorting'), selectedIds: read('selected'), pageIndex: read('pagination/pageIndex'),
  }, [], { on: { filterChange: write({ 'filters/search': path('/event/value'), 'pagination/pageIndex': 0 }), sortingChange: write({ sorting: path('/event/value'), 'pagination/pageIndex': 0 }), ...change('selected', 'selectedIdsChange'), ...change('pagination/pageIndex', 'pageIndexChange'), pageSizeChange: write({ 'pagination/pageSize': path('/event/value'), 'pagination/pageIndex': 0 }) } }),
], [
  node('Dialog.Root', { open: read('open') }, [
    node('Dialog.Trigger', {}, [], { slots: { child: [text('Button', '고객 추가')] } }),
    node('Dialog.Content', {}, [
      node('Dialog.Header', {}, [text('Dialog.Title', '새 고객'), text('Dialog.Description', '목록에 추가할 고객 정보를 입력하세요.')]),
      group([field('이름', input('form/name')), field('이메일', input('form/email', { type: 'email' })), field('회사', input('form/company'))]),
      node('Dialog.Footer', {}, [button('취소', { open: false, form: emptyCustomer }, { variant: 'outline' }), text('Button', '추가', { disabled: read('cannotAdd') }, { on: { click: add } })]),
    ]),
  ], { on: { openChange: write({ open: path('/event/value'), form: emptyCustomer }) } }),
])]; }, { customers: query(read('filtered')) });

const bookingSchema = record({ name: string, date: nullable({ 'x-viewstem-type': 'date' }), room: choice('', 'Seoul A', 'Seoul B', 'Busan'), time: choice('10:00', '14:00', '16:00'), note: string });
const booking = scenario('booking', {
  form: state({ name: '', date: '2026-11-10', room: 'Seoul A', time: '10:00', note: '' }, bookingSchema),
  receipt: state(null, nullable(bookingSchema)),
  invalid: derived({ form: read('form') }, "form.date == null || form.room == '' || size(form.name.trim()) == 0", boolean),
  confirmed: derived({ receipt: read('receipt') }, 'receipt != null', boolean),
}, ({ input, select, bound, button }) => [
  card('회의실 예약', '날짜와 회의실을 선택한 뒤 예약 내용을 확인하세요.', [group([
    field('예약자', input('form/name', { placeholder: '이름' })),
    field('날짜', bound('DatePicker', 'form/date', { locale: 'ko-KR', min: '2026-11-01', max: '2026-11-30', placeholder: '날짜 선택' })),
    field('회의실', bound('Combobox', 'form/room', { options: [{ value: 'Seoul A', label: '서울 A · 6인' }, { value: 'Seoul B', label: '서울 B · 10인' }, { value: 'Busan', label: '부산 · 4인' }], searchPlaceholder: '회의실 검색' })),
    field('시작 시간', select('form/time', [['10:00', '오전 10시'], ['14:00', '오후 2시'], ['16:00', '오후 4시']])),
    field('요청 사항', bound('Textarea', 'form/note', { id: 'note', placeholder: '필요한 장비나 요청 사항' }, 'value', 'input')),
  ])], [button('예약 확인', { receipt: read('form') }, { disabled: read('invalid') })]),
  node('Card.Root', {}, [
    node('Card.Header', {}, [text('Card.Title', '예약 확인서'), text('Card.Description', format('${/states/receipt/name}님의 예약'))]),
    node('Card.Content', {}, [text('Typography', format('${/states/receipt/date} · ${/states/receipt/time}')), text('Badge', path('/states/receipt/room'), { variant: 'outline' })]),
    node('Card.Footer', {}, [button('예약 취소', { receipt: null }, { variant: 'outline' })]),
  ], { when: read('confirmed') }),
]);

const reports = {
  week: { revenue: '₩4,820,000', orders: '128건', conversion: '3.8%', rows: [
    { x: '월', revenue: 52, orders: 12 }, { x: '화', revenue: 65, orders: 18 }, { x: '수', revenue: 58, orders: 15 },
    { x: '목', revenue: 92, orders: 24 }, { x: '금', revenue: 115, orders: 30 }, { x: '토', revenue: 100, orders: 29 },
  ] },
  month: { revenue: '₩18,640,000', orders: '496건', conversion: '4.2%', rows: [
    { x: '1주', revenue: 382, orders: 105 }, { x: '2주', revenue: 450, orders: 121 },
    { x: '3주', revenue: 550, orders: 142 }, { x: '4주', revenue: 482, orders: 128 },
  ] },
};
const reportSchema = record({ revenue: string, orders: string, conversion: string, rows: array(record({ x: string, revenue: number, orders: number })) });
const dashboard = scenario('dashboard', {
  period: state('week', choice('week', 'month')), kind: state('bar', choice('bar', 'line', 'area')),
  report: derived({ period: read('period'), reports }, 'reports[period]', reportSchema),
}, ({ bound, select }) => [
  group([
    text('Typography', '매출 대시보드', { as: 'h2', variant: 'h3' }),
    bound('Tabs.Root', 'period', {}, 'value', 'valueChange', [node('Tabs.List', {}, [text('Tabs.Trigger', '이번 주', { value: 'week' }), text('Tabs.Trigger', '이번 달', { value: 'month' })])]),
  ]),
  group([
    card('매출', '선택 기간 합계', [text('Typography', path('/queries/report/data/revenue'), { as: 'p', variant: 'h3' })]),
    card('주문', '결제 완료', [text('Typography', path('/queries/report/data/orders'), { as: 'p', variant: 'h3' })]),
    card('전환율', '방문 대비 주문', [text('Typography', path('/queries/report/data/conversion'), { as: 'p', variant: 'h3' })]),
  ]),
  card('매출 추이', '매출 단위: 만원 · 예제 데이터', [
    field('차트 종류', select('kind', [['bar', '막대'], ['line', '선'], ['area', '영역']])),
    node('Chart', { kind: read('kind'), label: '기간별 매출', data: path('/queries/report/data/rows'), x: 'x', series: [{ id: 'revenue', key: 'revenue', label: '매출', color: 'var(--chart-1)' }] }),
  ]),
], { report: query(read('report')) });

const pricingSchema = record({ plan: choice('team', 'pro'), billing: choice('monthly', 'yearly'), seats: { type: 'integer', minimum: 1, maximum: 20 } });
const quoteSchema = record({ seats: pricingSchema.properties.seats, plan: choice('Team', 'Pro'), billing: choice('월간', '연간'), monthly: { type: 'number', minimum: 0 } });
const pricing = scenario('pricing', {
  form: state({ plan: 'team', billing: 'monthly', seats: 5 }, pricingSchema), receipt: state(null, nullable(quoteSchema)),
  quote: derived({ plan: read('form/plan'), billing: read('form/billing'), seats: read('form/seats') }, "{'seats': seats, 'plan': plan == 'team' ? 'Team' : 'Pro', 'billing': billing == 'monthly' ? '월간' : '연간', 'monthly': seats * (plan == 'team' ? 15000.0 : 25000.0) * (billing == 'yearly' ? 0.8 : 1.0)}", quoteSchema),
  saved: derived({ receipt: read('receipt') }, 'receipt != null', boolean),
}, ({ select, bound, button }) => [card('요금 계산기', '팀 규모에 맞는 월 환산 요금을 확인하세요.', [group([
  field('요금제', select('form/plan', [['team', 'Team · 1인 월 15,000원'], ['pro', 'Pro · 1인 월 25,000원']])),
  field('결제 주기', select('form/billing', [['monthly', '월간'], ['yearly', '연간 · 20% 할인']])),
  field('사용 인원', bound('Slider', 'form/seats', { type: 'single', min: 1, max: 20, step: 1, 'aria-label': '사용 인원' }), '1명부터 20명까지 선택'),
  text('Typography', format('${/states/quote/seats}명 · ${/states/quote/billing}'), { variant: 'muted' }),
  node('Separator'),
  text('Typography', format('월 ${/states/quote/monthly}원'), { as: 'p', variant: 'h2' }),
])], [button('견적 보관', { receipt: read('quote') })]),
notice('견적을 보관했습니다', format('${/states/receipt/plan} · ${/states/receipt/seats}명 · 월 ${/states/receipt/monthly}원'), read('saved')),
]);

export const scenarios = [profile, customers, booking, dashboard, pricing];
export const scenarioBySlug = new Map(scenarios.map(item => [item.slug, item]));
