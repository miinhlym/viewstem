// The catalog fixtures are plain ViewSpec data mounted by the browser tests.
const string = { type: 'string' };
const number = { type: 'number' };
const boolean = { type: 'boolean' };
const p = path => ({ '@path': path });
const state = (initial, schema = true) => ({ kind: 'State', schema, initial });
const read = name => p('/states/' + name);
const node = (ref, inputs = {}, children = [], extra = {}) => ({
  componentRef: 'shadcn.' + ref,
  ...(Object.keys(inputs).length ? { inputs } : {}),
  ...(children.length ? { slots: { default: children } } : {}),
  ...extra,
});
const text = (ref, value, inputs = {}, children = []) => node(ref, { ...inputs, text: value }, children);
const group = (...children) => node('Field.Group', {}, children);
const button = (label, inputs = {}, on) => node('Button', { ...inputs, text: label }, [], on ? { on } : {});
const controlled = (name, schema, event = 'valueChange', source = p('/event/value')) => ({
  [event]: {
    action: {
      ports: { target: { kind: 'State', schema, required: true }, next: { kind: 'Value', schema, required: true } },
      steps: [{ kind: 'SetState', target: p('/ports/target'), value: p('/ports/next') }],
    },
    inputs: { target: p('/states/' + name), next: source },
  },
});
const bound = (ref, name, schema, inputs = {}, property = 'value', event = 'valueChange', children = []) =>
  node(ref, { ...inputs, [property]: read(name) }, children, { on: controlled(name, schema, event) });
const avatar = (initials, src = '/missing-avatar.svg') => node('Avatar.Root', {}, [
  node('Avatar.Image', { src, alt: initials }), text('Avatar.Fallback', initials),
]);
const example = (slug, title, render, extra = {}) => {
  let index = 0;
  const identify = item => {
    const id = slug + '-' + ++index;
    return {
      id, ...item,
      ...(item.on ? { on: Object.fromEntries(Object.entries(item.on).map(([event, handler]) => [
        event, { id: id + '-' + event, ...handler },
      ])) } : {}),
      ...(item.slots ? { slots: Object.fromEntries(Object.entries(item.slots).map(([name, children]) => [name, children.map(identify)])) } : {}),
    };
  };
  return { slug, title, view: { ...extra, render: identify(render) } };
};

const metricRows = [
  { id: 'a', month: '1월', count: 34, target: 25 },
  { id: 'b', month: '2월', count: 43, target: 40 },
  { id: 'c', month: '3월', count: 39, target: 48 },
  { id: 'd', month: '4월', count: 58, target: 52 },
];
const sites = [{ value: 'seoul', label: '서울' }, { value: 'busan', label: '부산' }, { value: 'jeju', label: '제주' }];

function modal(family, heading, body, { nested = false } = {}) {
  const part = (name, inputs, children) => node(family + '.' + name, inputs, children);
  const label = (name, value, inputs) => text(family + '.' + name, value, inputs);
  const contents = [
    part('Header', {}, [
      label('Title', heading),
      label('Description', '선택한 작업 범위를 확인하세요.'),
    ]),
    text('Typography', body),
    part('Footer', {}, [label(family === 'AlertDialog' ? 'Cancel' : 'Close', '닫기'),
      ...(family === 'AlertDialog' ? [label('Action', '확인')] : [])]),
  ];
  if (family === 'AlertDialog') contents[0].slots.default.unshift(label('Media', '!'));
  if (nested) contents.splice(2, 0, part('NestedRoot', {}, [
    label('Trigger', '하위 세부 정보'),
    part('Content', {}, [label('Title', '세부 정보'), label('Description', '상위 패널에서 연결된 패널입니다.'), label('Close', '세부 정보 닫기')]),
  ]));
  return bound(family + '.Root', 'open', boolean, {}, 'open', 'openChange', [
    node(family + '.Trigger', {}, [], { slots: { child: [button(heading, { variant: 'outline' })] } }),
    part('Portal', {}, [
      part('Overlay', { 'aria-hidden': true, class: 'pointer-events-none' }),
      part('Content', {}, contents),
    ]),
  ]);
}

