import { scenarioDefinitions } from './scenarios';
import type {
  ActionSpec, AnyResource, ComponentNode, InputExpressions, JsonValue, QuerySpec,
  ResourceStateDeclaration, Schema, Step, ValueExpression, ViewSpec,
} from '@viewstem/core';

export type Locale = 'en' | 'ko';
export type ExampleDefinition = {
  view: ViewSpec;
  resources?: readonly AnyResource[];
  inputs?: Record<string, JsonValue>;
  fixture?: 'availability' | 'reservation';
};

const path = (value: string) => ({ '@path': value });
const read = (name: string) => path(`/states/${name}`);
const port = (name: string) => path(`/ports/${name}`);
const data = (name: string, field = '') => path(`/queries/${name}/data${field ? '/' + field : ''}`);
const format = (value: string) => ({ '@call': 'formatString', args: { value } });
const string = { type: 'string' } as const;
const integer = { type: 'integer' } as const;
const bool = { type: 'boolean' } as const;
const valuePort = (schema: Schema) => ({ kind: 'Value', schema, required: true } as const);
const statePort = (schema: Schema) => ({ kind: 'State', schema, required: true } as const);
const state = (schema: Schema, initial: JsonValue): ResourceStateDeclaration => ({ kind: 'State', schema, initial });
const node = (id: string, name: string, inputs?: InputExpressions): ComponentNode => ({
  id, componentRef: `shadcn.${name}`, ...(inputs ? { inputs } : {}),
});
const layout = (id: string, name: string, children: ComponentNode[]): ComponentNode => ({
  ...node(id, name), slots: { default: children },
});
const stack = (id: string, ...children: ComponentNode[]) => layout(id, 'Field.Group', children);
const text = (id: string, value: ValueExpression, variant = 'p', as = 'p') =>
  node(id, 'Typography', { text: value, as, variant });
const heading = (id: string, value: ValueExpression) => text(id, value, 'h3', 'h3');
const result = (id: string, value: ValueExpression) =>
  node(id, 'Alert.Root', { text: value, role: 'status' });
const button = (id: string, label: string) => node(id, 'Button', { text: label, type: 'button' });
const meter = (id: string, label: ValueExpression, value: ValueExpression, max: ValueExpression) =>
  node(id, 'Progress', { 'aria-label': label, value, max });
const write = (target: string, value: ValueExpression): Step => ({ kind: 'SetState', target: port(target), value });
const action = (target: string, schema: Schema, steps: readonly Step[]): ActionSpec => ({
  ports: { [target]: statePort(schema) }, steps,
});
const connect = (control: ComponentNode, event: string, spec: ActionSpec, inputs: InputExpressions, id = `${control.id}-action`): ComponentNode => ({
  ...control, on: { [event]: { id, action: spec, inputs } },
});
const click = (id: string, label: string, spec: ActionSpec, inputs: InputExpressions) =>
  connect(button(id, label), 'click', spec, inputs);
const set = (id: string, label: string, target: string, schema: Schema, value: ValueExpression) =>
  click(id, label, action('target', schema, [write('target', value)]), { target: read(target) });
const bind = (control: ComponentNode, event: string, target: string, schema: Schema) => connect(control, event, {
  ports: { target: statePort(schema), next: valuePort(schema) },
  steps: [write('target', port('next'))],
}, { target: read(target), next: path('/event/value') });
const field = (id: string, label: string, control: ComponentNode) =>
  layout(`${id}-field`, 'Field.Field', [node(`${id}-label`, 'Label', { for: id, text: label }), control]);
const input = (id: string, label: string, stateName: string) => field(id, label,
  bind(node(id, 'Input', { id, value: read(stateName) }), 'input', stateName, string));
const select = (id: string, label: string, stateName: string, options: [string, string][]) => {
  const control = layout(id, 'NativeSelect.Root', options.map(([value, label], index) =>
    node(`${id}-option-${index}`, 'NativeSelect.Option', { value, text: label })));
  return field(id, label, bind({ ...control, inputs: { id, value: read(stateName) } }, 'change', stateName, string));
};
const toggle = (id: string, label: string, stateName: string) => field(id, label,
  bind(node(id, 'Switch', { id, checked: read(stateName) }), 'checkedChange', stateName, bool));
