import { descriptions } from './component-demo-translations.mjs';

export const sonnerActionId = 'docs-show-toast';
export const sonnerToasterId = 'viewstem-docs-sonner';
export const sonnerToastId = 'viewstem-docs-sonner-demo';

// The examples supply one ViewSpec to both the preview and the JSON listing.
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
const group = (...children) => node('Field.Group', { style: 'align-items: flex-start' }, children);
const field = (control, label) => node('Field.Field', { orientation: 'horizontal' }, [control, label]);
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
const avatar = (initials, image) => node('Avatar.Root', {}, [
  ...(image ? [node('Avatar.Image', image)] : []),
  text('Avatar.Fallback', initials),
]);

function example(slug, title, render, extra = {}, instructions) {
  let index = 0;
  const identify = item => ({
    id: slug + '-' + ++index,
    ...item,
    ...(item.slots ? {
      slots: Object.fromEntries(Object.entries(item.slots).map(([name, children]) => [name, children.map(identify)])),
    } : {}),
  });
  return { slug, title, view: { ...extra, render: identify(render) }, ...(instructions ? { instructions } : {}) };
}

function buildDemos(locale) {
  const t = (en, ko) => locale === 'ko' ? ko : en;
  const metricRows = [
    { id: 'a', month: t('Jan', '1월'), count: 34, target: 25 },
    { id: 'b', month: t('Feb', '2월'), count: 43, target: 40 },
    { id: 'c', month: t('Mar', '3월'), count: 39, target: 48 },
    { id: 'd', month: t('Apr', '4월'), count: 58, target: 52 },
  ];
  const sites = [{ value: 'seoul', label: t('Seoul', '서울') }, { value: 'busan', label: t('Busan', '부산') }, { value: 'jeju', label: t('Jeju', '제주') }];

  function modal(family, heading, body) {
    const part = (name, inputs, children) => node(family + '.' + name, inputs, children);
    const label = (name, value, inputs) => text(family + '.' + name, value, inputs);
    const confirm = family === 'AlertDialog';
    return bound(family + '.Root', 'open', boolean, {}, 'open', 'openChange', [
      node(family + '.Trigger', {}, [], { slots: { child: [button(heading, { variant: 'outline' })] } }),
      part('Content', {}, [
        part('Header', {}, [label('Title', heading), label('Description', body)]),
        ...(!confirm ? [node('Field.Field', { ...(family === 'Sheet' || family === 'Drawer' ? { style: 'padding-inline: 1rem' } : {}) }, [
          text('Field.Label', family === 'Dialog' ? t('Report link', '보고서 링크') : t('File format', '파일 형식'), { for: family.toLowerCase() + '-setting' }),
          ...(family === 'Dialog' ? [node('Input', { id: 'dialog-setting', value: 'https://example.com/reports/monthly', readonly: true })] : [node('NativeSelect.Root', { id: family.toLowerCase() + '-setting', value: 'csv' }, [text('NativeSelect.Option', 'CSV', { value: 'csv' }), text('NativeSelect.Option', 'JSON', { value: 'json' })])]),
        ])] : []),
        part('Footer', {}, [
          ...(confirm ? [label('Cancel', t('Cancel', '취소'))] : [node(family + '.Close', {}, [], { slots: { child: [button(t('Close', '닫기'), { variant: 'outline' })] } })]),
          ...(confirm ? [{ ...label('Action', t('Delete', '삭제')), on: controlled('open', boolean, 'click', false) }] : []),
        ]),
      ]),
    ]);
  }

  const menuState = { states: { selection: state(t('No action selected', '선택한 작업 없음'), string) } };

  function menu(family, label) {
    const part = (name, inputs, children) => node(family + '.' + name, inputs, children);
    const entry = (name, value, inputs) => text(family + '.' + name, value, inputs);
    const select = value => ({
      ...entry('Item', value),
      on: controlled('selection', string, 'select', value),
    });
    const trigger = family === 'ContextMenu'
      ? entry('Trigger', label, { style: 'display: grid; min-height: 6rem; place-items: center; border: 1px dashed var(--border); border-radius: .5rem; padding: .75rem' })
      : family === 'Menubar' ? entry('Trigger', label)
      : node(family + '.Trigger', {}, [], { slots: { child: [button(label, { variant: 'outline' })] } });
    const content = [trigger, part('Content', {}, [
      part('Group', {}, [
      select(t('Duplicate', '사본 만들기')),
      select(t('Export CSV', 'CSV 내보내기')),
      ]),
      part('Separator'),
      part('Group', {}, [entry('Item', t('Delete', '삭제'), { disabled: true })]),
    ])];
    return group(
      part('Root', {}, family === 'Menubar' ? [
        part('Menu', { value: 'file' }, content),
        part('Menu', { value: 'edit' }, [entry('Trigger', t('Edit', '편집')), part('Content', {}, [part('Group', {}, [select(t('Undo', '실행 취소')), select(t('Redo', '다시 실행'))])])]),
        part('Menu', { value: 'view' }, [entry('Trigger', t('View', '보기')), part('Content', {}, [part('Group', {}, [select(t('Show details', '세부 정보 표시')), select(t('Refresh', '새로 고침'))])])]),
      ] : content),
      text('Typography', read('selection'), { variant: 'muted' }),
    );
  }

  function calendar(family) {
    return bound(family + '.Root', 'date', true, {
      locale: t('en-US', 'ko-KR'), captionLayout: 'dropdown', placeholder: '2026-11-02',
      ...(family === 'Calendar' ? { type: 'single' } : {}),
    });
  }

  return [
    example('accordion', 'Accordion', bound('Accordion.Root', 'section', string, { type: 'single' }, 'value', 'valueChange', [
      node('Accordion.Item', { value: 'settings' }, [text('Accordion.Trigger', t('Workspace', '작업 공간')), text('Accordion.Content', t('Change your team preferences here.', '이 영역에서 팀 설정을 변경합니다.'))]),
      node('Accordion.Item', { value: 'billing' }, [text('Accordion.Trigger', t('Billing', '결제')), text('Accordion.Content', t('Check your next billing date.', '다음 결제 예정일을 확인합니다.'))]),
    ]), { states: { section: state('settings', string) } }),
    example('alert-dialog', 'Alert Dialog', modal('AlertDialog', t('Delete draft', '보고서 삭제'), t('You will lose this draft permanently.', '삭제하면 초안을 복구할 수 없습니다.')), { states: { open: state(false, boolean) } }),
    example('alert', 'Alert', node('Alert.Root', { variant: 'destructive' }, [
      text('Alert.Title', t('Could not save the report', '보고서를 저장하지 못했습니다')),
      text('Alert.Description', t('Check your connection and try again.', '네트워크 연결을 확인하고 다시 시도하세요.')),
    ])),
    example('aspect-ratio', 'Aspect Ratio', node('AspectRatio', { ratio: 16 / 9 }, [
      node('Card.Root', { class: 'h-full justify-center' }, [
        node('Card.Header', {}, [text('Card.Title', t('16:9 project preview', '16:9 프로젝트 미리보기'))]),
      ]),
    ])),
    example('attachment', 'Attachment', node('Attachment.Root', { state: 'done' }, [
      text('Attachment.Media', 'CSV'),
      node('Attachment.Content', {}, [
        text('Attachment.Title', t('monthly-report.csv', '월별 현황.csv')),
        text('Attachment.Description', t('CSV · Monthly report', 'CSV · 월간 보고서')),
      ]),
      node('Attachment.Actions', {}, [
        text('Attachment.Action', t('Download', '내려받기'), {
          size: 'sm',
          href: 'data:text/csv,month%2Cprocessed%0A2026-11%2C58',
          download: 'monthly-report.csv',
        }),
      ]),
    ])),
    example('avatar', 'Avatar', node('Avatar.Group', {}, [
      avatar('VS', { src: '/brand/viewstem-mark.svg', alt: 'Viewstem' }),
      avatar(t('AV', 'SY')),
      text('Avatar.GroupCount', '+2'),
    ])),
    example('badge', 'Badge', node('Field.Group', { style: 'flex-direction: row; flex-wrap: wrap; gap: .5rem' }, [text('Badge', t('In review', '검토 중'), { variant: 'secondary' }), text('Badge', t('2 errors', '오류 2건'), { variant: 'destructive' })])),
    example('breadcrumb', 'Breadcrumb', node('Breadcrumb.Root', {}, [node('Breadcrumb.List', {}, [
      node('Breadcrumb.Item', {}, [text('Breadcrumb.Link', t('UI components', 'UI 컴포넌트'), { href: t('/docs/ui/components/', '/ko/docs/ui/components/') })]),
      node('Breadcrumb.Separator'),
      node('Breadcrumb.Item', {}, [text('Breadcrumb.Page', 'Breadcrumb')]),
    ])])),
    example('bubble', 'Bubble', node('Bubble.Group', {}, [
      node('Bubble.Root', { variant: 'muted' }, [text('Bubble.Content', t('Here is the monthly report you requested.', '요청하신 월간 보고서입니다.')), text('Bubble.Reactions', t('Seen by 2', '확인 2'))]),
      node('Bubble.Root', { align: 'end' }, [text('Bubble.Content', t('Thanks for sharing it.', '공유해 주셔서 감사합니다.'))]),
    ])),
    example('button-group', 'Button Group', group(
      node('ButtonGroup.Root', { 'aria-label': t('Sort', '정렬') }, [
        button(t('Newest', '최신순'), { variant: 'outline' }, controlled('sort', string, 'click', t('Sorted by date', '날짜순으로 정렬'))),
        node('ButtonGroup.Separator'),
        button(t('Name', '이름순'), { variant: 'outline' }, controlled('sort', string, 'click', t('Sorted by name', '이름순으로 정렬'))),
      ]),
      text('Typography', read('sort'), { variant: 'muted' }),
    ), { states: { sort: state(t('Sorted by date', '날짜순으로 정렬'), string) } }),
    example('button', 'Button', group(
      button(t('Save', '저장'), {}, controlled('saved', boolean, 'click', true)),
      button(t('Nothing to save', '저장할 변경이 없습니다'), { variant: 'outline', disabled: true }),
      text('Typography', { '@call': 'formatString', args: { value: t('Saved: ${/states/saved}', '저장 여부: ${/states/saved}') } }),
    ), { states: { saved: state(false, boolean) } }),
    example('calendar', 'Calendar', calendar('Calendar'), { states: { date: state('2026-11-02') } }),
    example('card', 'Card', node('Card.Root', { class: 'max-w-md' }, [
      node('Card.Header', {}, [
        text('Card.Title', t('Monthly report', '월간 보고서')),
        text('Card.Description', t('A summary of team operations.', '팀 운영 지표를 요약합니다.')),
      ]),
      node('Card.Content', {}, [text('Typography', t('58 items completed this month', '이번 달 완료한 항목 58개'))]),
    ])),
    example('carousel', 'Carousel', node('Carousel.Root', { style: 'margin-inline: auto; width: min(calc(100% - 6rem), 20rem)' }, [
      node('Carousel.Content', {}, sites.map(site => node('Carousel.Item', {}, [node('Card.Root', {}, [node('Card.Content', { style: 'aspect-ratio: 1; display: grid; place-items: center' }, [text('Typography', site.label, { variant: 'large' })])])]))),
      node('Carousel.Previous', { 'aria-label': t('Previous slide', '이전 슬라이드') }),
      node('Carousel.Next', { 'aria-label': t('Next slide', '다음 슬라이드') }),
    ])),
    example('chart', 'Chart', node('Chart', {
      kind: 'line', label: t('Monthly throughput', '월별 처리량'), data: metricRows, x: 'month',
      series: [
        { id: 'processed', key: 'count', label: t('Processed', '처리량'), color: 'var(--chart-1)' },
        { id: 'target', key: 'target', label: t('Target', '목표'), color: 'var(--chart-2)' },
      ],
    })),
    example('checkbox', 'Checkbox', field(
      bound('Checkbox', 'enabled', boolean, { id: 'notifications' }, 'checked', 'checkedChange'),
      text('Field.Label', t('Receive notifications', '알림 받기'), { for: 'notifications' }),
    ), { states: { enabled: state(false, boolean) } }),
    example('code-block', 'Code Block', node('CodeBlock.Root', {}, [
      node('CodeBlock.Header', {}, [text('CodeBlock.Title', 'report.js'), node('CodeBlock.Actions', {}, [node('CodeBlock.CopyButton', { value: 'const total = 58;', 'aria-label': t('Copy code', '코드 복사') })])]),
      node('CodeBlock.Content', {}, [node('CodeBlock.Line', { code: 'const total = 58;' })]),
      text('CodeBlock.Footer', t('JavaScript · 1 line', 'JavaScript · 1줄')),
    ])),
    example('collapsible', 'Collapsible', bound('Collapsible.Root', 'open', boolean, {}, 'open', 'openChange', [
      node('Collapsible.Trigger', {}, [], { slots: { child: [button(t('Error details', '오류 세부 정보'), { variant: 'outline' })] } }), text('Collapsible.Content', t('The report link has expired.', '보고서 연결이 만료됐습니다.')),
    ]), { states: { open: state(false, boolean) } }),
    example('combobox', 'Combobox', bound('Combobox', 'site', string, { options: sites, placeholder: t('Choose a location', '지역 선택'), searchPlaceholder: t('Search locations', '지역 검색') }), { states: { site: state('seoul', string) } }),
    example('command', 'Command', node('Command.Root', { 'aria-label': t('Report commands', '보고서 명령') }, [
      node('Command.Input', { placeholder: t('Search commands', '명령 검색') }),
      node('Command.List', {}, [
        text('Command.Empty', t('No matching commands.', '검색 결과가 없습니다.')),
        node('Command.Group', { heading: t('Reports', '보고서') }, [
          text('Command.Item', t('Open report', '보고서 열기'), { value: 'open', keywords: [t('Open report', '보고서 열기')] }),
          text('Command.Item', t('Export report', '보고서 내보내기'), { value: 'export', keywords: [t('Export report', '보고서 내보내기')] }),
        ]),
      ]),
    ])),
    example('context-menu', 'Context Menu', menu('ContextMenu', t('Right-click here', '여기를 마우스 오른쪽 버튼으로 클릭')), menuState),
    example('data-table', 'Data Table', node('DataTable', {
      data: p('/queries/metrics/data'), columns: [{ id: 'month', accessorKey: 'month', label: t('Month', '월'), filterable: true }, { id: 'count', accessorKey: 'count', label: t('Processed', '처리량'), sortable: true }, { id: 'target', accessorKey: 'target', label: t('Target', '목표'), sortable: true }],
      sorting: read('sorting'), filter: read('filter'), selectedIds: read('selected'), pageIndex: read('page'), pageSize: read('pageSize'),
      labels: { filter: t('Filter rows', '행 검색'), select: t('Select', '선택'), selectRow: t('Select row {id}', '{id}행 선택'), noRows: t('No rows.', '검색 결과가 없습니다.'), previous: t('Previous', '이전'), next: t('Next', '다음'), page: t('Page {page} of {pages}', '{pages}페이지 중 {page}페이지'), rowsPerPage: t('Rows per page', '페이지당 행 수') },
    }, [], { on: { ...controlled('sorting', true, 'sortingChange'), ...controlled('filter', string, 'filterChange'), ...controlled('selected', true, 'selectedIdsChange'), ...controlled('page', number, 'pageIndexChange'), ...controlled('pageSize', number, 'pageSizeChange') } }),
    { states: { sorting: state([]), filter: state('', string), selected: state([]), page: state(0, number), pageSize: state(2, number) }, queries: { metrics: { query: { sources: {}, transform: { input: metricRows } } } } }),
    example('date-picker', 'Date Picker', bound('DatePicker', 'date', true, { locale: t('en-US', 'ko-KR'), min: '2026-11-01', max: '2026-11-30' }), { states: { date: state('2026-11-02') } }),
    example('dialog', 'Dialog', modal('Dialog', t('Share report', '보고서 공유'), t('Only teammates with the link can view this report.', '링크를 받은 팀원만 보고서를 볼 수 있습니다.')), { states: { open: state(false, boolean) } }),
    example('drawer', 'Drawer', modal('Drawer', t('Filter reports', '필터 설정'), t('Choose which reports appear in the list.', '보고서 목록에서 표시할 조건을 선택합니다.')), { states: { open: state(false, boolean) } }),
    example('dropdown-menu', 'Dropdown Menu', menu('DropdownMenu', t('Document actions', '문서 작업')), menuState),
    example('empty', 'Empty', node('Empty.Root', {}, [
      node('Empty.Header', {}, [text('Empty.Media', '＋', { variant: 'icon' }), text('Empty.Title', t('No reports yet', '아직 보고서가 없습니다')), text('Empty.Description', t('Create a report to share with your team.', '첫 보고서를 만들어 팀에 공유하세요.'))]),
      node('Empty.Content', {}, [button(t('Create report', '보고서 만들기'), { href: t('/examples/', '/ko/examples/') })]),
    ])),
    example('field', 'Field', node('Field.Set', {}, [
      text('Field.Legend', t('Contact information', '연락처')), text('Field.Description', t('Enter the address that should receive reports.', '보고서를 받을 주소를 입력하세요.')),
      node('Field.Group', {}, [
        node('Field.Field', { 'data-invalid': true }, [
          text('Field.Label', t('Email', '이메일'), { for: 'email' }),
          node('Input', { id: 'email', type: 'email', value: 'invalid', 'aria-invalid': true, 'aria-describedby': 'email-error' }), text('Field.Error', t('Enter a valid email address.', '유효한 이메일 주소를 입력하세요.'), { id: 'email-error' }),
        ]),
        text('Field.Separator', t('Optional', '선택 항목')),
        node('Field.Field', {}, [text('Field.Label', t('Team name', '팀 이름'), { for: 'team' }), node('Input', { id: 'team', value: t('Operations team', '운영 팀') })]),
      ]),
    ])),
    example('hover-card', 'Hover Card', node('HoverCard.Root', {}, [
      node('HoverCard.Trigger', {}, [], { slots: { child: [button('@operations', { variant: 'link', href: t('/examples/', '/ko/examples/') })] } }),
      node('HoverCard.Content', {}, [
        avatar(t('OT', 'OP')),
        text('Typography', t('Operations team', '운영 팀')),
        text('Typography', t('Manages daily reports and operations.', '일일 보고서와 운영 현황을 관리합니다.')),
      ]),
    ])),
    example('input-group', 'Input Group', group(
      node('InputGroup.Root', {}, [
        node('InputGroup.Addon', {}, [text('InputGroup.Text', t('Search', '검색'))]),
        bound('InputGroup.Input', 'search', string, { placeholder: t('Report title', '보고서 제목'), 'aria-label': t('Search report titles', '보고서 제목 검색') }, 'value', 'input'),
        node('InputGroup.Addon', { align: 'inline-end' }, [node('InputGroup.Button', { text: t('Clear', '지우기') }, [], { on: controlled('search', string, 'click', '') })]),
      ]),
      node('InputGroup.Root', {}, [
        node('InputGroup.Textarea', { placeholder: t('Report description', '보고서 설명'), 'aria-label': t('Report description', '보고서 설명'), rows: 3 }),
        node('InputGroup.Addon', { align: 'block-end' }, [text('InputGroup.Text', t('Review this text before sharing.', '공유 전 내용을 확인하세요.'))]),
      ]),
    ), { states: { search: state('', string) } }),
    example('input-otp', 'Input OTP', bound('InputOtp.Root', 'code', string, { maxlength: 6, pattern: '^[0-9]*$', 'aria-label': t('Verification code', '인증 코드') }, 'value', 'valueChange', [
      node('InputOtp.Group', {}, [0, 1, 2].map(index => node('InputOtp.Slot', { cell: p('/states/cells/' + index) }))),
      node('InputOtp.Separator'),
      node('InputOtp.Group', {}, [3, 4, 5].map(index => node('InputOtp.Slot', { cell: p('/states/cells/' + index) }))),
    ]), { states: {
      code: state('', string),
      cells: { kind: 'Derived', schema: { type: 'array' }, variable: {
        ports: { code: { kind: 'Value', schema: string, required: true } },
        expression: '[0,1,2,3,4,5].map(i, {\'char\': i < size(code) ? code.substring(i, i + 1) : \'\', \'isActive\': i == size(code), \'hasFakeCaret\': false})',
      }, inputs: { code: read('code') } },
    } }),
    example('input', 'Input', node('Field.Field', {}, [text('Field.Label', t('Name', '이름'), { for: 'name' }), bound('Input', 'name', string, { id: 'name', placeholder: t('Enter your name', '이름을 입력하세요') }, 'value', 'input')]), { states: { name: state(t('Avery', '서윤'), string) } }),
    example('item', 'Item', node('Item.Group', {}, [
      node('Item.Root', { variant: 'outline' }, [
        text('Item.Media', 'PDF', { variant: 'icon' }),
        node('Item.Content', {}, [node('Item.Header', {}, [text('Item.Title', t('Operations report', '운영 보고서'))]), text('Item.Description', t('Written this morning.', '오늘 오전에 작성한 보고서입니다.')), text('Item.Footer', t('November 2', '11월 2일'))]),
        node('Item.Actions', {}, [button(t('Open', '열기'), { size: 'sm', variant: 'outline', href: t('/examples/', '/ko/examples/') })]),
      ]),
      node('Item.Separator'),
      node('Item.Root', {}, [node('Item.Content', {}, [text('Item.Title', t('Team status', '팀 현황'))])]),
    ])),
    example('kbd', 'Kbd', node('Kbd.Group', {}, [text('Kbd.Root', '⌘'), text('Kbd.Root', 'K')])),
    example('label', 'Label', node('Field.Field', {}, [text('Label', t('Search term', '검색어'), { for: 'label-example' }), node('Input', { id: 'label-example', placeholder: t('Click the label to focus this input', '라벨을 클릭해 포커스 이동') })])),
    example('marker', 'Marker', node('Marker.Root', { role: 'status' }, [text('Marker.Icon', '✓'), text('Marker.Content', t('Report complete', '보고서 생성 완료'))])),
    example('menubar', 'Menubar', menu('Menubar', t('File', '파일')), menuState),
    example('message-scroller', 'Message Scroller', node('MessageScroller.Provider', {}, [
      node('Card.Root', {}, [
        node('Card.Header', {}, [text('Card.Title', t('Team conversation', '팀 대화')), text('Card.Description', t('Updates from the reporting team.', '보고서 담당자들이 나눈 대화입니다.'))]),
        node('Card.Content', {}, [node('MessageScroller.Root', { style: 'height: 16rem' }, [
          node('MessageScroller.Viewport', {}, [node('MessageScroller.Content', {}, Array.from({ length: 8 }, (_, index) =>
            node('MessageScroller.Item', {}, [node('Message.Root', { align: index % 2 ? 'end' : 'start' }, [
              node('Message.Content', {}, [text('Message.Header', index % 2 ? t('You', '나') : t('Avery', '서윤')),
                node('Bubble.Root', { variant: index % 2 ? 'default' : 'muted' }, [text('Bubble.Content', sites[index % sites.length].label + t(' report ', ' 보고서 ') + (index + 1) + t(' received', ' 접수 완료'))]),
              ]),
            ])]),
          ))]),
          node('MessageScroller.Button', { 'aria-label': t('Latest messages', '최신 메시지') }),
        ])]),
      ]),
    ])),
    example('message', 'Message', node('Message.Group', {}, [
      node('Message.Root', {}, [node('Message.Avatar', {}, [avatar(t('AV', 'SY'))]),
        node('Message.Content', {}, [text('Message.Header', t('Avery · 10:00 AM', '서윤 · 오전 10:00')), node('Bubble.Root', { variant: 'muted' }, [text('Bubble.Content', t('I reviewed the report.', '보고서를 확인했습니다.'))]), text('Message.Footer', t('Read', '읽음'))]),
      ]),
      node('Message.Root', { align: 'end' }, [node('Message.Content', {}, [text('Message.Header', t('You · 10:01 AM', '나 · 오전 10:01')), node('Bubble.Root', {}, [text('Bubble.Content', t('Thanks! I will share it with the team.', '감사합니다. 팀에 공유하겠습니다.'))])])]),
    ])),
    example('native-select', 'Native Select', group(text('Label', t('Location', '지역'), { for: 'native-site' }), bound('NativeSelect.Root', 'site', string, { id: 'native-site' }, 'value', 'change', [
      node('NativeSelect.OptGroup', { label: t('Location', '지역') }, sites.map(site => text('NativeSelect.Option', site.label, { value: site.value }))),
    ])), { states: { site: state('seoul', string) } }),
    example('navigation-menu', 'Navigation Menu', node('NavigationMenu.Root', {}, [
      node('NavigationMenu.List', {}, [
        node('NavigationMenu.Item', { value: 'docs' }, [
          text('NavigationMenu.Trigger', t('Documents', '문서')),
          node('NavigationMenu.Content', {}, [node('Field.Group', { style: 'width: min(18rem, calc(100vw - 8rem)); gap: .25rem' }, [text('NavigationMenu.Link', t('Getting started', '시작하기'), { href: t('/docs/quickstart/', '/ko/docs/quickstart/') }), text('NavigationMenu.Link', 'API', { href: t('/docs/ui/api/', '/ko/docs/ui/api/') })])]),
        ]),
        node('NavigationMenu.Item', { value: 'overview' }, [text('NavigationMenu.Link', t('Overview', '개요'), { href: t('/docs/', '/ko/docs/') })]),
        node('NavigationMenu.Indicator'),
      ]),
    ])),
    example('pagination', 'Pagination', group(
      node('Pagination.Root', { count: 30, perPage: 10, page: read('page') }, [
        node('Pagination.Content', {}, [
          node('Pagination.Item', {}, [text('Pagination.PrevButton', t('Previous', '이전'), { 'aria-label': t('Go to previous page', '이전 페이지로 이동') })]),
          ...[1, 2, 3].map(value => node('Pagination.Item', {}, [node('Pagination.Link', { page: { type: 'page', value }, isActive: read('page' + value), 'aria-label': t('Page ', '페이지 ') + value })])),
          node('Pagination.Item', {}, [text('Pagination.NextButton', t('Next', '다음'), { 'aria-label': t('Go to next page', '다음 페이지로 이동') })]),
        ]),
      ], { on: controlled('page', number, 'pageChange') }),
      text('Typography', { '@call': 'formatString', args: { value: t('Page ${/states/page} of 3', '3페이지 중 ${/states/page}페이지') } }),
    ), { states: { page: state(1, number), ...Object.fromEntries([1, 2, 3].map(value => ['page' + value, { kind: 'Derived', schema: boolean, variable: { ports: { page: { kind: 'Value', schema: number, required: true } }, expression: `page == ${value}.0` }, inputs: { page: read('page') } }])) } }),
    example('popover', 'Popover', bound('Popover.Root', 'open', boolean, {}, 'open', 'openChange', [
      node('Popover.Trigger', {}, [], { slots: { child: [button(t('Notification settings', '알림 설정'), { variant: 'outline' })] } }),
      node('Popover.Content', {}, [
        node('Popover.Header', {}, [text('Popover.Title', t('Notification settings', '알림 설정')), text('Popover.Description', t('Enable the channels you need.', '필요한 채널만 활성화하세요.'))]),
        node('Field.Field', { orientation: 'horizontal' }, [node('Switch', { id: 'popover-email', checked: true }), text('Field.Label', t('Email notifications', '이메일 알림'), { for: 'popover-email' })]),
        node('Popover.Close', {}, [], { slots: { child: [button(t('Done', '완료'), { variant: 'outline' })] } }),
      ]),
    ]), { states: { open: state(false, boolean) } }),
    example('progress', 'Progress', group(node('Progress', { value: read('progress'), max: 100, 'aria-label': t('Upload progress', '업로드 진행률') }), button(t('Mark complete', '완료 표시'), {}, controlled('progress', number, 'click', 100))), { states: { progress: state(58, number) } }),
    example('questionnaire', 'Questionnaire', group(node('Questionnaire.Root', { item: read('question'), items: [{ name: 'format', required: true }, { name: 'detail', required: false }] }, [
      text('Questionnaire.Progress', { '@call': 'formatString', args: { value: t('Question ${/states/questionNumber} of 2', '2개 질문 중 ${/states/questionNumber}번째') } }, { 'aria-label': t('Questionnaire progress', '질문 진행 상황') }),
      node('Questionnaire.Item', { name: 'format', required: true }, [
        text('Questionnaire.Title', t('Choose a report format', '보고서 형식을 선택하세요')),
        text('Questionnaire.Description', t('Review your answers before submitting.', '제출 전에 내용을 확인할 수 있습니다.')),
        node('Questionnaire.Choices', {}, [
          node('Questionnaire.Choice', { value: 'summary' }, [text('Typography', t('Brief summary', '간단한 요약'), { as: 'span' }), text('Questionnaire.ChoiceDescription', t('Includes the key metrics.', '주요 지표만 포함합니다.'))]),
          text('Questionnaire.Choice', t('Detailed report', '상세 보고서'), { value: 'full' }),
          node('Questionnaire.Input', { placeholder: t('Other requests', '기타 요청'), 'aria-label': t('Other requests', '기타 요청') }),
        ]),
      text('Questionnaire.Error', t('Choose an option before continuing.', '계속하려면 항목을 선택하세요.')),
      ]),
      node('Questionnaire.Item', { name: 'detail' }, [
        text('Questionnaire.Title', t('Choose additional context', '추가 범위를 선택하세요')),
        node('Questionnaire.Choices', {}, [text('Questionnaire.Choice', t('Compare with last month', '지난달 비교'), { value: 'comparison' })]),
      ]),
      node('Questionnaire.Actions', {}, [
        text('Questionnaire.Previous', t('Back', '이전')),
        text('Questionnaire.Next', t('Next', '다음')),
        text('Questionnaire.Skip', t('Skip', '건너뛰기')),
        text('Questionnaire.Submit', t('Submit', '제출')),
      ]),
    ], { on: { ...controlled('submitted', boolean, 'submit', true), ...controlled('question', string, 'itemChange') } }),
      { ...text('Typography', t('Answers submitted.', '답변을 제출했습니다.'), { variant: 'muted' }), when: read('submitted') },
    ), { states: { submitted: state(false, boolean), question: state('format', string), questionNumber: { kind: 'Derived', schema: number, variable: { ports: { question: { kind: 'Value', schema: string, required: true } }, expression: 'question == "format" ? 1 : 2' }, inputs: { question: read('question') } } } }),
    example('radio-group', 'Radio Group', bound('RadioGroup.Root', 'site', string, { 'aria-label': t('Location', '지역') }, 'value', 'valueChange', sites.map(site =>
      field(node('RadioGroup.Item', { id: 'radio-' + site.value, value: site.value, disabled: site.value === 'jeju' }), text('Field.Label', site.label, { for: 'radio-' + site.value })),
    )), { states: { site: state('seoul', string) } }),
    example('range-calendar', 'Range Calendar', calendar('RangeCalendar'), { states: { date: state({ start: '2026-11-02', end: '2026-11-06' }) } }),
    example('resizable', 'Resizable', node('Resizable.PaneGroup', { direction: 'horizontal', style: 'min-height: 8rem; border: 1px solid var(--border); border-radius: .5rem' }, [
      node('Resizable.Pane', { defaultSize: 45, minSize: 20, style: 'padding: 1rem' }, [text('Typography', t('Original document', '원본 문서'))]),
      node('Resizable.Handle', { withHandle: true }),
      node('Resizable.Pane', { defaultSize: 55, minSize: 20, style: 'padding: 1rem' }, [text('Typography', t('Edited result', '편집 결과'))]),
    ])),
    example('scroll-area', 'Scroll Area', node('ScrollArea.Root', { style: 'height: 9rem; width: min(100%, 14rem); border: 1px solid var(--border); border-radius: .5rem', type: 'always' }, [
      node('Field.Group', { style: 'padding: .75rem; gap: .25rem' }, Array.from({ length: 8 }, (_, i) =>
        text('Typography', t('Report ', '보고서 ') + (i + 1)),
      )),
    ])),
    example('select', 'Select', bound('Select.Root', 'site', string, { type: 'single', items: sites }, 'value', 'valueChange', [
      node('Select.Trigger', { 'aria-label': t('Location', '지역') }, [node('Select.Value', { placeholder: t('Choose a location', '지역 선택') })]),
      node('Select.Content', {}, [node('Select.Group', {}, [
        ...sites.map(site => text('Select.Item', site.label, { value: site.value, label: site.label })),
      ])]),
    ]), { states: { site: state('seoul', string) } }),
    example('separator', 'Separator', group(text('Typography', t('Project', '프로젝트')), node('Separator', { decorative: false }), text('Typography', t('Team settings', '팀 설정')))),
    example('sheet', 'Sheet', modal('Sheet', t('Export options', '내보내기 옵션'), t('Review the file format and included columns.', '파일 형식과 포함할 열을 확인하세요.')), { states: { open: state(false, boolean) } }),
    example('sidebar', 'Sidebar', node('Sidebar.Provider', {
      style: 'min-height: 0; --sidebar-width: min(46%, 12rem);',
    }, [
      node('Sidebar.Root', { collapsible: 'none', style: 'align-self: stretch; height: auto; flex: none' }, [
        node('Sidebar.Content', {}, [
          node('Sidebar.Group', {}, [
            text('Sidebar.GroupLabel', t('Workspace', '작업 공간')),
            node('Sidebar.GroupContent', {}, [node('Sidebar.Menu', {}, [
              node('Sidebar.MenuItem', {}, [
                { ...text('Sidebar.MenuButton', t('Reports', '보고서'), { isActive: read('reportsActive') }), on: controlled('reportsActive', boolean, 'click', true) },
              ]),
              node('Sidebar.MenuItem', {}, [
                { ...text('Sidebar.MenuButton', t('Settings', '설정'), { isActive: read('settingsActive') }), on: controlled('reportsActive', boolean, 'click', false) },
              ]),
            ])]),
          ]),
        ]),
      ]),
      node('Card.Content', { style: 'padding: 1rem; min-width: 0' }, [
        { ...text('Typography', t('Monthly reports', '월간 보고서')), when: read('reportsActive') },
        { ...text('Typography', t('Workspace preferences', '작업 공간 환경 설정')), when: read('settingsActive') },
      ]),
    ]), { states: {
      reportsActive: state(true, boolean),
      settingsActive: {
        kind: 'Derived', schema: boolean,
        variable: { ports: { reports: { kind: 'Value', schema: boolean, required: true } }, expression: '!reports' },
        inputs: { reports: read('reportsActive') },
      },
    } }),
    example('skeleton', 'Skeleton', node('Card.Root', { class: 'max-w-xs', 'aria-busy': true }, [
      node('Card.Header', {}, [node('Skeleton', { style: 'height: 1.25rem; width: 55%' }), node('Skeleton', { style: 'height: .75rem; width: 78%' })]),
      node('Card.Content', {}, [node('Skeleton', { style: 'height: 5rem; width: 100%' })]),
    ])),
    example('slider', 'Slider', group(
      text('Typography', { '@call': 'formatString', args: { value: t('Volume: ${/states/level}%', '볼륨 ${/states/level}%') } }),
      bound('Slider', 'level', number, { type: 'single', min: 0, max: 100, step: 5, 'aria-label': t('Volume', '볼륨') }),
    ), { states: { level: state(35, number) } }),
    example('sonner', 'Sonner', group(
      node('Sonner', {
        id: sonnerToasterId,
        position: 'bottom-right',
        closeButton: true,
        closeButtonAriaLabel: t('Close toast', '알림 닫기'),
        containerAriaLabel: t('Notifications', '알림'),
      }),
      button(t('Show toast', '알림 보내기'), {}, { click: {
        actionRef: sonnerActionId,
        inputs: {
          title: t('Draft saved', '초안을 저장했습니다'),
          description: t('Your report draft is ready to share.', '보고서 초안을 공유할 수 있습니다.'),
        },
      } }),
    ), {}, t(
      'The host registers the docs-show-toast Action and calls toast.success from the Sonner family entry point. The Toaster id targets this preview.',
      '호스트가 docs-show-toast Action을 등록하고 Sonner 계열의 toast.success를 호출합니다. Toaster id로 이 미리보기에 알림을 보냅니다.',
    )),
    example('spinner', 'Spinner', node('Button', { disabled: true }, [node('Spinner', { 'data-icon': 'inline-start', 'aria-label': t('Working', '생성 중') }), text('Typography', t('Creating report', '보고서 생성 중'), { as: 'span', variant: 'small' })])),
    example('switch', 'Switch', field(bound('Switch', 'enabled', boolean, { id: 'summary' }, 'checked', 'checkedChange'), text('Field.Label', t('Receive weekly summaries', '주간 요약 받기'), { for: 'summary' })), { states: { enabled: state(true, boolean) } }),
    example('table', 'Table', node('Table.Root', {}, [
      text('Table.Caption', t('Monthly operations', '월별 운영 현황')),
      node('Table.Header', {}, [node('Table.Row', {}, [text('Table.Head', t('Month', '월')), text('Table.Head', t('Processed', '처리량'))])]),
      node('Table.Body', {}, metricRows.map(row => node('Table.Row', {}, [text('Table.Cell', row.month), text('Table.Cell', String(row.count))]))),
      node('Table.Footer', {}, [node('Table.Row', {}, [text('Table.Cell', t('Total', '합계')), text('Table.Cell', '174')])]),
    ])),
    example('tabs', 'Tabs', bound('Tabs.Root', 'tab', string, {}, 'value', 'valueChange', [
      node('Tabs.List', {}, [text('Tabs.Trigger', t('Summary', '요약'), { value: 'summary' }), text('Tabs.Trigger', t('Activity', '활동'), { value: 'activity' }), text('Tabs.Trigger', t('Admin', '관리'), { value: 'admin', disabled: true })]),
      node('Tabs.Content', { value: 'summary' }, [node('Card.Root', {}, [node('Card.Header', {}, [text('Card.Title', t('Summary', '요약')), text('Card.Description', t('Monthly team operations.', '이번 달 팀의 운영 현황입니다.'))]), node('Card.Content', {}, [text('Typography', t('58 completed reports', '완료한 보고서 58개'))])])]),
      node('Tabs.Content', { value: 'activity' }, [node('Card.Root', {}, [node('Card.Header', {}, [text('Card.Title', t('Activity', '활동')), text('Card.Description', t('Activity from the last 7 days', '최근 7일 활동 내역'))]), node('Card.Content', {}, [text('Typography', t('The monthly report was shared with the team.', '월간 보고서를 팀에 공유했습니다.'))])])]),
    ]), { states: { tab: state('summary', string) } }),
    example('textarea', 'Textarea', node('Field.Field', {}, [text('Field.Label', t('Report notes', '보고서 메모'), { for: 'notes' }), bound('Textarea', 'notes', string, { id: 'notes', rows: 4 }, 'value', 'input')]), { states: { notes: state(t('Review next week.\nThe team has a copy of the draft.', '다음 주에 검토합니다.\n팀에 초안을 공유했습니다.'), string) } }),
    example('toggle-group', 'Toggle Group', bound('ToggleGroup.Root', 'mode', string, { type: 'single', variant: 'outline' }, 'value', 'valueChange', [
      text('ToggleGroup.Item', t('List', '목록'), { value: 'list' }), text('ToggleGroup.Item', t('Grid', '격자'), { value: 'grid' }),
    ]), { states: { mode: state('list', string) } }),
    example('toggle', 'Toggle', bound('Toggle', 'pinned', boolean, { variant: 'outline', text: t('Pin', '고정') }, 'pressed', 'pressedChange'), { states: { pinned: state(false, boolean) } }),
    example('tooltip', 'Tooltip', node('Tooltip.Provider', { delayDuration: 200 }, [
      node('Tooltip.Root', {}, [node('Tooltip.Trigger', {}, [], { slots: { child: [button(t('Save shortcut', '저장 단축키'), { variant: 'outline' })] } }), text('Tooltip.Content', t('Press ⌘S to save changes.', '⌘S로 변경 사항을 저장합니다.'))]),
    ])),
    example('trace', 'Trace', node('Trace.Root', {}, [
      node('Trace.Line', {}, [text('Trace.Icon', '✓'), text('Trace.Title', t('Collect reports', '보고서 수집'))]),
      text('Trace.Description', t('Collected source data and calculated the totals.', '원본 데이터를 모아 합계를 계산했습니다.')),
      node('Trace.Collapsible', {}, [
        text('Trace.CollapsibleTrigger', t('View run details', '실행 단계 보기')),
        node('Trace.CollapsibleContent', {}, [text('Trace.Line', t('Read 4 files', '파일 4개 읽기')), text('Trace.Line', t('Counted 174 items', '174개 항목 집계'))]),
      ]),
    ])),
    example('typography', 'Typography', group(
      text('Typography', t('Writing a report', '보고서 작성 가이드'), { as: 'h3', variant: 'h3' }),
      text('Typography', t('Include a summary and the supporting evidence so your team can act.', '팀이 바로 사용할 수 있도록 요약과 근거를 함께 작성하세요.')),
      text('Typography', t('Start with the reporting period.', '측정 범위를 먼저 적습니다.'), { as: 'blockquote', variant: 'blockquote' }),
      text('Typography', 'report.json', { as: 'code', variant: 'code' }),
    )),
  ];
}

const localizedDemos = {
  en: new Map(buildDemos('en').map(({ slug, ...demo }) => [slug, demo])),
  ko: new Map(buildDemos('ko').map(({ slug, ...demo }) => [slug, demo])),
};

export const componentDemoSlugs = Object.freeze([...localizedDemos.en.keys()]);

/**
 * @param {string} slug
 * @param {'en' | 'ko'} locale
 * @returns {{ view: import('@viewstem/core').ViewSpec, title: string, description: string, instructions?: string } | undefined}
 */
export function getComponentDemo(slug, locale) {
  const demo = localizedDemos[locale].get(slug);
  if (!demo) return undefined;
  return {
    ...demo,
    description: descriptions[slug][locale === 'ko' ? 1 : 0],
  };
}

export { boolean, number, string, state, read, node, text, button, controlled, bound, field, example };