function menu(family, label) {
  const part = (name, inputs, children) => node(family + '.' + name, inputs, children);
  const entry = (name, value, inputs, children) => text(family + '.' + name, value, inputs, children);
  const actions = [
    part('Group', {}, [
      entry('GroupHeading', '문서 작업'),
      { ...part('Item', {}, [text('Typography', '사본 만들기', { as: 'span' }), entry('Shortcut', '⌘D')]), on: controlled('selection', string, 'select', '사본 만들기') },
      entry('Item', '이동', { disabled: true }),
    ]),
    part('Separator'),
    ...(family === 'DropdownMenu'
      ? [part('CheckboxGroup', { value: ['grid'] }, [entry('CheckboxItem', '격자 표시', { value: 'grid' })])]
      : [entry('CheckboxItem', '격자 표시', { checked: true })]),
    bound(family + '.RadioGroup', 'scope', string, {}, 'value', 'valueChange', [
      entry('RadioItem', '모든 문서', { value: 'all' }),
      entry('RadioItem', '내 문서', { value: 'mine' }),
    ]),
    part('Sub', {}, [entry('SubTrigger', '내보내기'), part('SubContent', {}, [
      { ...entry('Item', 'CSV'), on: controlled('selection', string, 'select', 'CSV 내보내기') },
    ])]),
    entry('Label', '선택한 문서에 적용'),
  ];
  const content = [entry('Trigger', label), part('Portal', {}, [part('Content', {}, actions)])];
  return group(
    part('Root', {}, family === 'Menubar' ? [part('Menu', { value: 'file' }, content)] : content),
    text('Typography', { '@call': 'formatString', args: { value: '선택한 작업: ${/states/selection}' } }),
  );
}
const menuState = { states: { selection: state('없음', string), scope: state('all', string) } };

function calendar(family) {
  return bound(family + '.Root', 'date', true, {
    locale: 'ko-KR', captionLayout: 'dropdown', placeholder: '2026-11-02',
    ...(family === 'Calendar' ? { type: 'single' } : {}),
  });
}