const repeat = (component: ComponentNode, items: ValueExpression): ComponentNode => ({
  ...component, repeat: { items, as: 'item', key: path('/repeat/item/id') },
});
const query = (input: ValueExpression): QuerySpec => ({ sources: {}, transform: { input } });
const alert = (id: string, title: string, description: string) =>
  layout(id, 'Alert.Root', [
    node(`${id}-title`, 'Alert.Title', { text: title }),
    node(`${id}-description`, 'Alert.Description', { text: description }),
  ]);

export const libraryEndpoint = {
  baseUrl: 'https://library.example.test',
  availability: { method: 'GET', path: '/availability' },
  reservation: { method: 'POST', path: '/reservations' },
} as const;

export function exampleDefinitions(locale: Locale) {
  const t = (en: string, ko: string) => locale === 'ko' ? ko : en;
  const point = t('points', '점');
  const north = t('North trail', '북쪽 산책로');
  const south = t('South trail', '남쪽 산책로');
  const am = t('Morning', '오전');
  const pm = t('Afternoon', '오후');

  const library: AnyResource = { kind: 'Datasource', id: 'library-api', spec: { kind: 'Http', baseUrl: libraryEndpoint.baseUrl } };
  const availability: QuerySpec = {
    sources: { main: { datasourceRef: 'library-api', request: libraryEndpoint.availability } },
    transform: { input: path('/sources/main/availability') },
  };
  const seatCount = () => result('free-seats', format(t('${/queries/seats/data/free} of ${/queries/seats/data/total} seats free', '전체 ${/queries/seats/data/total}석 중 ${/queries/seats/data/free}석 이용 가능')));
  const routeLabel = (id: string, label: ValueExpression, distance: ValueExpression) =>
    layout(id, 'Card.Root', [
      layout('route-header', 'Card.Header', [node('route-name', 'Card.Title', { text: label })]),
      layout('route-content', 'Card.Content', [text('route-distance', distance)]),
    ]);
  const lamp = (label: ValueExpression, levelPath: string) => stack('lamp',
    heading('room', label),
    result('brightness', format(t(`\${${levelPath}}% brightness`, `밝기 \${${levelPath}}%`))),
    meter('brightness-meter', label, path(levelPath), 100),
    click('dim', t('Dim to 25%', '25%로 낮추기'), action('level', integer, [write('level', 25)]), { level: path(levelPath) }),
    click('brighten', t('Raise to 80%', '80%로 높이기'), action('level', integer, [write('level', 80)]), { level: path(levelPath) }),
  );

  return {
    ...scenarioDefinitions(locale),
    'first-view': { view: { render: node('trail-title', 'Typography', { text: t('Riverside trail guide', '강변 산책로 안내'), as: 'h2', variant: 'h2' }) } },
    'component-inputs': { view: { render: stack('reservation',
      heading('event', t('Stargazing night', '별 관측의 밤')),
      text('capacity', t('No seats left for Friday.', '금요일은 빈자리가 없습니다.')),
      node('reserve', 'Button', { text: t('Reserve Friday', '금요일 예약'), variant: 'outline', disabled: true }),
      node('waitlist', 'Button', { text: t('Join the waitlist', '대기 명단 등록'), variant: 'secondary' }),
    ) } },
    'slots': { view: { render: layout('reading-card', 'Card.Root', [
      layout('header', 'Card.Header', [
        node('book', 'Card.Title', { text: t('The Moon Atlas', '달 지도') }),
        node('category', 'Card.Description', { text: t('Illustrated astronomy', '그림으로 읽는 천문학') }),
      ]),
      layout('summary', 'Card.Content', [text('summary-text', t('A guide to recognizing the features of the Moon.', '달 표면의 특징을 알아보는 안내서입니다.'))]),
      layout('footer', 'Card.Footer', [node('stock', 'Badge', { text: t('Available to borrow', '대출 가능'), variant: 'secondary' })]),
    ]) } },
    'conditions': { view: { render: stack('trail-bulletin',
      heading('trail', north),
      text('distance', t('2.4 km · Starts at the lake', '2.4km · 호수에서 출발')),
      { ...alert('closure', t('Footbridge closed', '보행교 통제'), t('Take the signed detour along the lake.', '호숫가에 표시된 우회로를 이용하세요.')),
        inputs: { variant: 'destructive' }, when: false },
    ) } },
    'repeat': { view: { render: stack('walks', heading('walks-heading', t('Choose a walking route', '산책 코스 고르기')),
      repeat(routeLabel('trail', path('/repeat/item/name'), format(t('${/repeat/item/km} km · ${/repeat/item/minutes} min', '${/repeat/item/km}km · ${/repeat/item/minutes}분'))), [
        { id: 'north', name: north, km: 2.4, minutes: 35 },
        { id: 'south', name: south, km: 4.8, minutes: 70 },
      ]),
    ) } },
    'view-inputs': { inputs: { trail: north, minutes: 35 }, view: {
      ports: { trail: valuePort(string), minutes: valuePort(integer) },
      render: routeLabel('trail', port('trail'), format(t('Estimated time: ${/ports/minutes} min', '예상 소요 시간 ${/ports/minutes}분'))),
    } },
    'port-default': { inputs: {}, view: {
      ports: { language: { kind: 'Value', schema: string, default: t('English', '한국어') } },
      render: stack('audio-guide', heading('guide', t('Museum audio guide', '박물관 음성 안내')),
        text('language', format(t('Guide language: ${/ports/language}', '안내 언어: ${/ports/language}')))),
    } },
    'value-call': { inputs: { start: '10:30', room: t('Studio B', '작업실 B') }, view: {
      ports: { start: valuePort(string), room: valuePort(string) },
      render: stack('workshop', heading('event', t('Printmaking workshop', '판화 워크숍')),
        text('schedule', format(t('Starts at ${/ports/start} in ${/ports/room}', '${/ports/start} · ${/ports/room}')))),
    } },
    'state': { view: {
      states: { readPages: state({ type: 'integer', minimum: 0, maximum: 120 }, 42) },
      render: stack('reading', heading('book', t('Reading journal', '독서 기록')),
        meter('reading-progress', t('Pages read', '읽은 쪽수'), read('readPages'), 120),
        text('reading-count', format(t('${/states/readPages} of 120 pages read', '120쪽 중 ${/states/readPages}쪽 읽음')))),
    } },
    'set-state': { view: {
      states: { water: state(integer, 250) },
      render: stack('water', heading('goal', t('Water break', '물 마시기')),
        meter('level', t('Water in your bottle', '물병에 남은 물'), read('water'), 750),
        result('current', format(t('${/states/water} mL in the bottle', '물병에 ${/states/water}mL'))),
        set('refill', t('Refill bottle', '물병 채우기'), 'water', integer, 750),
        set('empty', t('Empty bottle', '물병 비우기'), 'water', integer, 0)),
    } },
    'event-payload': { view: {
      states: { name: state(string, t('Nari', '나리')) },
      render: stack('name-tag', input('visitor', t('Name on the tag', '이름표에 적을 이름'), 'name'),
        layout('tag', 'Card.Root', [layout('tag-header', 'Card.Header', [
          node('tag-title', 'Card.Description', { text: t('VISITOR', '방문자') }),
          node('tag-name', 'Card.Title', { text: read('name') }),
        ])])),
    } },
    'conditional-ui': { view: {
      states: { enabled: state(bool, false) },
      render: stack('recipe', heading('recipe-name', t('Lemon tea', '레몬차')), text('recipe-line', t('Lemon, water, and honey', '레몬, 물, 꿀')),
        toggle('substitution', t('Show a vegan substitution', '비건 대체 재료 보기'), 'enabled'),
        { ...alert('substitute', t('Replace honey', '꿀 대체'), t('Use the same amount of maple syrup.', '같은 양의 메이플 시럽을 넣으세요.')), when: read('enabled') }),
    } },
    'derived': { view: {
      states: {
        title: state(string, t('Garden notes', '정원 일지')),
        length: {
          kind: 'Derived', schema: integer,
          variable: { ports: { title: valuePort(string) }, expression: 'size(title)' },
          inputs: { title: read('title') },
        },
      },
      render: stack('title-editor', input('entry-title', t('Journal title', '일지 제목'), 'title'),
        text('count', format(t('${/states/length} characters', '${/states/length}자')))),
    } },
    'state-reaction': { view: {
      states: { exhibition: state(string, 'moon'), seat: state(string, '') },
      reactions: [{ watch: [read('exhibition')], target: read('seat'), value: '' }],
      render: stack('booking', heading('booking-title', t('Planetarium booking', '천체관 예약')),
        select('exhibition', t('Show', '상영작'), 'exhibition', [['moon', t('Walking on the Moon', '달 위를 걷다')], ['stars', t('Birth of a Star', '별의 탄생')]]),
        select('seat', t('Seat', '좌석'), 'seat', [['', t('Choose a new seat', '좌석을 다시 선택하세요')], ['A1', 'A1'], ['A2', 'A2']])),
    } },
    'action-ref': {
      resources: [{ kind: 'Action', id: 'reset-timer', spec: action('timer', integer, [write('timer', 5)]) }],
      view: {
        states: { focus: state(integer, 25), breakTime: state(integer, 10) },
        render: stack('timers', ...[
          { id: 'focus', label: t('Focus', '집중') },
          { id: 'breakTime', label: t('Break', '휴식') },
        ].map(({ id, label }) => stack(id,
          result(`${id}-time`, format(t(`${label}: \${/states/${id}} min`, `${label}: \${/states/${id}}분`))),
          { ...button(`${id}-reset`, t(`Reset ${label.toLowerCase()} timer`, `${label} 타이머 초기화`)),
            on: { click: { actionRef: 'reset-timer', inputs: { timer: read(id) } } } },
        ))),
      },
    },
    'action-branch': { view: {
      states: { accessible: state(bool, false), route: state(string, t('Choose your route below.', '아래에서 이동 경로를 확인하세요.')) },
      render: stack('directions', heading('destination', t('Getting to the rooftop garden', '옥상 정원 가는 길')),
        toggle('step-free', t('I need a step-free route', '계단 없는 경로가 필요해요'), 'accessible'),
        click('route', t('Show route', '경로 보기'), {
          ports: { accessible: valuePort(bool), route: statePort(string) },
          steps: [{
            kind: 'If', condition: port('accessible'),
            then: [write('route', t('Take the lift from the east entrance to floor 4.', '동쪽 입구에서 엘리베이터로 4층까지 이동하세요.'))],
            else: [write('route', t('Take the central staircase to floor 4.', '중앙 계단으로 4층까지 올라가세요.'))],
          }],
        }, { accessible: read('accessible'), route: read('route') }),
        result('route-result', read('route'))),
    } },
    'action-assert': { view: {
      states: { confirmed: state(bool, false), seats: state(integer, 2) },
      render: stack('borrowing', heading('kit', t('Borrow a telescope', '망원경 빌리기')),
        toggle('confirm', t('I can return the kit before 8 PM', '저녁 8시 전에 반납할 수 있어요'), 'confirmed'),
        result('kits', format(t('${/states/seats} kits currently available', '대여 가능한 세트 ${/states/seats}개'))),
        click('borrow', t('Borrow one kit', '한 세트 빌리기'), {
          ports: { confirmed: valuePort(bool), seats: statePort(integer) },
          steps: [
            { kind: 'Assert', condition: port('confirmed'), message: t('Confirm the return time before borrowing.', '대여 전에 반납 시간을 확인하세요.') },
            write('seats', 1),
          ],
        }, { confirmed: read('confirmed'), seats: read('seats') })),
    } },
    'action-output': {
      resources: [{ kind: 'Action', id: 'make-pickup-slip', spec: {
        ports: { name: valuePort(string) }, steps: [],
        output: { schema: { type: 'object', properties: { recipient: string, counter: string }, required: ['recipient', 'counter'] },
          value: { recipient: port('name'), counter: 'B' } },
      } }],
      view: {
        states: { name: state(string, t('Nari', '나리')), slip: state(string, t('No pickup slip yet', '수령표가 아직 없습니다')) },
        render: stack('pickup', input('recipient', t('Recipient', '수령인'), 'name'),
          click('print', t('Prepare pickup slip', '수령표 만들기'), {
            ports: { name: valuePort(string), slip: statePort(string) },
            steps: [
              { kind: 'Action', id: 'ticket', actionRef: 'make-pickup-slip', inputs: { name: port('name') } },
              write('slip', format(t('${/steps/ticket/recipient}, pick up at counter ${/steps/ticket/counter}.', '${/steps/ticket/recipient} 님, ${/steps/ticket/counter} 창구에서 수령하세요.'))),
            ],
          }, { name: read('name'), slip: read('slip') }), result('slip', read('slip'))),
      },
    },
    'action-status': { view: {
      states: { closed: state(bool, false) },
      render: stack('departure', heading('departure-title', t('Ready to leave?', '출발해도 될까요?')),
        toggle('lid', t('Bottle lid is closed', '물병 뚜껑을 닫았어요'), 'closed'),
        click('check', t('Run departure check', '출발 전 점검'), {
          ports: { closed: valuePort(bool) },
          steps: [{ kind: 'Assert', condition: port('closed'), message: t('Close the bottle lid first.', '물병 뚜껑을 먼저 닫으세요.') }],
        }, { closed: read('closed') }),
        result('check-status', format(t('Last check: ${/actions/check-action/status}', '최근 점검: ${/actions/check-action/status}')))),
    } },
    'action-variable': { view: {
      states: { packs: state(string, '2'), seedlings: state(integer, 0) },
      render: stack('seeds', heading('sowing', t('Seedling tray planner', '모종 트레이 계획')),
        select('pack-count', t('Seed packs', '씨앗 봉투'), 'packs', [['2', '2'], ['3', '3'], ['4', '4']]),
        click('calculate', t('Count seedlings', '모종 수 계산'), {
          ports: { packs: valuePort(string), seedlings: statePort(integer) },
          steps: [
            { kind: 'Variable', id: 'total',
              spec: { ports: { packs: valuePort(string) }, expression: 'int(packs) * 6' }, inputs: { packs: port('packs') } },
            write('seedlings', path('/steps/total')),
          ],
        }, { packs: read('packs'), seedlings: read('seedlings') }),
        result('seedlings', format(t('${/states/seedlings} planting cells needed', '심을 칸 ${/states/seedlings}개 필요')))),
    } },
    'query-result': { view: {
      queries: { weather: { query: query({ place: t('Lakeside', '호숫가'), temperature: 18, wind: 12 }) } },
      render: stack('weather', heading('station', data('weather', 'place')),
        text('temperature', format(t('Temperature: ${/queries/weather/data/temperature} °C', '기온 ${/queries/weather/data/temperature}°C'))),
        text('wind', format(t('Wind: ${/queries/weather/data/wind} km/h', '바람 ${/queries/weather/data/wind}km/h')))),
    } },
    'query-inputs': { view: {
      states: { day: state(string, am) },
      queries: { timetable: { query: {
        sources: {},
        ports: { day: valuePort(string) },
        transform: {
          input: [{ window: port('day') }],
          steps: [{ kind: 'Join', mode: 'inner', right: [
            { window: am, departure: '09:15', gate: 'A' },
            { window: pm, departure: '14:40', gate: 'C' },
          ], on: [{ left: 'window', right: 'window' }] }],
        },
      }, inputs: { day: read('day') } } },
      render: stack('transport', select('session', t('Travel window', '이동 시간대'), 'day', [[am, am], [pm, pm]]),
        result('departure', format(t('${/queries/timetable/data/0/departure} · Gate ${/queries/timetable/data/0/gate}', '${/queries/timetable/data/0/departure} · ${/queries/timetable/data/0/gate} 출입구')))),
    } },
    'query-ref': {
      resources: [{ kind: 'Query', id: 'station-reading', spec: {
        ...query({ reading: format(t('${/ports/name}: ${/ports/temp} °C', '${/ports/name} 기온 ${/ports/temp}°C')) }),
        ports: { name: valuePort(string), temp: valuePort(integer) },
      } }],
      view: {
        queries: {
          valley: { queryRef: 'station-reading', inputs: { name: t('Valley', '계곡'), temp: 18 } },
          summit: { queryRef: 'station-reading', inputs: { name: t('Summit', '정상'), temp: 10 } },
        },
        render: stack('stations', heading('temperature-readings', t('Trail weather stations', '산책로 기상 관측소')),
          text('valley', data('valley', 'reading')), text('summit', data('summit', 'reading'))),
      },
    },
    'http-datasource': {
      fixture: 'availability', resources: [library],
      view: { queries: { seats: { query: availability } }, render: stack('availability',
        heading('room', data('seats', 'room')), seatCount(), meter('seat-meter', t('Available seats', '빈자리 수'), data('seats', 'free'), data('seats', 'total'))) },
    },
    'query-on-click': {
      fixture: 'reservation', resources: [library],
      view: {
        states: { name: state(string, t('Nari', '나리')), ticket: state(string, t('No reservation yet', '아직 예약하지 않았습니다')) },
        render: stack('reserve-room', heading('room', t('Reserve a media room slot', '미디어실 시간 예약')),
          input('guest', t('Name on reservation', '예약자 이름'), 'name'),
          click('reserve', t('Send sample reservation', '샘플 예약 요청'), {
            ports: { name: valuePort(string), ticket: statePort(string) },
            steps: [
              { kind: 'Query', id: 'reserved', spec: {
                sources: { main: { datasourceRef: 'library-api', request: { ...libraryEndpoint.reservation, body: { name: port('name'), slot: '14:00' } } } },
                transform: { input: path('/sources/main') }, ports: { name: valuePort(string) },
              }, inputs: { name: port('name') } },
              write('ticket', format(t('${/steps/reserved/code} · ${/steps/reserved/name} at ${/steps/reserved/slot}', '${/steps/reserved/code} · ${/steps/reserved/slot} ${/steps/reserved/name} 님'))),
            ],
          }, { name: read('name'), ticket: read('ticket') }), result('ticket', read('ticket'))),
      },
    },
    'query-gate': {
      fixture: 'availability', resources: [library],
      view: {
        states: { open: state(bool, false) },
        queries: { seats: { query: availability, executeWhen: read('open') } },
        render: stack('availability', toggle('show-seats', t('Check reading-room availability', '열람실 빈자리 조회'), 'open'),
          result('request-state', format(t('Query status: ${/queries/seats/status}', 'Query 상태: ${/queries/seats/status}'))),
          seatCount()),
      },
    },
    'refresh-query': {
      fixture: 'availability', resources: [library],
      view: {
        queries: { seats: { query: availability } },
        render: stack('manual-refresh', heading('room', data('seats', 'room')), seatCount(),
          click('refresh', t('Check for new availability', '빈자리 다시 확인'), {
            ports: { seats: { kind: 'Query', required: true } },
            steps: [{ kind: 'RefreshQuery', target: port('seats') }],
          }, { seats: path('/queries/seats') })),
      },
    },
    'query-polling': {
      fixture: 'availability', resources: [library],
      view: {
        states: { live: state(bool, false) },
        queries: { seats: { query: availability, intervalMs: 1500, autoRefreshWhen: read('live') } },
        render: stack('live-availability', heading('room', data('seats', 'room')), seatCount(),
          toggle('live', t('Keep checking automatically', '자동으로 계속 확인'), 'live')),
      },
    },
    'query-concat': { view: {
      queries: { scores: { query: { sources: {}, transform: {
        input: [{ id: 'a', owner: t('Blue team', '파랑 팀'), score: 18 }, { id: 'b', owner: t('Green team', '초록 팀'), score: 14 }],
        steps: [{ kind: 'Concat', with: [[{ id: 'c', owner: t('Orange team', '주황 팀'), score: 21 }]] }],
      } } } },
      render: stack('scoreboard', heading('scores-heading', t('Scores from both heats', '두 조의 경기 점수')),
        repeat(text('score', format(`\${/repeat/item/owner} · \${/repeat/item/score} ${point}`)), data('scores'))),
    } },
    'query-join': { view: {
      queries: { books: { query: { sources: {}, transform: {
        input: [{ id: 'moon', title: t('The Moon Atlas', '달 지도') }, { id: 'garden', title: t('Night Garden', '밤의 정원') }],
        steps: [{ kind: 'Join', mode: 'inner', right: [{ book: 'garden', shelf: 'C2' }, { book: 'moon', shelf: 'A4' }],
          on: [{ left: 'id', right: 'book' }] }],
      } } } },
      render: stack('catalog', heading('catalog-heading', t('Find a book on the shelf', '책이 있는 서가 찾기')),
        repeat(text('book', format(t('${/repeat/item/title} · Shelf ${/repeat/item/shelf}', '${/repeat/item/title} · ${/repeat/item/shelf} 서가'))), data('books'))),
    } },
    'query-sources': { view: {
      queries: { schedule: { query: {
        sources: {
          studio: { query: query([{ id: 'print', name: t('Printmaking', '판화'), time: '10:00', room: t('Studio', '작업실') }]) },
          garden: { query: query([{ id: 'seed', name: t('Seed exchange', '씨앗 나눔'), time: '13:30', room: t('Garden', '정원') }]) },
        },
        transform: { input: path('/sources/studio'), steps: [{ kind: 'Concat', with: [path('/sources/garden')] }] },
      } } },
      render: stack('schedule', heading('today', t('Today at the community center', '오늘의 커뮤니티 센터 일정')),
        repeat(text('session', format('${/repeat/item/time} · ${/repeat/item/name} · ${/repeat/item/room}')), data('schedule'))),
    } },
    'reusable-component': {
      resources: [{ kind: 'Component', id: 'route-card', spec: {
        ports: { name: valuePort(string), km: valuePort({ type: 'number' }), minutes: valuePort(integer) },
        render: routeLabel('trail', port('name'), format(t('${/ports/km} km · ${/ports/minutes} min', '${/ports/km}km · ${/ports/minutes}분'))),
      } }],
      view: { render: stack('walking-routes',
        { id: 'north', componentRef: 'route-card', inputs: { name: north, km: 2.4, minutes: 35 } },
        { id: 'south', componentRef: 'route-card', inputs: { name: south, km: 4.8, minutes: 70 } },
      ) },
    },
    'inline-component': { view: {
      render: stack('weather', heading('station', t('Forecast for the campsite', '캠핑장 예보')), {
        id: 'forecast',
        component: {
          ports: { minimum: valuePort(integer), maximum: valuePort(integer) },
          render: layout('forecast-card', 'Alert.Root', [
            node('notice', 'Alert.Title', { text: t('Overnight temperature', '밤사이 기온') }),
            node('range', 'Alert.Description', { text: format('${/ports/minimum}–${/ports/maximum} °C') }),
          ]),
        },
        inputs: { minimum: 5, maximum: 11 },
      }),
    } },
    'component-state': {
      resources: [{ kind: 'Component', id: 'room-lamp', spec: {
        ports: { room: valuePort(string) }, states: { level: state(integer, 60) }, render: lamp(port('room'), '/states/level'),
      } }],
      view: { render: stack('lighting',
        { id: 'desk', componentRef: 'room-lamp', inputs: { room: t('Desk lamp', '책상 조명') } },
        node('divider', 'Separator'),
        { id: 'bed', componentRef: 'room-lamp', inputs: { room: t('Bedside lamp', '침대 옆 조명') } },
      ) },
    },
    'shared-state-port': {
      resources: [{ kind: 'Component', id: 'shared-lamp', spec: {
        ports: { room: valuePort(string), level: statePort(integer) }, render: lamp(port('room'), '/ports/level'),
      } }],
      view: {
        states: { level: state(integer, 60), independent: state(integer, 40) },
        render: stack('lighting',
          { id: 'wall', componentRef: 'shared-lamp', inputs: { room: t('Wall control', '벽 스위치'), level: read('level') } },
          node('divider', 'Separator'),
          { id: 'remote', componentRef: 'shared-lamp', inputs: { room: t('Remote control', '리모컨'), level: read('level') } },
        ),
      },
    },
    'forward-slot': {
      resources: [{ kind: 'Component', id: 'event-shell', spec: {
        ports: { title: valuePort(string) }, slots: { details: { required: true } },
        render: layout('shell', 'Card.Root', [
          layout('title', 'Card.Header', [node('event-title', 'Card.Title', { text: port('title') })]),
          { ...node('body', 'Card.Content'), slots: { default: path('/slots/details') } },
        ]),
      } }],
      view: { render: stack('events',
        { id: 'walk', componentRef: 'event-shell', inputs: { title: t('Bird walk', '새 관찰 산책') },
          slots: { details: [text('meeting', t('Meet by the lake at 08:00.', '08:00에 호숫가에서 만나요.'))] } },
        { id: 'class', componentRef: 'event-shell', inputs: { title: t('Drawing class', '드로잉 수업') },
          slots: { details: [text('supplies', t('Bring a pencil and a sketchbook.', '연필과 스케치북을 가져오세요.'))] } },
      ) },
    },
    'component-event': {
      resources: [{ kind: 'Component', id: 'time-choice', spec: {
        ports: { time: valuePort(string), room: valuePort(string) },
        events: { choose: { schema: { type: 'object', properties: { time: string, room: string }, required: ['time', 'room'] } } },
        render: { ...node('pick', 'Button', { text: port('time') }),
          on: { click: { emit: 'choose', payload: { time: port('time'), room: port('room') } } } },
      } }],
      view: {
        states: { booking: state(string, t('No session selected', '선택한 회차가 없습니다')) },
        render: stack('workshop', heading('session-heading', t('Pick a workshop session', '워크숍 회차 선택')), ...[['10:00', 'A'], ['14:30', 'B']].map(([time, room]) => ({
          id: `room-${room}`, componentRef: 'time-choice', inputs: { time, room },
          on: { choose: {
            action: { ports: { booking: statePort(string), selection: valuePort(string) }, steps: [write('booking', port('selection'))] },
            inputs: { booking: read('booking'), selection: format(t('${/event/time} · Room ${/event/room}', '${/event/time} · ${/event/room}실')) },
          } },
        })), result('selection', read('booking'))),
      },
    },
    'variable-ref': {
      resources: [{ kind: 'Variable', id: 'whole-trays', spec: {
        ports: { plants: valuePort(integer), cells: valuePort(integer) }, expression: '(plants + cells - 1) / cells',
      } }],
      view: {
        states: {
          basil: { kind: 'Derived', schema: integer, variableRef: 'whole-trays', inputs: { plants: 13, cells: 6 } },
          parsley: { kind: 'Derived', schema: integer, variableRef: 'whole-trays', inputs: { plants: 8, cells: 6 } },
        },
        render: stack('trays', heading('trays-heading', t('Trays with six cells each', '한 판에 여섯 칸인 모종 트레이')),
          text('basil', format(t('13 basil seedlings: ${/states/basil} trays', '바질 모종 13개: 트레이 ${/states/basil}판'))),
          text('parsley', format(t('8 parsley seedlings: ${/states/parsley} trays', '파슬리 모종 8개: 트레이 ${/states/parsley}판')))),
      },
    },
    'shared-type': {
      resources: [{ kind: 'Type', id: 'energy-level', spec: { schema: { type: 'integer', enum: [20, 50, 80] } } }],
      inputs: { outbound: 80, returnTrip: 20 },
      view: {
        ports: {
          outbound: { kind: 'Value', typeRef: 'energy-level', required: true },
          returnTrip: { kind: 'Value', typeRef: 'energy-level', required: true },
        },
        render: stack('battery', heading('battery-heading', t('Bike battery estimates', '전기 자전거 배터리 예상치')),
          text('outbound', format(t('At departure: ${/ports/outbound}%', '출발할 때 ${/ports/outbound}%'))),
          meter('outbound-progress', t('Departure battery', '출발 시 배터리'), port('outbound'), 100),
          text('return', format(t('On return: ${/ports/returnTrip}%', '돌아올 때 ${/ports/returnTrip}%'))),
          meter('return-progress', t('Return battery', '돌아올 때 배터리'), port('returnTrip'), 100)),
      },
    },
  } satisfies Record<string, ExampleDefinition>;
}

export type ExampleId = keyof ReturnType<typeof exampleDefinitions>;