export const samples = [
  example('accordion', 'Accordion', bound('Accordion.Root', 'section', string, { type: 'single' }, 'value', 'valueChange', [
    node('Accordion.Item', { value: 'settings' }, [text('Accordion.Trigger', '작업 공간'), text('Accordion.Content', '이 영역에서 팀 설정을 변경합니다.')]),
    node('Accordion.Item', { value: 'billing' }, [text('Accordion.Trigger', '결제'), text('Accordion.Content', '다음 결제 예정일을 확인합니다.')]),
  ]), { states: { section: state('settings', string) } }),
  example('alert-dialog', 'Alert Dialog', modal('AlertDialog', '보고서 삭제', '삭제하면 초안을 복구할 수 없습니다.'), { states: { open: state(false, boolean) } }),
  example('alert', 'Alert', node('Alert.Root', { variant: 'destructive' }, [
    text('Alert.Title', '보고서를 저장하지 못했습니다'),
    text('Alert.Description', '네트워크 연결을 확인하고 다시 시도하세요.'),
    node('Alert.Action', {}, [button('다시 시도', { variant: 'outline', size: 'sm' })]),
  ])),
  example('aspect-ratio', 'Aspect Ratio', node('AspectRatio', { ratio: 16 / 9, class: 'max-w-md' }, [
    node('Card.Root', {}, [node('Card.Header', {}, [text('Card.Title', '16:9 프로젝트 미리보기'), text('Card.Description', '가로 폭에 맞춰 비율을 유지합니다.')])]),
  ])),
  example('attachment', 'Attachment', node('Attachment.Group', {}, [node('Attachment.Root', { state: 'done' }, [
    text('Attachment.Media', 'CSV'),
    node('Attachment.Content', {}, [text('Attachment.Title', '월별 현황.csv'), text('Attachment.Description', '12 KB · 내보낸 보고서')]),
    node('Attachment.Actions', {}, [text('Attachment.Action', '내려받기', { href: '#monthly-report' }), text('Attachment.Trigger', '파일 정보')]),
  ])])),
  example('avatar', 'Avatar', node('Avatar.Group', {}, [
    node('Avatar.Root', {}, [node('Avatar.Image', { src: '/missing-avatar.svg', alt: '서윤' }), text('Avatar.Fallback', 'SY'), text('Avatar.Badge', '●')]),
    avatar('MK'), text('Avatar.GroupCount', '+2'),
  ])),
  example('badge', 'Badge', group(text('Badge', '검토 중', { variant: 'secondary' }), text('Badge', '오류 2건', { variant: 'destructive' }))),
  example('breadcrumb', 'Breadcrumb', node('Breadcrumb.Root', {}, [node('Breadcrumb.List', {}, [
    node('Breadcrumb.Item', {}, [text('Breadcrumb.Link', '홈', { href: '#home' })]),
    node('Breadcrumb.Separator'),
    node('Breadcrumb.Item', {}, [node('Breadcrumb.Ellipsis')]),
    node('Breadcrumb.Separator'),
    node('Breadcrumb.Item', {}, [text('Breadcrumb.Page', '보고서')]),
  ])])),
  example('bubble', 'Bubble', node('Bubble.Group', {}, [
    node('Bubble.Root', { variant: 'muted' }, [text('Bubble.Content', '요청하신 월간 보고서입니다.'), text('Bubble.Reactions', '확인 2')]),
    node('Bubble.Root', { align: 'end' }, [text('Bubble.Content', '공유해 주셔서 감사합니다.')]),
  ])),
  example('button-group', 'Button Group', node('ButtonGroup.Root', {}, [
    text('ButtonGroup.Text', '정렬'), button('최신순', { variant: 'outline' }), node('ButtonGroup.Separator'), button('이름순', { variant: 'outline' }),
  ])),
  example('button', 'Button', group(
    button('저장', {}, controlled('saved', boolean, 'click', true)),
    button('저장할 변경이 없습니다', { variant: 'outline', disabled: true }),
    text('Typography', { '@call': 'formatString', args: { value: '저장 여부: ${/states/saved}' } }),
  ), { states: { saved: state(false, boolean) } }),
  example('calendar', 'Calendar', calendar('Calendar'), { states: { date: state('2026-11-02') } }),
  example('card', 'Card', node('Card.Root', { class: 'max-w-md' }, [
    node('Card.Header', {}, [text('Card.Title', '월간 리포트'), text('Card.Description', '팀 운영 지표를 요약합니다.'), node('Card.Action', {}, [text('Badge', '11월')])]),
    node('Card.Content', {}, [text('Typography', '이번 달 완료한 항목: 58개')]),
    node('Card.Footer', {}, [button('자세히 보기', { variant: 'outline' })]),
  ])),
  example('carousel', 'Carousel', node('Carousel.Root', { class: 'mx-auto max-w-xs' }, [
    node('Carousel.Content', {}, sites.map(site => node('Carousel.Item', {}, [node('Card.Root', {}, [node('Card.Content', {}, [text('Typography', site.label, { as: 'h3' })])])]))),
    node('Carousel.Previous'), node('Carousel.Next'),
  ])),
  example('chart', 'Chart', group(node('Chart.Container', { config: { count: { label: '처리량', color: 'var(--chart-1)' } }, style: 'aspect-ratio:auto' }, [text('Typography', '처리량과 목표 비교', { variant: 'muted' })]), node('Chart', {
    kind: 'line', label: '월별 처리량', data: metricRows, x: 'month',
    series: [{ id: 'processed', key: 'count', label: '처리량', color: 'var(--chart-1)' }, { id: 'target', key: 'target', label: '목표', color: 'var(--chart-2)' }],
  }))),
  example('checkbox', 'Checkbox', group(
    bound('Checkbox', 'enabled', boolean, { id: 'notifications' }, 'checked', 'checkedChange'),
    text('Label', '알림 받기', { for: 'notifications' }),
  ), { states: { enabled: state(false, boolean) } }),
  example('code-block', 'Code Block', node('CodeBlock.Root', {}, [
    node('CodeBlock.Header', {}, [text('CodeBlock.Title', 'report.js'), node('CodeBlock.Actions', {}, [node('CodeBlock.CopyButton', { value: 'const total = 58;' })])]),
    node('CodeBlock.Content', {}, [node('CodeBlock.Line', { code: 'const total = 58;' })]),
    text('CodeBlock.Footer', 'JavaScript · 1줄'),
  ])),
  example('collapsible', 'Collapsible', bound('Collapsible.Root', 'open', boolean, {}, 'open', 'openChange', [
    text('Collapsible.Trigger', '오류 세부 정보'), text('Collapsible.Content', '보고서 연결이 만료됐습니다.'),
  ]), { states: { open: state(false, boolean) } }),
  example('combobox', 'Combobox', bound('Combobox', 'site', string, { options: sites, placeholder: '지역 선택', searchPlaceholder: '지역 검색' }), { states: { site: state('seoul', string) } }),
  example('command', 'Command', group(
    bound('Command.Root', 'selected', string, {}, 'value', 'valueChange', [
      node('Command.Input', { placeholder: '명령 검색' }),
      node('Command.List', {}, [
        text('Command.Empty', '검색 결과가 없습니다.'),
        text('Command.Loading', '명령 목록 준비 중'),
        node('Command.Group', { heading: '보고서' }, [
          node('Command.Item', { value: 'open', keywords: ['보고서 열기'] }, [text('Typography', '보고서 열기', { as: 'span' }), text('Command.Shortcut', '⌘O')]),
          text('Command.LinkItem', '도움말', { href: '#help', value: 'help', keywords: ['도움말'] }),
        ]),
        node('Command.Separator'),
        node('Command.Group', { heading: '설정' }, [text('Command.Item', '환경 설정', { value: 'settings', keywords: ['환경 설정'] })]),
      ]),
    ]),
    node('Command.Dialog', { open: false, title: '명령 팔레트', description: '명령을 검색합니다.' }, [node('Command.Input', { placeholder: '팔레트 검색' }), node('Command.List', {}, [node('Command.Group', {}, [text('Command.Item', '열기', { value: 'open', keywords: ['열기'] })])])]),
  ), { states: { selected: state('', string) } }),
  example('context-menu', 'Context Menu', menu('ContextMenu', '여기를 마우스 오른쪽 버튼으로 클릭'), menuState),
  example('data-table', 'Data Table', node('DataTable', {
    data: p('/queries/metrics/data'), columns: [{ id: 'month', accessorKey: 'month', label: '월', filterable: true }, { id: 'count', accessorKey: 'count', label: '처리량', sortable: true }, { id: 'target', accessorKey: 'target', label: '목표', sortable: true }],
    sorting: read('sorting'), filter: read('filter'), selectedIds: read('selected'), pageIndex: read('page'), pageSize: 2,
  }, [], { on: { ...controlled('sorting', true, 'sortingChange'), ...controlled('filter', string, 'filterChange'), ...controlled('selected', true, 'selectedIdsChange'), ...controlled('page', number, 'pageIndexChange') } }),
  { states: { sorting: state([]), filter: state('', string), selected: state([]), page: state(0, number) }, queries: { metrics: { query: { sources: {}, transform: { input: metricRows } } } } }),
  example('date-picker', 'Date Picker', bound('DatePicker', 'date', true, { locale: 'ko-KR', min: '2026-11-01', max: '2026-11-30' }), { states: { date: state('2026-11-02') } }),
  example('dialog', 'Dialog', modal('Dialog', '보고서 공유', '링크를 받은 팀원만 보고서를 볼 수 있습니다.'), { states: { open: state(false, boolean) } }),
  example('drawer', 'Drawer', modal('Drawer', '필터 설정', '보고서 목록에서 표시할 조건을 선택합니다.', { nested: true }), { states: { open: state(false, boolean) } }),
  example('dropdown-menu', 'Dropdown Menu', menu('DropdownMenu', '문서 작업'), menuState),
  example('empty', 'Empty', node('Empty.Root', {}, [
    node('Empty.Header', {}, [text('Empty.Media', '＋', { variant: 'icon' }), text('Empty.Title', '아직 보고서가 없습니다'), text('Empty.Description', '첫 보고서를 만들어 팀에 공유하세요.')]),
    node('Empty.Content', {}, [button('보고서 만들기')]),
  ])),
  example('field', 'Field', node('Field.Set', {}, [
    text('Field.Legend', '연락처'), text('Field.Description', '보고서를 받을 주소를 입력하세요.'),
    node('Field.Group', {}, [
      node('Field.Field', { 'data-invalid': true }, [
        text('Field.Label', '이메일', { for: 'email' }),
        node('Field.Content', {}, [text('Field.Title', '업무용 주소'), node('Input', { id: 'email', type: 'email', value: 'invalid', 'aria-invalid': true }), text('Field.Error', '유효한 이메일 주소를 입력하세요.')]),
      ]),
      text('Field.Separator', '선택 항목'),
      node('Field.Field', {}, [text('Field.Label', '팀 이름', { for: 'team' }), node('Input', { id: 'team', value: '운영 팀' })]),
    ]),
  ])),
  example('hover-card', 'Hover Card', node('HoverCard.Root', {}, [
    text('HoverCard.Trigger', '@operations', { href: '#operations' }),
    node('HoverCard.Portal', {}, [node('HoverCard.Content', {}, [avatar('OP'), text('Typography', '운영 팀'), text('Typography', '일일 보고서와 운영 현황을 관리합니다.')])]),
  ])),
  example('input-group', 'Input Group', group(
    node('InputGroup.Root', {}, [
      node('InputGroup.Addon', {}, [text('InputGroup.Text', '검색')]),
      bound('InputGroup.Input', 'search', string, { placeholder: '보고서 제목' }, 'value', 'input'),
      node('InputGroup.Addon', { align: 'inline-end' }, [node('InputGroup.Button', { text: '지우기' }, [], { on: controlled('search', string, 'click', '') })]),
    ]),
    node('InputGroup.Root', {}, [
      node('InputGroup.Textarea', { placeholder: '보고서 설명', rows: 3 }),
      node('InputGroup.Addon', { align: 'block-end' }, [text('InputGroup.Text', '공유 전 내용을 확인하세요.')]),
    ]),
  ), { states: { search: state('', string) } }),
  example('input-otp', 'Input OTP', bound('InputOtp.Root', 'code', string, { maxlength: 6, pattern: '^[0-9]*$', 'aria-label': '인증 코드' }, 'value', 'valueChange', [
    node('InputOtp.Group', {}, [0, 1, 2].map(index => node('InputOtp.Slot', { cell: p('/states/cells/' + index) }))),
    node('InputOtp.Separator'),
    node('InputOtp.Group', {}, [3, 4, 5].map(index => node('InputOtp.Slot', { cell: p('/states/cells/' + index) }))),
  ]), { states: {
    code: state('', string),
    cells: { kind: 'Derived', schema: { type: 'array' }, variable: {
      ports: { code: { kind: 'Value', schema: string, required: true } },
      expression: "[0,1,2,3,4,5].map(i, {'char': i < size(code) ? code.substring(i, i + 1) : '', 'isActive': i == size(code), 'hasFakeCaret': false})",
    }, inputs: { code: read('code') } },
  } }),
  example('input', 'Input', group(text('Label', '이름', { for: 'name' }), bound('Input', 'name', string, { id: 'name', placeholder: '이름을 입력하세요' }, 'value', 'input')), { states: { name: state('서윤', string) } }),
  example('item', 'Item', node('Item.Group', {}, [
    node('Item.Root', { variant: 'outline' }, [
      text('Item.Media', 'PDF', { variant: 'icon' }),
      node('Item.Content', {}, [node('Item.Header', {}, [text('Item.Title', '운영 보고서')]), text('Item.Description', '오늘 오전에 작성한 보고서입니다.'), text('Item.Footer', '11월 2일')]),
      node('Item.Actions', {}, [button('열기', { size: 'sm', variant: 'outline' })]),
    ]),
    node('Item.Separator'),
    node('Item.Root', {}, [node('Item.Content', {}, [text('Item.Title', '팀 현황')])]),
  ])),
  example('kbd', 'Kbd', node('Kbd.Group', {}, [text('Kbd.Root', '⌘'), text('Kbd.Root', 'K')])),
  example('label', 'Label', group(text('Label', '검색어', { for: 'label-example' }), node('Input', { id: 'label-example', placeholder: '라벨을 클릭해 포커스 이동' }))),
  example('marker', 'Marker', node('Marker.Root', { role: 'status' }, [text('Marker.Icon', '✓'), text('Marker.Content', '보고서 생성 완료')])),
  example('menubar', 'Menubar', menu('Menubar', '파일'), menuState),
  example('message-scroller', 'Message Scroller', node('MessageScroller.Provider', {}, [
    node('MessageScroller.Root', { style: 'height: 12rem' }, [
      node('MessageScroller.Viewport', {}, [node('MessageScroller.Content', {}, Array.from({ length: 16 }, (_, index) =>
        node('MessageScroller.Item', {}, [text('Typography', sites[index % sites.length].label + ' 보고서 ' + (index + 1) + ' 접수 완료')]),
      ))]),
      text('MessageScroller.Button', '최신 메시지'),
    ]),
  ])),
  example('message', 'Message', node('Message.Group', {}, [
    node('Message.Root', {}, [node('Message.Avatar', {}, [avatar('SY')]),
      node('Message.Content', {}, [text('Message.Header', '서윤 · 오전 10:00'), text('Bubble.Root', '보고서를 확인했습니다.'), text('Message.Footer', '읽음')]),
    ]),
  ])),
  example('native-select', 'Native Select', group(text('Label', '지역', { for: 'native-site' }), bound('NativeSelect.Root', 'site', string, { id: 'native-site' }, 'value', 'change', [
    node('NativeSelect.OptGroup', { label: '지역' }, sites.map(site => text('NativeSelect.Option', site.label, { value: site.value }))),
  ])), { states: { site: state('seoul', string) } }),
  example('navigation-menu', 'Navigation Menu', node('NavigationMenu.Root', {}, [
    node('NavigationMenu.List', {}, [
      node('NavigationMenu.Item', { value: 'docs' }, [
        text('NavigationMenu.Trigger', '문서'),
        node('NavigationMenu.Content', {}, [text('NavigationMenu.Link', '시작하기', { href: '#start' }), text('NavigationMenu.Link', 'API', { href: '#api' })]),
      ]),
      node('NavigationMenu.Item', { value: 'overview' }, [text('NavigationMenu.Link', '개요', { href: '#overview' })]),
      node('NavigationMenu.Indicator'),
    ]),
    node('NavigationMenu.Viewport'),
  ])),
  example('pagination', 'Pagination', node('Pagination.Root', { count: 96, perPage: 12, page: read('page') }, [
    node('Pagination.Content', {}, [
      node('Pagination.Item', {}, [node('Pagination.PrevButton')]),
      ...[1, 2, 3].map(page => node('Pagination.Item', {}, [text('Pagination.Link', String(page), { page: { type: 'page', value: page }, isActive: p('/states/activePage' + page) })])),
      node('Pagination.Item', {}, [node('Pagination.Ellipsis')]),
      node('Pagination.Item', {}, [node('Pagination.NextButton')]),
      node('Pagination.Item', {}, [node('Pagination.Previous')]),
      node('Pagination.Item', {}, [node('Pagination.Next')]),
    ]),
  ], { on: controlled('page', number, 'pageChange') }), { states: { page: state(1, number), ...Object.fromEntries([1, 2, 3].map(page => ['activePage' + page, { kind: 'Derived', schema: boolean, variable: { ports: { current: { kind: 'Value', schema: number, required: true } }, expression: 'current == ' + page + '.0' }, inputs: { current: read('page') } }])) } }),
  example('popover', 'Popover', bound('Popover.Root', 'open', boolean, {}, 'open', 'openChange', [
    text('Popover.Trigger', '알림 설정'),
    node('Popover.Portal', {}, [node('Popover.Content', {}, [
      node('Popover.Header', {}, [text('Popover.Title', '알림 설정'), text('Popover.Description', '필요한 채널만 활성화하세요.')]),
      text('Popover.Close', '완료'),
    ])]),
  ]), { states: { open: state(false, boolean) } }),
  example('progress', 'Progress', group(node('Progress', { value: read('progress'), max: 100, 'aria-label': '업로드 진행률' }), button('완료 표시', {}, controlled('progress', number, 'click', 100))), { states: { progress: state(58, number) } }),
  example('questionnaire', 'Questionnaire', node('Questionnaire.Root', { items: [{ name: 'format', required: true }, { name: 'detail', required: false }] }, [
    node('Questionnaire.Progress'),
    node('Questionnaire.Item', { name: 'format', required: true }, [
      text('Questionnaire.Title', '보고서 형식을 선택하세요'),
      text('Questionnaire.Description', '제출 전에 내용을 확인할 수 있습니다.'),
      node('Questionnaire.Choices', {}, [
        node('Questionnaire.Choice', { value: 'summary' }, [text('Typography', '간단한 요약', { as: 'span' }), text('Questionnaire.ChoiceDescription', '주요 지표만 포함합니다.')]),
        text('Questionnaire.Choice', '상세 보고서', { value: 'full' }),
        node('Questionnaire.Input', { placeholder: '기타 요청', 'aria-label': '기타 요청' }),
      ]),
      node('Questionnaire.Error'),
    ]),
    node('Questionnaire.Item', { name: 'detail' }, [
      text('Questionnaire.Title', '추가 범위를 선택하세요'),
      node('Questionnaire.Choices', {}, [text('Questionnaire.Choice', '지난달 비교', { value: 'comparison' })]),
    ]),
    node('Questionnaire.Actions', {}, [node('Questionnaire.Previous'), node('Questionnaire.Next'), node('Questionnaire.Skip'), node('Questionnaire.Submit')]),
  ], { on: controlled('submitted', boolean, 'submit', true) }), { states: { submitted: state(false, boolean) } }),
  example('radio-group', 'Radio Group', bound('RadioGroup.Root', 'site', string, { 'aria-label': '지역' }, 'value', 'valueChange', sites.flatMap(site => [
    node('RadioGroup.Item', { id: 'radio-' + site.value, value: site.value, disabled: site.value === 'jeju' }),
    text('Label', site.label, { for: 'radio-' + site.value }),
  ])), { states: { site: state('seoul', string) } }),
  example('range-calendar', 'Range Calendar', calendar('RangeCalendar'), { states: { date: state({ start: '2026-11-02', end: '2026-11-06' }) } }),
  example('resizable', 'Resizable', node('Resizable.PaneGroup', { direction: 'horizontal', class: 'min-h-32' }, [
    node('Resizable.Pane', { defaultSize: 45, minSize: 20 }, [text('Typography', '원본 문서')]),
    node('Resizable.Handle', { withHandle: true }),
    node('Resizable.Pane', { defaultSize: 55, minSize: 20 }, [text('Typography', '편집 결과')]),
  ])),
  example('scroll-area', 'Scroll Area', node('ScrollArea.Root', { class: 'h-36 w-56' }, [
    ...Array.from({ length: 16 }, (_, i) => text('Typography', '보고서 ' + (i + 1))),
    node('ScrollArea.Scrollbar', { orientation: 'horizontal' }),
  ])),
  example('select', 'Select', bound('Select.Root', 'site', string, { type: 'single' }, 'value', 'valueChange', [
    node('Select.Trigger', {}, [node('Select.Value', { placeholder: '지역 선택' })]),
    node('Select.Portal', {}, [node('Select.Content', {}, [
      node('Select.ScrollUpButton'),
      node('Select.Group', {}, [
        text('Select.GroupHeading', '운영 지역'),
        ...sites.map(site => text('Select.Item', site.label, { value: site.value, label: site.label })),
      ]),
      node('Select.Separator'), text('Select.Label', '지역을 선택하세요'), node('Select.ScrollDownButton'),
    ])]),
  ]), { states: { site: state('seoul', string) } }),
  example('separator', 'Separator', group(text('Typography', '프로젝트'), node('Separator', { decorative: false }), text('Typography', '팀 설정'))),
  example('sheet', 'Sheet', modal('Sheet', '내보내기 옵션', '파일 형식과 포함할 열을 확인하세요.'), { states: { open: state(false, boolean) } }),
  example('sidebar', 'Sidebar', node('Sidebar.Provider', { open: read('open') }, [
    node('Sidebar.Root', {}, [
      node('Sidebar.Header', {}, [text('Typography', '작업 공간'), node('Sidebar.Input', { placeholder: '메뉴 검색' })]),
      node('Sidebar.Content', {}, [
        node('Sidebar.Group', {}, [
          text('Sidebar.GroupLabel', '문서'),
          text('Sidebar.GroupAction', '＋', { 'aria-label': '문서 추가' }),
          node('Sidebar.GroupContent', {}, [node('Sidebar.Menu', {}, [
            node('Sidebar.MenuItem', {}, [
              text('Sidebar.MenuButton', '보고서', { isActive: true }),
              text('Sidebar.MenuAction', '⋯', { 'aria-label': '보고서 작업' }),
              text('Sidebar.MenuBadge', '3'),
              node('Sidebar.MenuSub', {}, [node('Sidebar.MenuSubItem', {}, [text('Sidebar.MenuSubButton', '월간 보고서', { href: '#monthly' })])]),
            ]),
            node('Sidebar.MenuItem', {}, [node('Sidebar.MenuSkeleton')]),
          ])]),
        ]),
      ]),
      node('Sidebar.Separator'),
      node('Sidebar.Footer', {}, [text('Typography', '운영 팀')]),
      node('Sidebar.Rail'),
    ]),
    node('Sidebar.Inset', {}, [node('Sidebar.Trigger'), text('Typography', '보고서 작업 공간', { as: 'h2' })]),
  ], { on: controlled('open', boolean, 'openChange') }), { states: { open: state(true, boolean) } }),
  example('skeleton', 'Skeleton', node('Card.Root', { class: 'max-w-xs', 'aria-busy': true }, [
    node('Card.Header', {}, [node('Skeleton', { class: 'h-5 w-32' }), node('Skeleton', { class: 'h-3 w-48' })]),
    node('Card.Content', {}, [node('Skeleton', { class: 'h-20 w-full' })]),
  ])),
  example('slider', 'Slider', bound('Slider', 'level', number, { type: 'single', min: 0, max: 100, step: 5, 'aria-label': '볼륨' }), { states: { level: state(35, number) } }),
  example('sonner', 'Sonner', group(
    node('Sonner', { position: 'top-right' }),
    node('Notifications', { notifications: read('messages'), position: 'bottom-right' }, [], { on: controlled('messages', true, 'dismiss', []) }),
    button('알림 보내기', {}, controlled('messages', true, 'click', [{ id: 'saved', title: '저장했습니다', description: '보고서 초안을 저장했습니다.', kind: 'success', duration: 4000 }])),
  ), { states: { messages: state([]) } }),
  example('spinner', 'Spinner', node('Button', { disabled: true }, [node('Spinner', { 'data-icon': 'inline-start', 'aria-label': '생성 중' }), text('Typography', '보고서 생성 중', { as: 'span' })])),
  example('switch', 'Switch', group(bound('Switch', 'enabled', boolean, { id: 'summary' }, 'checked', 'checkedChange'), text('Label', '주간 요약 받기', { for: 'summary' })), { states: { enabled: state(true, boolean) } }),
  example('table', 'Table', node('Table.Root', {}, [
    text('Table.Caption', '월별 운영 현황'),
    node('Table.Header', {}, [node('Table.Row', {}, [text('Table.Head', '월'), text('Table.Head', '처리량')])]),
    node('Table.Body', {}, metricRows.map(row => node('Table.Row', {}, [text('Table.Cell', row.month), text('Table.Cell', String(row.count))]))),
    node('Table.Footer', {}, [node('Table.Row', {}, [text('Table.Cell', '합계'), text('Table.Cell', '174')])]),
  ])),
  example('tabs', 'Tabs', bound('Tabs.Root', 'tab', string, {}, 'value', 'valueChange', [
    node('Tabs.List', {}, [text('Tabs.Trigger', '요약', { value: 'summary' }), text('Tabs.Trigger', '활동', { value: 'activity' }), text('Tabs.Trigger', '관리', { value: 'admin', disabled: true })]),
    text('Tabs.Content', '완료한 보고서 58개', { value: 'summary' }),
    text('Tabs.Content', '최근 7일 활동 내역', { value: 'activity' }),
  ]), { states: { tab: state('summary', string) } }),
  example('textarea', 'Textarea', group(text('Label', '보고서 메모', { for: 'notes' }), bound('Textarea', 'notes', string, { id: 'notes', rows: 4 }, 'value', 'input')), { states: { notes: state('다음 주에 검토합니다.\n팀에 초안을 공유했습니다.', string) } }),
  example('toggle-group', 'Toggle Group', bound('ToggleGroup.Root', 'mode', string, { type: 'single', variant: 'outline' }, 'value', 'valueChange', [
    text('ToggleGroup.Item', '목록', { value: 'list' }), text('ToggleGroup.Item', '격자', { value: 'grid' }),
  ]), { states: { mode: state('list', string) } }),
  example('toggle', 'Toggle', bound('Toggle', 'pinned', boolean, { variant: 'outline', text: '고정' }, 'pressed', 'pressedChange'), { states: { pinned: state(false, boolean) } }),
  example('tooltip', 'Tooltip', node('Tooltip.Provider', { delayDuration: 200 }, [
    node('Tooltip.Root', {}, [text('Tooltip.Trigger', '저장 단축키'), node('Tooltip.Portal', {}, [text('Tooltip.Content', '⌘S로 변경 사항을 저장합니다.')])]),
  ])),
  example('trace', 'Trace', node('Trace.Root', {}, [
    text('Trace.Icon', '✓'), text('Trace.Title', '보고서 수집'),
    text('Trace.Description', '원본 데이터를 모아 합계를 계산했습니다.'),
    node('Trace.Collapsible', {}, [
      text('Trace.CollapsibleTrigger', '실행 단계 보기'),
      node('Trace.CollapsibleContent', {}, [text('Trace.Line', '파일 4개 읽기'), text('Trace.Line', '174개 항목 집계')]),
    ]),
  ])),
  example('typography', 'Typography', group(
    text('Typography', '보고서 작성 가이드', { as: 'h1', variant: 'h1' }),
    text('Typography', '팀이 바로 사용할 수 있도록 요약과 근거를 함께 작성하세요.'),
    text('Typography', '측정 범위를 먼저 적습니다.', { as: 'blockquote', variant: 'blockquote' }),
    text('Typography', 'report.json', { as: 'code', variant: 'code' }),
  )),
];

export const sampleBySlug = new Map(samples.map(sample => [sample.slug, sample]));

/** These native parts require scoped context established in RawComposition.svelte. */
const calendarParts = ['Caption', 'Cell', 'Day', 'Grid', 'GridBody', 'GridHead', 'GridRow', 'HeadCell', 'Header', 'Heading', 'Month', 'Months', 'MonthSelect', 'Nav', 'NextButton', 'PrevButton', 'YearSelect'];
export const rawCompositionComponentIds = [
  ...['Calendar', 'RangeCalendar'].flatMap(family => calendarParts.map(part => 'shadcn.' + family + '.' + part)),
  'shadcn.Chart.Tooltip',
];

export function fixtureComponentIds(view) {
  const ids = new Set();
  function visit(node) {
    if (node.componentRef) ids.add(node.componentRef);
    if (node.component?.render) visit(node.component.render);
    for (const content of Object.values(node.slots ?? {})) {
      if (Array.isArray(content)) content.forEach(visit);
    }
  }
  visit(view.render);
  return ids;
}
