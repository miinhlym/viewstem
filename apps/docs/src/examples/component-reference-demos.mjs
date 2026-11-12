import {
  boolean, number, string, state, read, node, text, button, controlled, bound, field, example,
  componentDemoSlugs, getComponentDemo,
} from './component-demos.mjs';

// These compositions follow the primary examples on the official component pages.
// Keep the product examples and their State/Action tutorials in component-demos.mjs.
const stack = (children, style = '') => node('Field.Group', { style }, children);
const row = (children, style = '') =>
  stack(children, 'flex-direction: row; flex-wrap: wrap; align-items: center; gap: .5rem; ' + style);
const paragraph = (label, inputs) => text('Typography', label, inputs);
const status = label => text('Field.Description', label, { role: 'status' });
const format = value => ({ '@call': 'formatString', args: { value } });
const child = (component, content, inputs = {}) =>
  node(component, inputs, [], { slots: { child: [content] } });
const labelled = (label, control, id, description) => node('Field.Field', {}, [
  text('Field.Label', label, { for: id }),
  control,
  ...(description ? [text('Field.Description', description)] : []),
]);

function build(locale) {
  const t = (en, ko) => locale === 'ko' ? ko : en;
  const lang = t('en-US', 'ko-KR');
  const demos = new Map();
  function add(slug, width, render, states, title = t('Preview', '미리보기'), anchor) {
    const entries = demos.get(slug) ?? [];
    const id = 'reference-' + (anchor ?? slug + '-' + entries.length);
    const { view } = example(id, title, render, states ? { states } : {});
    entries.push({ title, width, view, anchor });
    demos.set(slug, entries);
  }
  function variant(slug, key, title, width, render, states) {
    add(slug, width, render, states, title, slug + '-' + key);
  }
  function adapt(slug, width, update, variant) {
    const { view } = structuredClone(getComponentDemo(slug, locale));
    const parts = (ref, root = view.render) => [
      ...(root.componentRef === 'shadcn.' + ref ? [root] : []),
      ...Object.values(root.slots ?? {}).flatMap(nodes => nodes.flatMap(item => parts(ref, item))),
    ];
    update(view, parts);
    const { render, ...definition } = view;
    const anchor = variant && slug + '-' + variant.key;
    const namespaceId = 'reference-' + (anchor ?? slug);
    function namespace(item) {
      const { id: _id, slots, inputs, ...rest } = item;
      return {
        ...rest,
        ...(inputs ? { inputs: Object.fromEntries(Object.entries(inputs).map(([key, value]) => [
          key, typeof value === 'string' && ['id', 'for', 'aria-describedby', 'aria-labelledby'].includes(key)
            ? value.split(' ').map(token => (anchor ? namespaceId + '-' : 'reference-') + token).join(' ') : value,
        ])) } : {}),
        ...(slots ? { slots: Object.fromEntries(Object.entries(slots).map(([name, children]) => [name, children.map(namespace)])) } : {}),
      };
    }
    const title = variant?.title ?? t('Preview', '미리보기');
    const demo = example(namespaceId, title, namespace(render), definition);
    const entries = demos.get(slug) ?? [];
    entries.push({ title, width, view: demo.view, anchor });
    demos.set(slug, entries);
  }
  const input = (id, props = {}) => node('Input', { id, ...props });
  const options = labels => labels.map(([value, label]) => ({ value, label }));
  const fruits = options([
    ['apple', t('Apple', '사과')], ['banana', t('Banana', '바나나')], ['blueberry', t('Blueberry', '블루베리')],
    ['grapes', t('Grapes', '포도')], ['pineapple', t('Pineapple', '파인애플')],
  ]);
  const frameworks = options([['next', 'Next.js'], ['sveltekit', 'SvelteKit'], ['nuxt', 'Nuxt.js'], ['remix', 'Remix'], ['astro', 'Astro']]);
  const select = (placeholder, items, label, props = {}) => node('Select.Root', { type: 'single', items, ...props }, [
    node('Select.Trigger', { 'aria-label': placeholder, style: 'width: 100%' }, [node('Select.Value', { placeholder })]),
    node('Select.Content', {}, [node('Select.Group', {}, [
      ...(label ? [text('Select.GroupHeading', label)] : []),
      ...items.map(item => text('Select.Item', item.label, item)),
    ])]),
  ]);
  const menuItems = (family, items) => node(family + '.Group', {}, items.map(label => text(family + '.Item', label)));
  const menuChoice = (family, label, inputs = {}, children = []) => ({
    ...text(family + '.Item', label, inputs, children),
    on: controlled('selection', string, 'select', label),
  });
  const menuFeedback = menu => stack([
    menu,
    status(read('selection')),
  ], 'align-items: center; gap: .75rem');
  const selectionState = { selection: state(t('No action selected', '선택한 작업 없음'), string) };
  const dropdown = (trigger, groups) => node('DropdownMenu.Root', {}, [
    child('DropdownMenu.Trigger', trigger),
    node('DropdownMenu.Content', {}, groups.flatMap((items, index) => [
      ...(index ? [node('DropdownMenu.Separator')] : []), menuItems('DropdownMenu', items),
    ])),
  ]);
  const nameFields = prefix => stack([
    labelled(t('Name', '이름'), input(prefix + '-name', { value: 'Pedro Duarte' }), prefix + '-name'),
    labelled(t('Username', '사용자 이름'), input(prefix + '-username', { value: '@peduarte' }), prefix + '-username'),
  ], 'gap: 1rem');
  const overlay = (family, trigger, title, description, content, actions, props = {}) => node(family + '.Root', {}, [
    child(family + '.Trigger', button(trigger, { variant: 'outline' })),
    node(family + '.Content', props, [
      node(family + '.Header', {}, [text(family + '.Title', title), text(family + '.Description', description)]),
      ...content,
      node(family + '.Footer', {}, actions),
    ]),
  ]);
  const close = (family, label, variant = 'outline') => child(family + '.Close', button(label, { variant }));
  const titleProfile = t('Edit profile', '프로필 수정');
  const descProfile = t('Update your profile and save the changes.', '프로필을 수정하고 변경 사항을 저장하세요.');
  const saveProfile = t('Save changes', '변경 사항 저장');
  const cancel = t('Cancel', '취소');

  const questions = [
    [t('What are your shipping options?', '배송 옵션은 무엇인가요?'), t('Standard delivery takes 5–7 days. Express takes 2–3 days. Overnight delivery is also available.', '일반 배송은 5~7일, 빠른 배송은 2~3일 걸립니다. 익일 배송도 가능합니다.')],
    [t('What is your return policy?', '반품 정책은 어떻게 되나요?'), t('Return unused items within 30 days of delivery.', '배송 후 30일 이내에 사용하지 않은 상품을 반품할 수 있습니다.')],
    [t('How can I contact customer support?', '고객 지원팀에 어떻게 연락하나요?'), t('Contact our team by email or live chat.', '이메일이나 실시간 채팅으로 문의하세요.')],
  ];
  function accordion(multiple = false, disabled = false) {
    return node('Accordion.Root', { type: multiple ? 'multiple' : 'single', value: multiple ? ['0', '1'] : '0' },
      questions.map(([title, body], index) => node('Accordion.Item', { value: String(index), ...(disabled && index === 1 ? { disabled: true } : {}) }, [
        text('Accordion.Trigger', title), text('Accordion.Content', body),
      ])));
  }
  add('accordion', 384, accordion());
  add('accordion', 384, accordion(true), undefined, t('Multiple', '여러 항목 열기'), 'accordion-multiple');
  add('accordion', 384, accordion(false, true), undefined, t('Disabled', '비활성화'), 'accordion-disabled');

  const alert = (title, message, variant = 'default') =>
    node('Alert.Root', { variant }, [text('Alert.Title', title), text('Alert.Description', message)]);
  add('alert', 448, stack([
    alert(t('Payment successful', '결제 완료'), t('Your $29.99 payment was processed. Check your email for the receipt.', '29.99달러 결제를 완료했습니다. 이메일에서 영수증을 확인하세요.')),
    alert(t('New feature available', '새 기능 안내'), t('You can enable dark mode in your account settings.', '계정 설정에서 다크 모드를 켤 수 있습니다.')),
    alert(t('Unable to process payment', '결제를 처리하지 못했습니다'), t('Check your payment details and try again.', '결제 정보를 확인하고 다시 시도하세요.'), 'destructive'),
  ], 'gap: .75rem'));
  const alertDialog = overlay('AlertDialog', t('Show Dialog', '확인 창 열기'),
    t('Are you absolutely sure?', '계속하시겠습니까?'), t('Deleting your account is permanent.', '계정을 삭제하면 복구할 수 없습니다.'), [],
    [text('AlertDialog.Cancel', cancel), {
      ...text('AlertDialog.Action', t('Continue', '계속')),
      on: controlled('open', boolean, 'click', false),
    }]);
  add('alert-dialog', 'fit-content',
    bound('AlertDialog.Root', 'open', boolean, {}, 'open', 'openChange', alertDialog.slots.default),
    { open: state(false, boolean) });

  add('aspect-ratio', 384, node('AspectRatio', { ratio: 16 / 9 }, [
    node('Card.Root', { style: 'height: 100%; border-radius: .75rem; background: center / cover url(https://avatar.vercel.sh/shadcn1) var(--muted)' }),
  ]));
  const attachment = (name, description, status, type, image) => node('Attachment.Root', { state: status }, [
    image ? node('Attachment.Media', { variant: 'image', role: 'img', 'aria-label': name, style: `background: center / cover url(${image}) var(--muted)` }) : text('Attachment.Media', type),
    node('Attachment.Content', {}, [text('Attachment.Title', name), text('Attachment.Description', description)]),
  ]);
  const thumbnail = id => 'https://images.unsplash.com/photo-' + id + '?w=160&auto=format&fit=crop&q=80';
  const upload = attachment('sales-dashboard.pdf', read('uploadLabel'), read('uploadState'), 'PDF');
  upload.slots.default.push(node('Attachment.Actions', { hidden: read('canceled') }, [
    node('Attachment.Action', { 'aria-label': t('Cancel upload', '업로드 취소'), text: '×' }, [], {
      on: controlled('canceled', boolean, 'click', true),
    }),
  ]));
  const uploadText = (active, canceled) => ({
    kind: 'Derived', schema: string,
    variable: {
      ports: { canceled: { kind: 'Value', schema: boolean, required: true } },
      expression: `canceled ? ${JSON.stringify(canceled)} : ${JSON.stringify(active)}`,
    },
    inputs: { canceled: read('canceled') },
  });
  add('attachment', 448, node('Attachment.Group', { style: 'flex-wrap: wrap; align-items: center' }, [
    attachment('workspace.png', 'PNG · 820 KB', 'done', 'PNG', thumbnail('1497366754035-f200968a6e72')),
    upload,
    attachment('message-renderer.tsx', 'TypeScript · 12 KB', 'done', 'TS'),
  ]), {
    canceled: state(false, boolean),
    uploadState: uploadText('uploading', 'idle'),
    uploadLabel: uploadText(t('Uploading · 64%', '업로드 중 · 64%'), t('Upload canceled.', '업로드를 취소했습니다.')),
  });
  const avatar = (initials, image, badge = false) => node('Avatar.Root', {}, [
    ...(image ? [node('Avatar.Image', { src: image, alt: initials })] : []),
    text('Avatar.Fallback', initials),
    ...(badge ? [node('Avatar.Badge')] : []),
  ]);
  add('avatar', 264, row([
    avatar('CN', 'https://github.com/shadcn.png'), avatar('ER', 'https://github.com/evilrabbit.png', true),
    node('Avatar.Group', {}, [avatar('CN', 'https://github.com/shadcn.png'), avatar('LR', 'https://github.com/maxleiter.png'), avatar('ER', 'https://github.com/evilrabbit.png'), text('Avatar.GroupCount', '+3')]),
  ], 'gap: 1rem; justify-content: center'));
  add('badge', '100%', row(['default', 'secondary', 'destructive', 'outline'].map((variant, i) =>
    text('Badge', [t('Badge', '배지'), t('Secondary', '보조'), t('Destructive', '위험'), t('Outline', '외곽선')][i], { variant })), 'justify-content: center'));
  add('badge', '100%', row(['ghost', 'link'].map(variant => text('Badge', variant, { variant })), 'justify-content: center'), undefined, t('Ghost and link', '고스트와 링크'), 'badge-ghost-and-link');
  const breadcrumbItem = (name, href) => node('Breadcrumb.Item', {}, [text(href ? 'Breadcrumb.Link' : 'Breadcrumb.Page', name, href ? { href } : {})]);
  add('breadcrumb', 'fit-content', node('Breadcrumb.Root', {}, [node('Breadcrumb.List', {}, [
    breadcrumbItem(t('Home', '홈'), t('/', '/ko/')),
    node('Breadcrumb.Separator'),
    node('Breadcrumb.Item', {}, [dropdown(button('…', { size: 'icon-sm', variant: 'ghost', 'aria-label': t('Toggle menu', '메뉴 열기') }), [[t('Documentation', '문서'), t('Themes', '테마'), 'GitHub']])]),
    node('Breadcrumb.Separator'), breadcrumbItem(t('Components', '컴포넌트'), t('/docs/ui/components/', '/ko/docs/ui/components/')),
    node('Breadcrumb.Separator'), breadcrumbItem('Breadcrumb'),
  ])]));
  const bubble = (label, align = 'start', reaction) => node('Bubble.Root', { align, variant: align === 'start' ? 'muted' : 'default' }, [
    text('Bubble.Content', label), ...(reaction ? [text('Bubble.Reactions', reaction)] : []),
  ]);
  add('bubble', 384, stack([
    bubble(t("Hey there! What's up?", '안녕하세요! 잘 지내세요?')),
    node('Bubble.Group', {}, [bubble(t('Want to see chat bubbles?', '말풍선을 볼까요?'), 'end'), bubble(t('I can group messages and switch sides.', '메시지를 묶고 방향을 바꿀 수 있어요.'), 'end', '👍')]),
    bubble(t('Sure. Show me the demo.', '좋아요. 예제를 보여 주세요.')),
    bubble(t('You are reading the demo now.', '지금 보고 계신 화면이 예제예요.'), 'end'),
  ], 'gap: .75rem'));
  add('button', 'fit-content', button(t('Button', '버튼')));
  const buttonStyles = [
    ['default', t('Default', '기본')], ['outline', t('Outline', '외곽선')], ['secondary', t('Secondary', '보조')],
    ['ghost', t('Ghost', '고스트')], ['destructive', t('Destructive', '위험')], ['link', t('Link', '링크')],
  ];
  add('button', '100%', row(buttonStyles.map(([variant, label]) => button(label, { variant })), 'justify-content: center'),
    undefined, t('Style', '스타일'), 'button-styles');
  const buttonSizes = [['xs', t('Extra Small', '아주 작게')], ['sm', t('Small', '작게')], ['default', t('Default', '기본')], ['lg', t('Large', '크게')]];
  add('button', '100%', row(buttonSizes.map(([size, label]) => button(label, { size, variant: 'outline' })), 'justify-content: center'),
    undefined, t('Size', '크기'), 'button-sizes');
  add('button', 'fit-content', node('Button', { disabled: true, 'aria-busy': true }, [
    node('Spinner', { 'data-icon': 'inline-start', 'aria-hidden': true }),
    text('Typography', t('Please wait', '잠시 기다려 주세요'), { as: 'span', variant: 'small' }),
  ]), undefined, t('Loading', '로딩'), 'button-loading');
  add('button-group', 360, stack([
    row([
      node('ButtonGroup.Root', {}, [t('Archive', '보관'), t('Report', '신고'), t('Snooze', '나중에 보기')].map(label =>
        button(label, { variant: 'outline' }, controlled('selection', string, 'click', label)))),
      node('DropdownMenu.Root', {}, [
        child('DropdownMenu.Trigger', button('…', { variant: 'outline', size: 'icon', 'aria-label': t('More Options', '추가 옵션') })),
        node('DropdownMenu.Content', {}, [menuChoice('DropdownMenu', t('Mark as Read', '읽음으로 표시')), menuChoice('DropdownMenu', t('Move to Trash', '휴지통으로 이동'))]),
      ]),
    ], 'justify-content: center'),
    status(read('selection')),
  ], 'align-items: center; gap: .75rem'), selectionState);
  const today = '2026-11-02';
  add('calendar', 'fit-content', bound('Calendar.Root', 'date', true, { locale: lang, type: 'single', captionLayout: 'dropdown', placeholder: today }, 'value', 'valueChange'), { date: state(today) });
  add('card', 384, node('Card.Root', {}, [
    node('Card.Header', {}, [
      text('Card.Title', t('Login to your account', '계정에 로그인')),
      text('Card.Description', t('Try this form with sample credentials.', '예시 이메일과 비밀번호로 폼을 체험해 보세요.')),
      node('Card.Action', {}, [button(t('View forms guide', '폼 가이드'), { variant: 'link', href: t('/docs/guides/form-validation/', '/ko/docs/guides/form-validation/') })]),
    ]),
    node('Card.Content', {}, [stack([
      labelled(t('Email', '이메일'), input('reference-login-email', { type: 'email', placeholder: 'm@example.com' }), 'reference-login-email'),
      labelled(t('Password', '비밀번호'), input('reference-login-password', { type: 'password' }), 'reference-login-password'),
    ], 'gap: 1rem')]),
    node('Card.Footer', { style: 'flex-direction: column; align-items: stretch; gap: .5rem' }, [
      button(t('Try login', '로그인 체험'), {}, controlled('submitted', boolean, 'click', true)),
      { ...status(t('Demo submitted. No credentials were sent.', '예시 폼을 제출했습니다. 입력값은 전송되지 않았습니다.')), when: read('submitted') },
    ]),
  ]), { submitted: state(false, boolean) });
  adapt('carousel', 416, (_view, parts) => {
    const content = parts('Carousel.Content')[0];
    content.slots.default = Array.from({ length: 5 }, (_, i) => node('Carousel.Item', {}, [
      node('Card.Root', {}, [node('Card.Content', { style: 'aspect-ratio: 1; display: grid; place-items: center' }, [paragraph(String(i + 1), { variant: 'large' })])]),
    ]));
  });
  const visits = [
    { day: 'Apr 1', desktop: 222, mobile: 150 }, { day: 'Apr 8', desktop: 97, mobile: 180 },
    { day: 'Apr 15', desktop: 167, mobile: 120 }, { day: 'Apr 22', desktop: 242, mobile: 260 },
    { day: 'May 1', desktop: 373, mobile: 290 }, { day: 'May 8', desktop: 301, mobile: 340 },
    { day: 'May 15', desktop: 245, mobile: 180 }, { day: 'May 22', desktop: 399, mobile: 420 },
    { day: 'Jun 1', desktop: 454, mobile: 390 }, { day: 'Jun 8', desktop: 165, mobile: 190 },
    { day: 'Jun 15', desktop: 338, mobile: 410 }, { day: 'Jun 22', desktop: 293, mobile: 350 },
  ];
  const series = ['desktop', 'mobile'].map((key, i) => [{ id: key, key, label: [t('Desktop', '데스크톱'), t('Mobile', '모바일')][i], color: 'var(--chart-' + (i + 1) + ')' }]);
  add('chart', '100%', node('Card.Root', {}, [
    node('Card.Header', {}, [text('Card.Title', t('Bar Chart – Interactive', '막대 차트')), text('Card.Description', t('Visitors in the last three months', '최근 3개월 방문자'))]),
    node('Card.Content', {}, [
      row(series.map(([item], i) => button(item.label, { variant: 'outline' }, controlled('series', true, 'click', series[i]))), 'margin-bottom: 1rem'),
      node('Chart', { kind: 'bar', data: visits, x: 'day', series: read('series'), label: t('Visitors', '방문자') }),
    ]),
  ]), { series: state(series[0]) });
  const check = (id, label, props, detail) => field(node('Checkbox', { id, ...props }),
    detail ? node('Field.Content', {}, [text('Field.Label', label, { for: id }), text('Field.Description', detail)]) : text('Label', label, { for: id }));
  const terms = t('Accept terms and conditions', '이용 약관에 동의');
  add('checkbox', 384, stack([
    check('reference-terms', terms, {}),
    check('reference-terms-detail', terms, {}, t('By clicking this checkbox, you agree to the terms.', '이 확인란을 선택하면 약관에 동의합니다.')),
    check('reference-notifications', t('Enable notifications', '알림 켜기'), { checked: true }, t('You can change this setting at any time.', '언제든지 이 설정을 변경할 수 있습니다.')),
  ], 'gap: 1.25rem'));

  const code = [
    'import { convertToModelMessages, streamText } from "ai";',
    'import type { RequestHandler } from "./$types";',
    '',
    'export const POST: RequestHandler = async ({ request }) => {',
    '  const { messages } = await request.json();',
    '  const result = streamText({',
    '    model: "openai/gpt-5-mini",',
    '    messages: await convertToModelMessages(messages),',
    '  });',
    '  return result.toUIMessageStreamResponse();',
    '};',
  ];
  add('code-block', 512, node('CodeBlock.Root', {}, [
    node('CodeBlock.Header', {}, [
      text('CodeBlock.Title', 'src/routes/api/chat/+server.ts'),
      node('CodeBlock.Actions', {}, [node('CodeBlock.CopyButton', { value: code.join('\n'), 'aria-label': t('Copy', '복사') })]),
    ]),
    node('CodeBlock.Content', {}, code.map(line => node('CodeBlock.Line', { code: line }))),
  ]));
  add('collapsible', 350, stack([
    row([paragraph('Order #4189', { variant: 'small' }), text('Badge', t('Shipped', '발송 완료'), { variant: 'secondary' })], 'justify-content: space-between'),
    node('Collapsible.Root', {}, [
      text('Collapsible.Trigger', t('Delivery details', '배송 정보')),
      node('Collapsible.Content', {}, [stack([
        paragraph(t('Shipping address · 100 Market St, San Francisco', '배송 주소 · 100 Market St, San Francisco'), { variant: 'small' }),
        paragraph(t('Items · 2× Studio Headphones', '품목 · 스튜디오 헤드폰 2개'), { variant: 'small' }),
      ], 'padding-top: .75rem; gap: .5rem')]),
    ]),
  ], 'gap: .75rem'));
  add('combobox', 200, bound('Combobox', 'framework', string, { options: frameworks, placeholder: t('Select a framework', '프레임워크 선택'), searchPlaceholder: t('Search framework…', '프레임워크 검색…') }), { framework: state('', string) });
  add('command', 384, node('Command.Root', { 'aria-label': t('Commands', '명령') }, [
    node('Command.Input', { placeholder: t('Type a command or search…', '명령을 입력하거나 검색하세요…') }),
    node('Command.List', {}, [
      text('Command.Empty', t('No results found.', '검색 결과가 없습니다.')),
      node('Command.Group', { heading: t('Suggestions', '제안') }, [t('Calendar', '달력'), t('Search Emoji', '이모지 검색'), t('Calculator', '계산기')].map((label, i) => text('Command.Item', label, { value: 'suggestion-' + i, keywords: [label] }))),
      node('Command.Separator'),
      node('Command.Group', { heading: t('Settings', '설정') }, [t('Profile', '프로필'), t('Billing', '결제'), t('Settings', '설정')].map((label, i) => node('Command.Item', { value: 'setting-' + i, text: label, keywords: [label] }, [text('Command.Shortcut', ['⌘P', '⌘B', '⌘S'][i])]))),
    ]),
  ]));
  const context = 'ContextMenu';
  add('context-menu', 320, node(context + '.Root', {}, [
    text(context + '.Trigger', t('Right click here', '여기를 오른쪽 클릭'), { style: 'display: grid; height: 180px; place-items: center; border: 1px dashed var(--border); border-radius: .75rem' }),
    node(context + '.Content', {}, [
      node(context + '.Group', {}, [
        menuChoice(context, t('Back', '뒤로'), {}, [text(context + '.Shortcut', '⌘[')]),
        node(context + '.Item', { text: t('Forward', '앞으로'), disabled: true }, [text(context + '.Shortcut', '⌘]')]),
        menuChoice(context, t('Reload', '새로고침'), {}, [text(context + '.Shortcut', '⌘R')]),
        node(context + '.Sub', {}, [text(context + '.SubTrigger', t('More Tools', '도구 더보기')), node(context + '.SubContent', {}, [
          menuChoice(context, t('Save Page As…', '다른 이름으로 저장…')),
          menuChoice(context, t('Developer Tools', '개발자 도구')),
        ])]),
      ]),
      node(context + '.Separator'),
      text(context + '.CheckboxItem', t('Show Bookmarks', '북마크 표시'), { checked: true }),
      text(context + '.CheckboxItem', t('Show Full URLs', '전체 URL 표시')),
      node(context + '.Separator'),
      text(context + '.Label', t('People', '프로필')),
      node(context + '.RadioGroup', { value: 'pedro' }, [
        text(context + '.RadioItem', 'Pedro Duarte', { value: 'pedro' }), text(context + '.RadioItem', 'Colm Tuite', { value: 'colm' }),
      ]),
    ]),
    status(read('selection')),
  ]), selectionState);
  const paymentRows = [
    ['a', 'Success', 'ken99@example.com', 316], ['b', 'Success', 'abe45@example.com', 242],
    ['c', 'Processing', 'monserrat44@example.com', 837], ['d', 'Success', 'silas22@example.com', 874],
    ['e', 'Failed', 'carmella@example.com', 721],
  ].map(([id, status, email, amount]) => ({ id,
    status: { Success: t('Success', '성공'), Processing: t('Processing', '처리 중'), Failed: t('Failed', '실패') }[status],
    email, amount: '$' + amount.toFixed(2),
  }));
  adapt('data-table', '100%', view => {
    view.queries.metrics.query.transform.input = paymentRows;
    view.states.pageSize.initial = 5;
    view.render.inputs.columns = [
      { id: 'status', accessorKey: 'status', label: t('Status', '상태') },
      { id: 'email', accessorKey: 'email', label: t('Email', '이메일'), sortable: true, filterable: true },
      { id: 'amount', accessorKey: 'amount', label: t('Amount', '금액') },
    ];
    view.render.inputs.labels.filter = t('Filter emails…', '이메일 검색…');
  });
  add('date-picker', 'fit-content', bound('DatePicker', 'date', true, { locale: lang, placeholder: t('Pick a date', '날짜 선택') }), { date: state(null) });
  const profileName = labelled(t('Name', '이름'), bound('Input', 'name', string, { id: 'reference-dialog-name' }, 'value', 'input'), 'reference-dialog-name');
  const editableProfile = overlay('Dialog', t('Open Dialog', '대화상자 열기'), titleProfile,
    t('Change your display name and save it.', '표시 이름을 바꿔 저장해 보세요.'), [profileName], [
    close('Dialog', cancel),
    child('Dialog.Close', button(saveProfile, {}, controlled('savedName', string, 'click', read('name')))),
  ]);
  add('dialog', 'fit-content', stack([
    editableProfile,
    status(format(t('Saved name: ${/states/savedName}', '저장된 이름: ${/states/savedName}'))),
  ], 'align-items: center; gap: .75rem'), { name: state('Pedro Duarte', string), savedName: state('Pedro Duarte', string) });
  add('dialog', 'fit-content', overlay('Dialog', t('Open Dialog', '대화상자 열기'), t('Review profile', '프로필 검토'),
    t('Close the dialog using the button below.', '아래 버튼으로 대화상자를 닫으세요.'),
    [paragraph('Pedro Duarte · @peduarte')], [close('Dialog', t('Done', '완료'), 'default')], { showCloseButton: false }), undefined, t('No close button', '닫기 아이콘 숨기기'), 'dialog-no-close-icon');
  const delivery = options([
    ['standard', t('Standard delivery · 25–35 min', '일반 배송 · 25~35분')],
    ['early', t('5:00 PM – 5:15 PM', '오후 5:00~5:15')], ['late', t('5:30 PM – 5:45 PM', '오후 5:30~5:45')],
  ]);
  const radios = (id, items, props = {}) => node('RadioGroup.Root', props, items.map(item =>
    field(node('RadioGroup.Item', { id: id + '-' + item.value, value: item.value }), text('Label', item.label, { for: id + '-' + item.value }))));
  add('drawer', 'fit-content', overlay('Drawer', t('Open Drawer', '드로어 열기'), t('Pick a delivery time', '배송 시간 선택'),
    t("We'll prepare your order as soon as possible.", '주문을 최대한 빨리 준비하겠습니다.'), [
      stack([radios('reference-delivery', delivery, { value: 'standard' })], 'padding: 1rem'),
    ], [close('Drawer', t('Confirm', '확인'), 'default'), close('Drawer', cancel)]));
  const account = t('My Account', '내 계정');
  const dropdownMenu = node('DropdownMenu.Root', {}, [
    child('DropdownMenu.Trigger', button(t('Open', '열기'), { variant: 'outline' })),
    node('DropdownMenu.Content', { align: 'start' }, [
      text('DropdownMenu.Label', account),
      node('DropdownMenu.Group', {}, [
        ...[t('Profile', '프로필'), t('Billing', '결제'), t('Settings', '설정')].map((label, i) => menuChoice('DropdownMenu', label, {}, [text('DropdownMenu.Shortcut', ['⇧⌘P', '⌘B', '⌘S'][i])])),
      ]),
      node('DropdownMenu.Separator'),
      node('DropdownMenu.Group', {}, [
        menuChoice('DropdownMenu', t('Team', '팀')),
        node('DropdownMenu.Sub', {}, [
          text('DropdownMenu.SubTrigger', t('Invite users', '사용자 초대')),
          node('DropdownMenu.SubContent', {}, [menuChoice('DropdownMenu', t('Email', '이메일')), menuChoice('DropdownMenu', t('Message', '메시지'))]),
        ]),
        menuChoice('DropdownMenu', t('New Team', '새 팀')),
      ]),
      node('DropdownMenu.Separator'), node('DropdownMenu.Group', {}, ['GitHub', t('Support', '지원'), 'API'].map(label => menuChoice('DropdownMenu', label))),
      node('DropdownMenu.Separator'), menuChoice('DropdownMenu', t('Log out', '로그아웃')),
    ]),
  ]);
  add('dropdown-menu', 'fit-content', menuFeedback(dropdownMenu), selectionState);
  add('empty', '100%', node('Empty.Root', {}, [
    node('Empty.Header', {}, [
      text('Empty.Media', '＋', { variant: 'icon' }), text('Empty.Title', t('No Projects Yet', '아직 프로젝트가 없습니다')),
      text('Empty.Description', t('Choose an example to see how a project is structured.', '예제를 열어 프로젝트 구성을 확인하세요.')),
    ]),
    node('Empty.Content', {}, [button(t('Browse examples', '예제 보기'), { href: t('/examples/', '/ko/examples/') })]),
    button(t('Learn More', '자세히 알아보기'), { variant: 'link', href: t('/docs/', '/ko/docs/') }),
  ]));
  const month = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1).padStart(2, '0') }));
  const year = Array.from({ length: 9 }, (_, i) => ({ value: String(2026 + i), label: String(2026 + i) }));
  add('field', 448, stack([
    node('Field.Set', {}, [
      text('Field.Legend', t('Payment Method', '결제 수단')), text('Field.Description', t('Use sample values to try the field layout.', '예시 값으로 입력 필드 구성을 체험해 보세요.')),
      stack([
        labelled(t('Name on Card', '카드 소유자'), input('reference-card-name', { placeholder: 'Alex Morgan' }), 'reference-card-name'),
        labelled(t('Card Number', '카드 번호'), input('reference-card-number', { placeholder: '0000 0000 0000 0000', inputmode: 'numeric' }), 'reference-card-number', t('Enter your 16-digit card number.', '카드 번호 16자리를 입력하세요.')),
        row([
          node('Field.Field', { style: 'flex: 1; min-width: 5rem' }, [text('Field.Label', t('Month', '월')), select('MM', month)]),
          node('Field.Field', { style: 'flex: 1; min-width: 5rem' }, [text('Field.Label', t('Year', '연도')), select('YYYY', year)]),
          labelled('CVV', input('reference-card-cvv', { placeholder: '123', inputmode: 'numeric' }), 'reference-card-cvv'),
        ]),
      ], 'gap: 1rem'),
    ]),
    node('Field.Separator'),
    node('Field.Set', {}, [
      text('Field.Legend', t('Billing Address', '청구지 주소')),
      text('Field.Description', t('The billing address for this payment method.', '이 결제 수단의 청구지 주소입니다.')),
      check('reference-card-address', t('Same as shipping address', '배송지 주소와 동일'), { checked: true }),
    ]),
    labelled(t('Comments', '요청 사항'), node('Textarea', { id: 'reference-card-comments' }), 'reference-card-comments'),
  ], 'gap: 1.25rem'));
  add('hover-card', 'fit-content', node('HoverCard.Root', {}, [
    child('HoverCard.Trigger', button(t('Hover Here', '여기에 마우스 올리기'), { variant: 'outline', href: 'https://svelte.dev/' })),
    node('HoverCard.Content', {}, [row([
      avatar('SV', 'https://github.com/sveltejs.png'), stack([
        paragraph('@sveltejs', { variant: 'small' }),
        paragraph(t('A framework for building web apps with Svelte.', 'Svelte로 웹 앱을 만드는 프레임워크입니다.'), { variant: 'muted' }),
        paragraph(t('Joined December 2021', '2021년 12월 가입'), { variant: 'muted' }),
      ], 'flex: 1; gap: .375rem'),
    ], 'align-items: flex-start')]),
  ]));
  add('input', 320, labelled(t('API Key', 'API 키'), input('reference-api-key', { type: 'password', placeholder: 'sk_••••••••••••' }),
    'reference-api-key', t('Enter a sample value to try password masking.', '예시 값을 입력해 마스킹을 확인하세요.')));
  add('input', 320, input('reference-email-invalid', { type: 'email', value: 'invalid', 'aria-invalid': true, 'aria-label': t('Email', '이메일') }), undefined, t('Invalid', '유효성 오류'), 'input-invalid');
  add('input-group', 320, node('InputGroup.Root', {}, [
    node('InputGroup.Addon', {}, [text('InputGroup.Text', '⌕')]),
    bound('InputGroup.Input', 'search', string, { placeholder: t('Search…', '검색…'), 'aria-label': t('Search', '검색') }, 'value', 'input'),
    node('InputGroup.Addon', { align: 'inline-end' }, [
      node('InputGroup.Button', { text: t('Clear', '지우기'), size: 'sm', variant: 'ghost' }, [], { on: controlled('search', string, 'click', '') }),
    ]),
  ]), { search: state('', string) });
  adapt('input-otp', 'fit-content', view => {
    const cells = view.render.slots.default.flatMap(part => part.slots?.default ?? []);
    view.render.slots.default = [node('InputOtp.Group', {}, cells)];
  });
  add('item', 448, stack([
    node('Item.Root', { variant: 'outline' }, [
      node('Item.Content', {}, [text('Item.Title', t('Basic Item', '기본 항목')), text('Item.Description', t('A simple item with title and description.', '제목과 설명이 있는 항목입니다.'))]),
      node('Item.Actions', {}, [button(t('View components', '컴포넌트 보기'), { variant: 'outline', size: 'sm', href: t('/docs/ui/components/', '/ko/docs/ui/components/') })]),
    ]),
    node('Item.Root', { variant: 'muted' }, [
      text('Item.Media', '✓', { variant: 'icon' }),
      node('Item.Content', {}, [text('Item.Title', t('Your profile has been verified.', '프로필을 확인했습니다.'))]),
    ]),
  ], 'gap: .75rem'));
  add('kbd', 100, stack([
    node('Kbd.Group', {}, ['⌘', '⇧', '⌥', '⌃'].map(key => text('Kbd.Root', key))),
    node('Kbd.Group', {}, ['Ctrl', '+', 'B'].map(key => text('Kbd.Root', key))),
  ], 'align-items: center; gap: .75rem'));
  add('label', 260, check('reference-label', terms, {}));
  add('marker', 384, stack([
    ['↪', t('Switched to a new branch', '새 브랜치로 전환했습니다')],
    ['◌', t('Thinking…', '생각 중…')],
    ['✓', t('Conversation compacted', '대화를 요약했습니다')],
    ['▤', t('Explored 4 files', '파일 4개를 살펴봤습니다')],
  ].map(([icon, label]) => node('Marker.Root', {}, [text('Marker.Icon', icon), text('Marker.Content', label)])), 'gap: .75rem'));
  add('menubar', 'fit-content', menuFeedback(node('Menubar.Root', {}, [
    ['File', '파일', [t('New Tab', '새 탭'), t('New Window', '새 창'), t('Share', '공유'), t('Print…', '인쇄…')]],
    ['Edit', '편집', [t('Undo', '실행 취소'), t('Redo', '다시 실행'), t('Cut', '잘라내기'), t('Copy', '복사'), t('Paste', '붙여넣기')]],
    ['View', '보기', [t('Reload', '새로고침'), t('Zoom In', '확대'), t('Toggle Fullscreen', '전체 화면 전환')]],
    ['Profiles', '프로필', [t('Personal', '개인'), t('Work', '업무'), t('Add Profile', '프로필 추가')]],
  ].map(([name, ko, items]) => node('Menubar.Menu', { value: name.toLowerCase() }, [
    text('Menubar.Trigger', t(name, ko)), node('Menubar.Content', {}, [node('Menubar.Group', {}, items.map(label => menuChoice('Menubar', label)))]),
  ])))), selectionState);
  const message = (initials, label, align, reaction, footer) => node('Message.Root', { align }, [
    node('Message.Avatar', {}, [avatar(initials)]),
    node('Message.Content', {}, [bubble(label, align, reaction), ...(footer ? [text('Message.Footer', footer)] : [])]),
  ]);
  add('message', 384, node('Message.Group', {}, [
    message('ME', t('Deploying to prod real quick.', '운영에 잠깐 배포할게요.'), 'end'),
    message('R', t("It's 4:55 PM. On a Friday.", '금요일 오후 4시 55분이에요.'), 'start'),
    message('ME', t("It's a one-line change.", '한 줄만 바꿨어요.'), 'end', undefined, t('Delivered', '전달됨')),
    message('R', t("It's always a one-line change. Let me take a look.", '항상 한 줄만 바뀌죠. 같이 확인해볼게요.'), 'start', '👍'),
    node('Marker.Root', {}, [text('Marker.Content', t('Oliver is typing…', 'Oliver 님이 입력 중…'))]),
  ]));
  adapt('message-scroller', 384, (view, parts) => {
    parts('Card.Title')[0].inputs.text = t('New Chat', '새 대화');
    parts('Card.Description')[0].inputs.text = t('How can I help you today?', '무엇을 도와드릴까요?');
    parts('MessageScroller.Root')[0].inputs.style = 'height: 24rem';
    parts('MessageScroller.Item').slice(0, 4).forEach((item, i) => {
      parts('Bubble.Content', item)[0].inputs.text = [
        t('Morning, shadcn!', '안녕하세요!'),
        t('What are we working on today?', '오늘은 무엇을 할까요?'),
        t("I'm building a chat for our app.", '앱에 채팅 기능을 만들고 있어요.'),
        t('Tell me how the messages should scroll.', '메시지 스크롤이 어떻게 동작해야 하는지 알려주세요.'),
      ][i];
    });
    const path = value => ({ '@path': value });
    const valuePort = schema => ({ kind: 'Value', schema, required: true });
    view.states = {
      draft: state('', string), sent: state([]),
      nextMessages: { kind: 'Derived', schema: true, variable: {
        ports: { sent: valuePort(true), draft: valuePort(string) },
        expression: 'sent + [{"id": string(size(sent)), "text": draft}]',
      }, inputs: { sent: read('sent'), draft: read('draft') } },
      emptyDraft: { kind: 'Derived', schema: boolean, variable: {
        ports: { draft: valuePort(string) }, expression: 'size(draft) == 0',
      }, inputs: { draft: read('draft') } },
    };
    parts('MessageScroller.Content')[0].slots.default.push({
      ...node('MessageScroller.Item', { messageId: path('/repeat/message/id') }, [message('ME', path('/repeat/message/text'), 'end')]),
      repeat: { items: read('sent'), as: 'message', key: path('/repeat/message/id') },
    });
    parts('Card.Root')[0].slots.default.push(node('Card.Footer', {}, [node('InputGroup.Root', {}, [
      bound('InputGroup.Input', 'draft', string, { placeholder: t('Send a message', '메시지 보내기'), 'aria-label': t('Message', '메시지') }, 'value', 'input'),
      node('InputGroup.Addon', { align: 'inline-end' }, [node('InputGroup.Button', { text: t('Send', '보내기'), disabled: read('emptyDraft') }, [], {
        on: { click: {
          action: {
            ports: { sent: { kind: 'State', schema: true, required: true }, draft: { kind: 'State', schema: string, required: true }, next: valuePort(true) },
            steps: [{ kind: 'SetState', target: path('/ports/sent'), value: path('/ports/next') }, { kind: 'SetState', target: path('/ports/draft'), value: '' }],
          },
          inputs: { sent: read('sent'), draft: read('draft'), next: read('nextMessages') },
        } },
      })]),
    ])]));
  });
  const statuses = options([['', t('Select status', '상태 선택')], ['todo', t('Todo', '할 일')], ['in-progress', t('In Progress', '진행 중')], ['done', t('Done', '완료')], ['cancelled', t('Cancelled', '취소')]]);
  add('native-select', 'fit-content', node('NativeSelect.Root', { 'aria-label': t('Status', '상태') }, statuses.map(item => text('NativeSelect.Option', item.label, { value: item.value }))));

  const docsLink = t('/docs/', '/ko/docs/');
  const navItem = (value, label, links) => node('NavigationMenu.Item', { value }, [
    text('NavigationMenu.Trigger', label),
    node('NavigationMenu.Content', {}, [stack(links.map(([title, url]) => text('NavigationMenu.Link', title, { href: url })),
      'width: min(18rem, calc(100vw - 5rem)); gap: .25rem')]),
  ]);
  add('navigation-menu', 'fit-content', node('NavigationMenu.Root', {}, [node('NavigationMenu.List', {}, [
    navItem('getting-started', t('Getting started', '시작하기'), [[t('Introduction', '소개'), docsLink], [t('Installation', '설치'), docsLink + 'installation/'], ['Typography', docsLink + 'ui/components/typography/']]),
    navItem('components', t('Components', '컴포넌트'), ['Alert Dialog', 'Hover Card', 'Progress', 'Scroll Area', 'Tabs', 'Tooltip'].map(label => [label, docsLink + 'ui/components/' + label.toLowerCase().replaceAll(' ', '-') + '/'])),
    navItem('tools', t('Tools', '도구'), [[t('Examples', '예제'), t('/examples/', '/ko/examples/')], [t('Playground', '플레이그라운드'), t('/playground/', '/ko/playground/')]]),
    node('NavigationMenu.Item', { value: 'docs' }, [text('NavigationMenu.Link', t('Docs', '문서'), { href: docsLink })]),
  ])]));
  adapt('pagination', '100%', view => {
    view.render.inputs.style = 'align-items: center; gap: .75rem';
  });
  const dimensions = [
    ['width', t('Width', '너비'), '100%'], ['max-width', t('Max. width', '최대 너비'), '300px'],
    ['height', t('Height', '높이'), '25px'], ['max-height', t('Max. height', '최대 높이'), 'none'],
  ];
  add('popover', 'fit-content', node('Popover.Root', {}, [
    child('Popover.Trigger', button(t('Open popover', '팝오버 열기'), { variant: 'outline' })),
    node('Popover.Content', {}, [
      node('Popover.Header', {}, [text('Popover.Title', t('Dimensions', '크기')), text('Popover.Description', t('Set the dimensions for the layer.', '레이어의 크기를 설정하세요.'))]),
      stack(dimensions.map(([name, label, value]) => row([
        text('Label', label, { for: 'reference-dimension-' + name, style: 'width: 6rem' }),
        input('reference-dimension-' + name, { value, style: 'width: 7.5rem' }),
      ], 'flex-wrap: nowrap')), 'gap: .5rem'),
    ]),
  ]));
  add('progress', 335, node('Progress', { value: 65, max: 100, 'aria-label': t('Progress', '진행률') }));
  add('progress', 335, stack([
    row([paragraph(t('Uploading…', '업로드 중…'), { variant: 'small' }), paragraph('65%', { variant: 'small' })], 'justify-content: space-between'),
    node('Progress', { value: 65, max: 100, 'aria-label': t('Upload progress', '업로드 진행률') }),
  ], 'gap: .5rem'), undefined, t('Label', '라벨'), 'progress-label');
  adapt('questionnaire', 448, (view, parts) => {
    parts('Questionnaire.Title')[0].inputs.text = t('What should the agent build next?', '에이전트가 다음에 무엇을 만들까요?');
    parts('Questionnaire.Description')[0].inputs.text = t('Choose a direction or describe another task.', '방향을 선택하거나 다른 작업을 설명하세요.');
    parts('Typography', parts('Questionnaire.Choice')[0])[0].inputs.text = t('Tool call timeline', '도구 호출 타임라인');
    parts('Questionnaire.ChoiceDescription')[0].inputs.text = t('Show each tool call and its result.', '각 도구 호출과 결과를 표시합니다.');
    parts('Questionnaire.Choice')[1].inputs.text = t('Approval checkpoints', '승인 확인');
    parts('Questionnaire.Choices')[0].slots.default.splice(2, 0,
      text('Questionnaire.Choice', t('Workspace handoff', '작업 공간 인계'), { value: 'handoff' }));
    parts('Questionnaire.Input')[0].inputs.placeholder = t('Another agent feature', '다른 에이전트 기능');
    parts('Questionnaire.Item')[1].inputs.required = false;
    parts('Questionnaire.Title')[1].inputs.text = t('What should the first version include?', '첫 버전에 무엇을 넣을까요?');
    parts('Questionnaire.Choice').at(-1).inputs.text = t('Show the latest result', '최신 결과 표시');
    parts('Questionnaire.Root')[0].inputs.items.push({ name: 'review', required: false });
    parts('Questionnaire.Root')[0].slots.default.splice(-1, 0, node('Questionnaire.Item', { name: 'review' }, [
      text('Questionnaire.Title', t('Ready to review?', '검토할 준비가 됐나요?')),
      node('Questionnaire.Choices', {}, [text('Questionnaire.Choice', t('Ready', '준비 완료'), { value: 'ready' })]),
    ]));
    parts('Questionnaire.Progress')[0].inputs.text = { '@call': 'formatString', args: {
      value: t('Question ${/states/questionNumber} of 3', '3개 질문 중 ${/states/questionNumber}번째'),
    } };
    view.states.questionNumber.variable.expression = 'question == "format" ? 1 : question == "detail" ? 2 : 3';
  });
  add('radio-group', 'fit-content', radios('reference-density',
    options([['default', t('Default', '기본')], ['comfortable', t('Comfortable', '여유 있게')], ['compact', t('Compact', '촘촘하게')]]),
    { value: 'comfortable', 'aria-label': t('Density', '밀도') }));
  add('range-calendar', 'fit-content', bound('RangeCalendar.Root', 'date', true, { locale: lang, placeholder: today }, 'value', 'valueChange'),
    { date: state({ start: '2026-11-02', end: '2026-11-06' }) });
  const panes = (direction, withHandle) => node('Resizable.PaneGroup', { direction, style: 'height: 202px; border: 1px solid var(--border); border-radius: .5rem' },
    [t('One', '하나'), t('Two', '둘'), t('Three', '셋')].flatMap((label, i) => [
      ...(i ? [node('Resizable.Handle', { withHandle })] : []),
      node('Resizable.Pane', { defaultSize: i === 0 ? 50 : 25, minSize: 10, style: 'display: grid; place-items: center' }, [paragraph(label, { variant: 'small' })]),
    ]));
  add('resizable', 384, panes('horizontal', false));
  add('resizable', 384, panes('vertical', true), undefined, t('Vertical with handle', '세로형과 핸들'), 'resizable-vertical');
  add('scroll-area', 192, node('ScrollArea.Root', { style: 'height: 288px; border: 1px solid var(--border); border-radius: .5rem', type: 'hover' }, [
    stack([paragraph('Tags', { variant: 'small' }), ...Array.from({ length: 50 }, (_, i) => [
      paragraph('v1.2.0-beta.' + (50 - i), { variant: 'small' }), node('Separator'),
    ]).flat()], 'padding: 1rem; gap: .5rem'),
  ]));
  add('select', 192, select(t('Select a fruit', '과일 선택'), fruits, t('Fruits', '과일')));
  add('select', 192, select(t('Select a fruit', '과일 선택'), fruits, undefined, { disabled: true }), undefined, t('Disabled', '비활성화'), 'select-disabled');
  add('separator', 384, stack([
    paragraph('shadcn/ui', { variant: 'small' }), paragraph(t('The Foundation for your Design System', '디자인 시스템의 기반'), { variant: 'muted' }),
    node('Separator'), paragraph(t('Customizable components for building your own design system.', '디자인 시스템에 맞춰 확장할 수 있는 컴포넌트입니다.'), { variant: 'small' }),
  ], 'gap: .75rem'));
  add('sheet', 'fit-content', overlay('Sheet', t('Open', '열기'), titleProfile, descProfile,
    [stack(nameFields('reference-sheet').slots.default, 'padding-inline: 1rem; gap: 1rem')],
    [close('Sheet', saveProfile, 'default'), close('Sheet', t('Close', '닫기'))]));
  adapt('sidebar', '100%', (view, parts) => {
    view.render.inputs.style = 'min-height: 18rem; --sidebar-width: min(52%, 13rem); border: 1px solid var(--border); border-radius: .75rem';
    const sidebar = parts('Sidebar.Root')[0];
    sidebar.inputs = {};
    sidebar.slots.default.unshift(node('Sidebar.Header', {}, [paragraph('Acme Inc', { variant: 'small' })]));
    const inset = view.render.slots.default[1];
    inset.componentRef = 'shadcn.Sidebar.Inset';
    inset.slots.default.unshift(node('Sidebar.Trigger', { 'aria-label': t('Toggle Sidebar', '사이드바 전환') }));
  });
  const skeleton = style => node('Skeleton', { style });
  add('skeleton', 314, row([
    skeleton('width: 3rem; height: 3rem; border-radius: 50%'),
    stack([skeleton('width: 100%; height: .875rem'), skeleton('width: 80%; height: .875rem')], 'flex: 1; gap: .5rem'),
  ], 'flex-wrap: nowrap; gap: 1rem'));
  add('skeleton', 314, stack([skeleton('width: 100%; height: 8rem'), skeleton('width: 85%; height: .875rem'), skeleton('width: 65%; height: .875rem')], 'gap: .75rem'), undefined, t('Card', '카드'), 'skeleton-card');
  add('slider', 320, bound('Slider', 'value', number, { type: 'single', max: 100, step: 1, 'aria-label': t('Value', '값') }), { value: state(75, number) });
  add('slider', 320, node('Slider', { type: 'single', value: 50, disabled: true, 'aria-label': t('Value', '값') }), undefined, t('Disabled', '비활성화'), 'slider-disabled');
  adapt('sonner', 'fit-content', (_view, parts) => {
    const trigger = parts('Button')[0];
    trigger.inputs = { variant: 'outline', text: t('Show Toast', '알림 표시') };
    trigger.on.click.inputs = { title: t('Event has been created', '이벤트를 만들었습니다'), description: t('Monday, November 2, 2026 at 9:00 AM', '2026년 11월 2일 월요일 오전 9:00') };
    parts('Sonner')[0].inputs.closeButton = false;
  });
  add('spinner', 320, node('Item.Root', { variant: 'outline' }, [
    node('Item.Media', {}, [node('Spinner', { 'aria-label': t('Processing', '처리 중') })]),
    node('Item.Content', {}, [text('Item.Title', t('Processing payment…', '결제 처리 중…'))]),
    node('Item.Actions', {}, [paragraph('$100.00', { variant: 'small' })]),
  ]));
  variant('spinner', 'button', t('Inside a button', '버튼 안에 표시'), 'fit-content', node('Button', { disabled: true, 'aria-busy': true }, [
    node('Spinner', { 'data-icon': 'inline-start', 'aria-hidden': true }),
    paragraph(t('Please wait', '잠시 기다려 주세요'), { as: 'span', variant: 'small' }),
  ]));
  add('switch', 170, field(node('Switch', { id: 'reference-airplane-mode' }), text('Label', t('Airplane Mode', '비행기 모드'), { for: 'reference-airplane-mode' })));
  add('switch', 170, field(node('Switch', { id: 'reference-disabled-mode', disabled: true, checked: true }), text('Label', t('Airplane Mode', '비행기 모드'), { for: 'reference-disabled-mode' })), undefined, t('Disabled', '비활성화'), 'switch-disabled');
  const invoices = [
    ['INV001', 'Paid', 'Credit Card', '$250.00'], ['INV002', 'Pending', 'PayPal', '$150.00'], ['INV003', 'Unpaid', 'Bank Transfer', '$350.00'],
    ['INV004', 'Paid', 'Credit Card', '$450.00'], ['INV005', 'Paid', 'PayPal', '$550.00'], ['INV006', 'Pending', 'Bank Transfer', '$200.00'],
    ['INV007', 'Unpaid', 'Credit Card', '$300.00'],
  ];
  const tableRow = (values, cell = 'Table.Cell') => node('Table.Row', {}, values.map((label, i) => text(cell, label, i === 3 ? { style: 'text-align: end' } : {})));
  add('table', '100%', node('Table.Root', {}, [
    text('Table.Caption', t('A list of your recent invoices.', '최근 청구서 목록입니다.')),
    node('Table.Header', {}, [tableRow([t('Invoice', '청구서'), t('Status', '상태'), t('Method', '결제 수단'), t('Amount', '금액')], 'Table.Head')]),
    node('Table.Body', {}, invoices.map(values => tableRow(values))),
    node('Table.Footer', {}, [node('Table.Row', {}, [text('Table.Cell', t('Total', '합계'), { colspan: 3 }), text('Table.Cell', '$2,250.00', { style: 'text-align: end' })])]),
  ]));
  const tabs = [
    ['overview', t('Overview', '개요'), t('View key metrics and recent project activity.', '주요 지표와 최근 프로젝트 활동을 확인하세요.'), t('You have 12 active projects and 3 pending tasks.', '진행 중인 프로젝트 12개와 대기 작업 3개가 있습니다.')],
    ['analytics', t('Analytics', '분석'), t('Explore activity trends across your projects.', '프로젝트 활동 추세를 살펴보세요.'), t('Review activity for the last 30 days.', '최근 30일간의 활동을 확인하세요.')],
    ['reports', t('Reports', '보고서'), t('Find project reports in one place.', '프로젝트 보고서를 한 곳에서 확인하세요.'), t('Your latest reports are ready to review.', '최신 보고서를 검토할 수 있습니다.')],
    ['settings', t('Settings', '설정'), t('Manage your project preferences.', '프로젝트 환경을 관리하세요.'), t('Update your notifications and defaults.', '알림과 기본값을 수정하세요.')],
  ];
  const tabsExample = (vertical = false) => node('Tabs.Root', { value: 'overview', ...(vertical ? { orientation: 'vertical' } : {}) }, [
    node('Tabs.List', {}, tabs.map(([value, label]) => text('Tabs.Trigger', label, { value }))),
    ...tabs.map(([value, label, description, body]) => node('Tabs.Content', { value }, [node('Card.Root', {}, [
      node('Card.Header', {}, [text('Card.Title', label), text('Card.Description', description)]),
      node('Card.Content', {}, [paragraph(body)]),
    ])])),
  ]);
  add('tabs', 400, tabsExample());
  add('tabs', 448, tabsExample(true), undefined, t('Vertical', '세로형'), 'tabs-vertical');
  add('textarea', 320, node('Textarea', { placeholder: t('Type your message here.', '메시지를 입력하세요.'), 'aria-label': t('Message', '메시지') }));
  variant('textarea', 'field', t('Field with a character limit', '글자 수 제한이 있는 입력 필드'), 320, node('Field.Field', {}, [
    text('Field.Label', t('Message', '메시지'), { for: 'reference-message-field' }),
    node('Textarea', {
      id: 'reference-message-field', maxlength: 160, 'aria-describedby': 'reference-message-length',
      placeholder: t('Type your message here.', '메시지를 입력하세요.'),
    }),
    text('Field.Description', t('Use up to 160 characters.', '최대 160자까지 입력할 수 있습니다.'), { id: 'reference-message-length' }),
  ]));
  add('toggle', 'fit-content', node('Toggle', { text: t('Bookmark', '북마크'), variant: 'outline', size: 'sm', 'aria-label': t('Toggle bookmark', '북마크 전환') }));
  add('toggle-group', 'fit-content', node('ToggleGroup.Root', { type: 'multiple', variant: 'outline', value: [] }, [
    text('ToggleGroup.Item', 'B', { value: 'bold', 'aria-label': t('Toggle bold', '굵게 전환') }),
    text('ToggleGroup.Item', '𝘐', { value: 'italic', 'aria-label': t('Toggle italic', '기울임 전환') }),
    text('ToggleGroup.Item', 'S̶', { value: 'strike', 'aria-label': t('Toggle strikethrough', '취소선 전환') }),
  ]));
  add('tooltip', 'fit-content', node('Tooltip.Provider', {}, [node('Tooltip.Root', {}, [
    child('Tooltip.Trigger', button(t('Hover', '마우스 올리기'), { variant: 'outline' })),
    text('Tooltip.Content', t('Add to library', '라이브러리에 추가')),
  ])]));
  const traceStep = (title, command, output) => node('Trace.Collapsible', {}, [
    text('Trace.CollapsibleTrigger', title),
    node('Trace.CollapsibleContent', {}, [
      text('Trace.Line', command),
      node('CodeBlock.Root', {}, [node('CodeBlock.Content', {}, [node('CodeBlock.Line', { code: output })])]),
    ]),
  ]);
  add('trace', 384, stack([
    message('ME', t('Why does pnpm install fail in CI?', 'CI에서 pnpm install이 왜 실패하나요?'), 'end'),
    node('Trace.Root', {}, [
      traceStep(t('Thought for 5s', '5초 동안 생각함'), t('Check package versions and lockfile.', '패키지 버전과 잠금 파일을 확인합니다.'), 'pnpm --version'),
      traceStep(t('Ran pnpm --version', 'pnpm --version 실행'), 'pnpm --version', '10.2.1'),
      traceStep(t('Inspected the package diff', '패키지 변경 확인'), 'git diff --stat HEAD~1 -- package.json pnpm-lock.yaml', 'package.json | 2 +-'),
      traceStep(t('Failed to run pnpm install', 'pnpm install 실행 실패'), 'pnpm install --frozen-lockfile', 'ERR_PNPM_OUTDATED_LOCKFILE'),
    ]),
  ], 'gap: .75rem'));
  add('typography', '100%', stack([
    paragraph(t('Taxing Laughter: The Joke Tax Chronicles', '웃음에 세금을 매긴 왕국'), { as: 'h1', variant: 'h1' }),
    paragraph(t('Long ago, a king looked for new ways to fill the royal treasury. His advisers gathered to discuss an unusual proposal.', '옛날 한 왕이 국고를 채울 방법을 찾았습니다. 신하들은 특이한 제안을 논의하려고 모였습니다.')),
    paragraph(t('The King’s Plan', '왕의 계획'), { as: 'h2', variant: 'h2' }),
    paragraph(t('The king decided to charge his subjects whenever they told a joke.', '왕은 백성이 농담을 할 때마다 세금을 걷기로 했습니다.')),
    paragraph(t('Laughter should never be taxed.', '웃음에 세금을 매길 수는 없습니다.'), { as: 'blockquote', variant: 'blockquote' }),
    paragraph(t('The People’s Rebellion', '백성의 저항'), { as: 'h3', variant: 'h3' }),
    paragraph(t('People shared jokes in secret, and laughter spread through the kingdom again.', '사람들은 몰래 농담을 나누었고 웃음은 왕국에 다시 퍼졌습니다.')),
    paragraph(t('The End of the Tax', '세금의 끝'), { as: 'h4', variant: 'h4' }),
    paragraph(t('The king finally lifted the tax.', '마침내 왕은 세금을 없앴습니다.')),
    tableRowAsTable(),
  ], 'gap: 1.25rem'));
  function tableRowAsTable() {
    return node('Table.Root', {}, [
      node('Table.Header', {}, [tableRow([t('Treasury', '국고'), t('People', '백성')], 'Table.Head')]),
      node('Table.Body', {}, [tableRow([t('Empty', '비어 있음'), t('Happy', '행복함')])]),
    ]);
  }

  // These examples demonstrate a distinct input, state, or composition for each family.
  variant('alert', 'action', t('With an action', '동작 버튼 포함'), 448, node('Alert.Root', {}, [
    text('Alert.Title', t('Update available', '업데이트가 있습니다')),
    text('Alert.Description', t('See what changed before updating.', '업데이트 전에 변경 내용을 확인하세요.')),
    node('Alert.Action', {}, [button(t('Read the guide', '가이드 읽기'), { variant: 'outline', size: 'sm', href: docsLink })]),
  ]));
  const compactAlert = structuredClone(alertDialog);
  compactAlert.slots.default[1].inputs = { size: 'sm' };
  variant('alert-dialog', 'compact', t('Compact confirmation', '작은 확인 창'), 'fit-content',
    bound('AlertDialog.Root', 'open', boolean, {}, 'open', 'openChange', compactAlert.slots.default), { open: state(false, boolean) });
  variant('aspect-ratio', 'square-and-portrait', t('Square and portrait', '정사각형과 세로형'), 384, row(
    [[1, '1:1'], [3 / 4, '3:4']].map(([ratio, label]) => stack([
      paragraph(label, { variant: 'small' }),
      node('AspectRatio', { ratio }, [node('Card.Root', { style: 'height: 100%; background: var(--muted)' })]),
    ], 'width: 7rem; gap: .5rem')),
    'justify-content: center; align-items: flex-start',
  ));
  variant('attachment', 'error', t('Upload error', '업로드 오류'), 384,
    attachment('invoice.pdf', t('Upload failed · File is too large', '업로드 실패 · 파일이 너무 큽니다'), 'error', 'PDF'));
  variant('attachment', 'download', t('Download a completed attachment', '완료된 첨부 파일 다운로드'), 360,
    node('Attachment.Root', { state: 'done' }, [
      text('Attachment.Media', 'CSV'),
      node('Attachment.Content', {}, [
        text('Attachment.Title', 'project-status.csv'),
        text('Attachment.Description', t('CSV · Sample report', 'CSV · 예시 보고서')),
      ]),
      node('Attachment.Actions', {}, [
        text('Attachment.Action', t('Download', '다운로드'), {
          href: 'data:text/csv;charset=utf-8,project%2Cstatus%0Awebsite%2Cready%0A',
          download: 'project-status.csv', variant: 'outline', size: 'sm',
        }),
      ]),
    ]));
  variant('avatar', 'fallbacks', t('Initials without images', '이미지 없이 이니셜 표시'), 'fit-content', row([
    avatar('AL'), avatar('JM', undefined, true), avatar('SK'),
  ], 'justify-content: center'));
  variant('breadcrumb', 'custom-separator', t('Custom separator', '구분자 바꾸기'), 'fit-content', node('Breadcrumb.Root', {}, [
    node('Breadcrumb.List', {}, [
      breadcrumbItem(t('Docs', '문서'), docsLink), text('Breadcrumb.Separator', '/'),
      breadcrumbItem('UI', docsLink + 'ui/'), text('Breadcrumb.Separator', '/'),
      breadcrumbItem(t('Current page', '현재 페이지')),
    ]),
  ]));
  variant('bubble', 'appearance', t('Outline and tinted bubbles', '외곽선과 색조 말풍선'), 384, stack([
    node('Bubble.Root', { variant: 'outline', align: 'start' }, [text('Bubble.Content', t('Outlined reply', '외곽선 답변'))]),
    node('Bubble.Root', { variant: 'tinted', align: 'end' }, [text('Bubble.Content', t('Tinted reply', '색조 답변'))]),
  ], 'gap: .75rem'));
  variant('button', 'action', t('Run an action on click', '클릭으로 Action 실행'), 'fit-content', stack([
    button(t('Save draft', '초안 저장'), {}, controlled('saved', boolean, 'click', true)),
    { ...status(t('Draft saved.', '초안을 저장했습니다.')), when: read('saved') },
  ], 'align-items: center; gap: .75rem'), { saved: state(false, boolean) });
  variant('button-group', 'vertical', t('Vertical group', '세로 버튼 그룹'), 'fit-content', node('ButtonGroup.Root', {
    orientation: 'vertical', 'aria-label': t('Documentation links', '문서 링크'),
  }, [
    button(t('Overview', '개요'), { variant: 'outline', href: docsLink + 'ui/' }),
    button(t('Components', '컴포넌트'), { variant: 'outline', href: docsLink + 'ui/components/' }),
    button('API', { variant: 'outline', href: docsLink + 'ui/api/' }),
  ]));
  variant('calendar', 'date-limits', t('Limit selectable dates', '선택할 날짜 제한'), 'fit-content',
    bound('Calendar.Root', 'date', true, { locale: lang, type: 'single', captionLayout: 'label', placeholder: today,
      minValue: '2026-11-02', maxValue: '2026-11-13', weekStartsOn: 1 }, 'value', 'valueChange'), { date: state(today) });
  variant('calendar', 'multiple-dates', t('Select non-consecutive dates', '떨어진 날짜 여러 개 선택'), 'fit-content',
    bound('Calendar.Root', 'dates', true, { locale: lang, type: 'multiple', captionLayout: 'label', placeholder: today },
      'value', 'valueChange'), { dates: state([today, '2026-11-05']) });
  variant('card', 'summary', t('Summary with a footer', '푸터가 있는 요약 카드'), 320, node('Card.Root', {}, [
    node('Card.Header', {}, [text('Card.Title', t('Workspace', '작업 공간')), text('Card.Description', t('A quick view of this month', '이번 달 요약'))]),
    node('Card.Content', {}, [paragraph(t('12 active projects', '진행 중인 프로젝트 12개'), { variant: 'large' })]),
    node('Card.Footer', {}, [button(t('View documentation', '문서 보기'), { variant: 'outline', href: docsLink })]),
  ]));
  variant('carousel', 'vertical', t('Vertical slides', '세로 슬라이드'), 176, node('Carousel.Root', { orientation: 'vertical', style: 'margin: 2.25rem 0' }, [
    node('Carousel.Content', { style: 'height: 8rem' }, [1, 2, 3].map(value => node('Carousel.Item', { style: 'height: 8rem' }, [
      node('Card.Root', {}, [node('Card.Content', { style: 'height: 7rem; display: grid; place-items: center' }, [paragraph(String(value), { variant: 'large' })])]),
    ]))),
    node('Carousel.Previous', { 'aria-label': t('Previous slide', '이전 슬라이드') }),
    node('Carousel.Next', { 'aria-label': t('Next slide', '다음 슬라이드') }),
  ]));
  variant('chart', 'line-series', t('Line chart with two series', '두 계열 선 차트'), '100%', node('Chart', {
    kind: 'line', data: visits.slice(0, 6), x: 'day', series: series.flat(), label: t('Desktop and mobile visitors', '데스크톱·모바일 방문자'),
  }));
  const deviceShares = [
    { device: t('Desktop', '데스크톱'), share: 55 },
    { device: t('Mobile', '모바일'), share: 35 },
    { device: t('Tablet', '태블릿'), share: 10 },
  ];
  variant('chart', 'pie-share', t('Pie chart with a legend', '범례가 있는 원형 차트'), 400, stack([
    node('Chart', {
      kind: 'pie', data: deviceShares, x: 'device', series: [{ id: 'share', key: 'share' }],
      label: t('Share of visitors by device', '기기별 방문자 비율'),
    }),
    row(deviceShares.map(({ device, share }, index) => text('Badge', `${device} ${share}%`, {
      variant: 'outline', style: `border-inline-start: .25rem solid var(--chart-${index + 1})`,
    })), 'justify-content: center'),
  ], 'gap: .75rem'));
  variant('checkbox', 'states', t('Mixed and disabled states', '부분 선택과 비활성 상태'), 320, stack([
    check('reference-checkbox-mixed', t('Some items selected', '일부 항목 선택됨'), { indeterminate: true }),
    check('reference-variant-terms-disabled', terms, { disabled: true }),
  ], 'gap: .75rem'));
  variant('code-block', 'line-numbers', t('Line numbers and wrapping', '줄 번호와 줄바꿈'), 512, node('CodeBlock.Root', {}, [
    node('CodeBlock.Header', {}, [text('CodeBlock.Title', 'settings.json')]),
    node('CodeBlock.Content', { lineNumbers: true, startLine: 12, wrap: true, code: '{\n  "description": "A long setting value wraps within the code block on narrow screens.",\n  "theme": "system"\n}' }),
  ]));
  variant('collapsible', 'initially-open', t('Open initially', '처음부터 펼치기'), 350,
    bound('Collapsible.Root', 'open', boolean, {}, 'open', 'openChange', [
      text('Collapsible.Trigger', t('Delivery details', '배송 정보')),
      node('Collapsible.Content', {}, [paragraph(t('Standard delivery takes 5–7 days.', '일반 배송은 5~7일 걸립니다.'), { variant: 'muted' })]),
    ]), { open: state(true, boolean) });
  variant('combobox', 'preselected', t('Initial selection and empty results', '초기 선택과 검색 결과 없음'), 224,
    bound('Combobox', 'framework', string, { options: frameworks, placeholder: t('Select a framework', '프레임워크 선택'),
      searchPlaceholder: t('Search framework…', '프레임워크 검색…'), emptyText: t('No matching frameworks', '일치하는 프레임워크가 없습니다') }),
    { framework: state('astro', string) });
  variant('command', 'keywords', t('Search aliases and disabled commands', '검색 별칭과 비활성 명령'), 384, node('Command.Root', {
    'aria-label': t('Project commands', '프로젝트 명령'),
  }, [
    node('Command.Input', { placeholder: t('Search for settings…', '설정 검색…') }),
    node('Command.List', {}, [
      text('Command.Empty', t('No matching commands', '일치하는 명령이 없습니다')),
      text('Command.Item', t('Preferences', '환경설정'), { value: 'preferences', keywords: ['settings', '설정'] }),
      text('Command.Item', t('Export unavailable', '내보내기 사용 불가'), { value: 'export', disabled: true }),
    ]),
  ]));
  variant('context-menu', 'keep-open', t('Keep open when checking items', '항목을 선택해도 메뉴 유지'), 320, node(context + '.Root', {}, [
    text(context + '.Trigger', t('Right-click for view options', '오른쪽 클릭으로 보기 옵션 열기'), {
      style: 'display: grid; min-height: 7rem; padding: .75rem; place-items: center; text-align: center; border: 1px dashed var(--border); border-radius: .75rem',
    }),
    node(context + '.Content', {}, [
      text(context + '.CheckboxItem', t('Show grid', '격자 표시'), { checked: true, closeOnSelect: false }),
      text(context + '.CheckboxItem', t('Show guides', '안내선 표시'), { closeOnSelect: false }),
    ]),
  ]));
  adapt('data-table', '100%', () => {}, { key: 'pagination-and-selection', title: t('Pagination and row selection', '페이지 이동과 행 선택') });
  variant('date-picker', 'range', t('Pick a date range', '기간 선택'), 'fit-content',
    bound('DatePicker', 'range', true, { locale: lang, mode: 'range', placeholder: t('Pick a range', '기간 선택') }, 'range', 'rangeChange'),
    { range: state({ start: '2026-11-02', end: '2026-11-06' }) });
  variant('date-picker', 'booking-window', t('Restrict a booking window', '예약 가능한 날짜 제한'), 'fit-content', stack([
    bound('DatePicker', 'date', true, { locale: lang, min: today, max: '2026-11-13', placeholder: t('Pick a date', '날짜 선택') }),
    paragraph(t('Available November 2–13, 2026.', '2026년 11월 2~13일에 예약할 수 있습니다.'), { variant: 'muted' }),
  ], 'align-items: center; gap: .75rem'), { date: state(today) });
  const nonDismissible = overlay('Drawer', t('Open confirmation drawer', '확인 드로어 열기'),
    t('Review your delivery', '배송 정보 확인'), t('Use the buttons below to close this drawer.', '아래 버튼으로 드로어를 닫을 수 있습니다.'),
    [stack([paragraph(t('Standard delivery · 25–35 min', '일반 배송 · 25~35분'))], 'padding: 1rem')],
    [button(t('Confirm', '확인'), {}, controlled('open', boolean, 'click', false)),
      button(cancel, { variant: 'outline' }, controlled('open', boolean, 'click', false))]);
  variant('drawer', 'explicit-dismissal', t('Dismiss with a button', '버튼으로 닫기'), 'fit-content',
    bound('Drawer.Root', 'open', boolean, { dismissible: false }, 'open', 'openChange', nonDismissible.slots.default),
    { open: state(false, boolean) });
  variant('dropdown-menu', 'checkbox-items', t('Checkbox items', '확인란 항목'), 'fit-content', node('DropdownMenu.Root', {}, [
    child('DropdownMenu.Trigger', button(t('View options', '보기 옵션'), { variant: 'outline' })),
    node('DropdownMenu.Content', { align: 'start' }, [
      text('DropdownMenu.Label', t('Display', '표시')),
      text('DropdownMenu.CheckboxItem', t('Show toolbar', '도구 모음 표시'), { checked: true, closeOnSelect: false }),
      text('DropdownMenu.CheckboxItem', t('Show status bar', '상태 표시줄 표시'), { closeOnSelect: false }),
    ]),
  ]));
  const densityOptions = options([['comfortable', t('Comfortable', '여유 있게')], ['compact', t('Compact', '촘촘하게')]]);
  variant('dropdown-menu', 'radio-items', t('Choose one menu option', '메뉴에서 한 항목만 선택'), 'fit-content', stack([
    node('DropdownMenu.Root', {}, [
      child('DropdownMenu.Trigger', button(t('Row density', '행 밀도'), { variant: 'outline' })),
      node('DropdownMenu.Content', {}, [
        text('DropdownMenu.Label', t('Row density', '행 밀도')),
        bound('DropdownMenu.RadioGroup', 'density', string, {}, 'value', 'valueChange', densityOptions.map(({ value, label }) =>
          text('DropdownMenu.RadioItem', label, { value }))),
      ]),
    ]),
    status(read('densityLabel')),
  ], 'align-items: center; gap: .75rem'), {
    density: state('comfortable', string),
    densityLabel: {
      kind: 'Derived', schema: string,
      variable: {
        ports: { density: { kind: 'Value', schema: string, required: true }, labels: { kind: 'Value', schema: true, required: true } },
        expression: 'labels[density]',
      },
      inputs: { density: read('density'), labels: Object.fromEntries(densityOptions.map(({ value, label }) => [value, label])) },
    },
  });
  variant('empty', 'no-results', t('No search results', '검색 결과 없음'), 384, node('Empty.Root', {
    style: 'border: 1px dashed var(--border); border-radius: .75rem',
  }, [
    node('Empty.Header', {}, [
      text('Empty.Title', t('No results', '검색 결과가 없습니다')),
      text('Empty.Description', t('Try a different search term.', '다른 검색어를 사용해 보세요.')),
    ]),
  ]));
  variant('field', 'validation-error', t('Validation error', '유효성 오류'), 320, node('Field.Field', { 'data-invalid': true }, [
    text('Field.Label', t('Email', '이메일'), { for: 'reference-field-invalid' }),
    input('reference-field-invalid', { type: 'email', value: 'alex', 'aria-invalid': true, 'aria-describedby': 'reference-field-error' }),
    text('Field.Error', t('Enter a complete email address.', '이메일 주소를 끝까지 입력하세요.'), { id: 'reference-field-error' }),
  ]));
  variant('hover-card', 'above-trigger', t('Open above the trigger', '트리거 위에 표시'), 'fit-content', node('HoverCard.Root', { openDelay: 100 }, [
    child('HoverCard.Trigger', button(t('Preview Viewstem', 'Viewstem 미리보기'), { variant: 'outline', href: docsLink })),
    node('HoverCard.Content', { side: 'top', align: 'start' }, [
      paragraph('Viewstem', { variant: 'small' }),
      paragraph(t('Run the same View JSON in the browser.', '브라우저에서 같은 View JSON을 실행합니다.'), { variant: 'muted' }),
    ]),
  ]));
  variant('input', 'file', t('File input', '파일 선택'), 320,
    labelled(t('Profile image', '프로필 이미지'), input('reference-file-input', { type: 'file' }), 'reference-file-input'));
  variant('input-group', 'textarea', t('Textarea with a footer addon', '하단 보조 영역이 있는 텍스트 영역'), 320, node('InputGroup.Root', {}, [
    node('InputGroup.Textarea', { rows: 3, placeholder: t('Describe the issue…', '문제를 설명하세요…'), 'aria-label': t('Description', '설명') }),
    node('InputGroup.Addon', { align: 'block-end' }, [text('InputGroup.Text', t('Plain text', '일반 텍스트'))]),
  ]));
  adapt('input-otp', 'fit-content', () => {}, { key: 'grouped', title: t('Grouped code with a separator', '구분자가 있는 코드') });
  adapt('input-otp', 'fit-content', view => {
    view.render.inputs.autocomplete = 'one-time-code';
    view.render.inputs.inputmode = 'numeric';
    view.states.complete = {
      kind: 'Derived', schema: boolean,
      variable: { ports: { code: { kind: 'Value', schema: string, required: true } }, expression: 'size(code) == 6' },
      inputs: { code: read('code') },
    };
    view.render = stack([
      view.render,
      { ...status(t('Six digits entered.', '숫자 6자리를 입력했습니다.')), when: read('complete') },
    ], 'align-items: center; gap: .75rem');
  }, { key: 'completion', title: t('Show when the code is complete', '코드 입력 완료 표시') });

  variant('item', 'group', t('List with separators', '구분선이 있는 목록'), 384, node('Item.Group', {}, [
    ...[t('Installation', '설치'), t('Quick start', '빠른 시작')].flatMap((label, i) => [
      ...(i ? [node('Item.Separator')] : []),
      node('Item.Root', { size: 'sm' }, [
        node('Item.Content', {}, [text('Item.Title', label)]),
        node('Item.Actions', {}, [button(t('Read', '읽기'), { variant: 'ghost', size: 'sm', href: docsLink + (i ? 'quickstart/' : 'installation/') })]),
      ]),
    ]),
  ]));
  variant('kbd', 'inside-button', t('Shortcut inside a button', '버튼 안의 단축키'), 'fit-content', node('Button', {
    variant: 'outline', href: docsLink,
  }, [
    paragraph(t('Open docs', '문서 열기'), { as: 'span', variant: 'small' }),
    node('Kbd.Group', {}, [text('Kbd.Root', 'Ctrl'), text('Kbd.Root', 'K')]),
  ]));
  variant('label', 'text-input', t('Label linked to a text input', '텍스트 입력과 라벨 연결'), 288, stack([
    text('Label', t('Project name', '프로젝트 이름'), { for: 'reference-label-project' }),
    input('reference-label-project', { placeholder: t('Click the label to focus', '라벨을 눌러 포커스 이동') }),
  ], 'gap: .5rem'));
  variant('marker', 'styles', t('Border and separator', '테두리와 구분선'), 384, stack([
    node('Marker.Root', { variant: 'border' }, [text('Marker.Icon', '✓'), text('Marker.Content', t('Review complete', '검토 완료'))]),
    node('Marker.Root', { variant: 'separator' }, [text('Marker.Content', t('New activity', '새 활동'))]),
  ], 'gap: 1rem'));
  variant('menubar', 'checkbox-items', t('View settings in a menu', '메뉴에서 보기 설정'), 'fit-content', node('Menubar.Root', {}, [
    node('Menubar.Menu', { value: 'view' }, [
      text('Menubar.Trigger', t('View', '보기')),
      node('Menubar.Content', {}, [
        text('Menubar.CheckboxItem', t('Show line numbers', '줄 번호 표시'), { checked: true, closeOnSelect: false }),
        text('Menubar.CheckboxItem', t('Show guides', '안내선 표시'), { closeOnSelect: false }),
      ]),
    ]),
  ]));
  variant('message', 'metadata', t('Sender and delivery status', '보낸 사람과 전달 상태'), 384, node('Message.Root', { align: 'end' }, [
    node('Message.Content', {}, [
      text('Message.Header', t('You · 10:01 AM', '나 · 오전 10:01')),
      bubble(t('The revised draft is ready.', '수정한 초안이 준비됐어요.'), 'end'),
      text('Message.Footer', t('Delivered', '전달됨')),
    ]),
  ]));
  adapt('message-scroller', 384, (_view, parts) => {
    const content = parts('MessageScroller.Content')[0];
    const entries = content.slots.default;
    content.slots.default = [...entries, ...structuredClone(entries)];
  }, { key: 'history', title: t('Jump to the latest message', '최신 메시지로 이동') });
  variant('native-select', 'groups', t('Option groups', '옵션 그룹'), 224, node('NativeSelect.Root', {
    'aria-label': t('Project status', '프로젝트 상태'), value: 'todo',
  }, [
    node('NativeSelect.OptGroup', { label: t('Active', '진행 중인 작업') }, statuses.slice(1, 3).map(item => text('NativeSelect.Option', item.label, { value: item.value }))),
    node('NativeSelect.OptGroup', { label: t('Closed', '종료된 작업') }, statuses.slice(3).map(item => text('NativeSelect.Option', item.label, { value: item.value }))),
  ]));
  variant('navigation-menu', 'links', t('Direct navigation links', '바로 이동하는 탐색 링크'), 'fit-content', node('NavigationMenu.Root', {}, [
    node('NavigationMenu.List', {}, [
      [t('Overview', '개요'), ''], [t('Installation', '설치'), 'installation/'], [t('Quick start', '빠른 시작'), 'quickstart/'],
    ].map(([label, path]) => node('NavigationMenu.Item', {}, [text('NavigationMenu.Link', label, { href: docsLink + path })]))),
  ]));
  variant('pagination', 'compact', t('Previous and next only', '이전·다음만 표시'), 320, stack([
    bound('Pagination.Root', 'page', number, { count: 50, perPage: 10 }, 'page', 'pageChange', [
      node('Pagination.Content', {}, [
        node('Pagination.Item', {}, [text('Pagination.PrevButton', t('Previous', '이전'), { 'aria-label': t('Previous page', '이전 페이지') })]),
        node('Pagination.Item', {}, [text('Pagination.NextButton', t('Next', '다음'), { 'aria-label': t('Next page', '다음 페이지') })]),
      ]),
    ]),
    paragraph({ '@call': 'formatString', args: { value: t('Page ${/states/page} of 5', '5페이지 중 ${/states/page}페이지') } }, { variant: 'muted' }),
  ], 'align-items: center; gap: .75rem'), { page: state(2, number) });
  variant('popover', 'close-action', t('Close from inside', '내용에서 팝오버 닫기'), 'fit-content',
    bound('Popover.Root', 'open', boolean, {}, 'open', 'openChange', [
      child('Popover.Trigger', button(t('Notification options', '알림 옵션'), { variant: 'outline' })),
      node('Popover.Content', {}, [
        node('Popover.Header', {}, [text('Popover.Title', t('Notifications', '알림'))]),
        check('reference-popover-digest', t('Send a weekly digest', '주간 요약 보내기'), { checked: true }),
        close('Popover', t('Done', '완료')),
      ]),
    ]), { open: state(false, boolean) });
  variant('progress', 'steps', t('Progress with a custom maximum', '전체 단계 수 지정'), 320, stack([
    paragraph({ '@call': 'formatString', args: { value: t('Step ${/states/step} of 4', '4단계 중 ${/states/step}단계') } }, { variant: 'small' }),
    node('Progress', { value: read('step'), max: 4, 'aria-label': t('Setup progress', '설정 진행률') }),
    row([button(t('Reset', '초기화'), { variant: 'outline', size: 'sm' }, controlled('step', number, 'click', 1)),
      button(t('Complete', '완료'), { size: 'sm' }, controlled('step', number, 'click', 4))]),
  ], 'gap: .75rem'), { step: state(1, number) });
  variant('questionnaire', 'multiple-answers', t('Choose multiple answers', '답변 여러 개 선택'), 384, stack([
    node('Questionnaire.Root', { items: [{ name: 'channels', required: true }], defaultItem: 'channels' }, [
      node('Questionnaire.Item', { name: 'channels', required: true, multiple: true }, [
        text('Questionnaire.Title', t('Where should we send updates?', '어디로 소식을 보낼까요?')),
        node('Questionnaire.Choices', {}, [
          text('Questionnaire.Choice', t('Email', '이메일'), { value: 'email' }),
          text('Questionnaire.Choice', t('In-app notifications', '앱 내 알림'), { value: 'in-app' }),
        ]),
        text('Questionnaire.Error', t('Select at least one option.', '하나 이상 선택하세요.')),
      ]),
      node('Questionnaire.Actions', {}, [text('Questionnaire.Submit', t('Submit', '제출'))]),
    ], { on: controlled('submitted', boolean, 'submit', true) }),
    { ...paragraph(t('Preferences saved.', '설정을 저장했습니다.'), { variant: 'muted' }), when: read('submitted') },
  ], 'gap: .75rem'), { submitted: state(false, boolean) });
  variant('radio-group', 'disabled-option', t('Unavailable option', '선택할 수 없는 옵션'), 'fit-content', node('RadioGroup.Root', {
    value: 'standard', 'aria-label': t('Delivery method', '배송 방법'),
  }, [
    ...[['standard', t('Standard', '일반'), false], ['express', t('Express unavailable', '빠른 배송 이용 불가'), true]].map(([value, label, disabled]) =>
      field(node('RadioGroup.Item', { id: 'reference-radio-' + value, value, disabled }), text('Label', label, { for: 'reference-radio-' + value }))),
  ]));
  variant('range-calendar', 'stay-length', t('Limit range length', '선택 기간 길이 제한'), 'fit-content',
    bound('RangeCalendar.Root', 'date', true, { locale: lang, placeholder: today, minDays: 2, maxDays: 7 }, 'value', 'valueChange'),
    { date: state({ start: '2026-11-02', end: '2026-11-05' }) });
  variant('range-calendar', 'two-months', t('Select across two months', '두 달에 걸친 기간 선택'), 'fit-content',
    bound('RangeCalendar.Root', 'date', true, { locale: lang, placeholder: '2026-11-27', numberOfMonths: 2, pagedNavigation: true },
      'value', 'valueChange'), { date: state({ start: '2026-11-27', end: '2026-12-04' }) });
  variant('scroll-area', 'horizontal', t('Horizontal scrolling', '가로 스크롤'), 320, node('ScrollArea.Root', {
    orientation: 'horizontal', type: 'always', style: 'border: 1px solid var(--border); border-radius: .5rem',
    'aria-label': t('Release tags', '릴리스 태그'),
  }, [
    row(Array.from({ length: 12 }, (_, i) => text('Badge', 'v1.0.' + i, { variant: 'outline' })), 'width: max-content; flex-wrap: nowrap; padding: 1rem'),
  ]));
  const selectableFruits = select(t('Choose fruits', '과일 고르기'), fruits, t('Fruits', '과일'), { type: 'multiple' });
  variant('select', 'multiple', t('Multiple selections', '여러 항목 선택'), 224,
    bound('Select.Root', 'fruit', true, selectableFruits.inputs, 'value', 'valueChange', selectableFruits.slots.default),
    { fruit: state(['apple', 'banana']) });
  variant('separator', 'vertical', t('Vertical separator', '세로 구분선'), 'fit-content', row([
    paragraph(t('Draft', '초안'), { variant: 'small' }),
    node('Separator', { style: 'width: 1px; height: 1rem; border: 0; background: var(--border)' }),
    paragraph(t('Ready for review', '검토 대기'), { variant: 'muted' }),
  ]));
  variant('sheet', 'left', t('Open from the left', '왼쪽에서 열기'), 'fit-content', overlay('Sheet', t('Open filters', '필터 열기'),
    t('Filters', '필터'), t('Choose which projects to display.', '표시할 프로젝트를 고르세요.'),
    [stack([check('reference-sheet-archived', t('Include archived projects', '보관한 프로젝트 포함'), {})], 'padding-inline: 1rem')],
    [close('Sheet', t('Done', '완료'), 'default')], { side: 'left' }));
  adapt('sidebar', 384, view => {
    view.render.inputs.style = 'min-height: 10rem; --sidebar-width: min(48%, 12rem); border: 1px solid var(--border); border-radius: .5rem; overflow: hidden';
    view.render.slots.default[1].componentRef = 'shadcn.Sidebar.Inset';
  }, { key: 'fixed', title: t('Fixed navigation sidebar', '고정 탐색 사이드바') });
  adapt('sonner', 'fit-content', (_view, parts) => {
    Object.assign(parts('Sonner')[0].inputs, { position: 'top-center', closeButton: true });
    parts('Button')[0].inputs.text = t('Show dismissible toast', '닫을 수 있는 알림 표시');
  }, { key: 'dismissible', title: t('Dismissible notification at the top', '상단에 닫기 가능한 알림') });
  variant('slider', 'stepped', t('Step size and committed value', '이동 단위와 확정된 값'), 320, stack([
    status(format(t('Committed volume: ${/states/committed}%', '확정된 볼륨: ${/states/committed}%'))),
    node('Slider', { type: 'single', value: read('volume'), min: 0, max: 100, step: 10, 'aria-label': t('Volume', '볼륨') }, [], {
      on: { ...controlled('volume', number), ...controlled('committed', number, 'valueCommit') },
    }),
  ], 'gap: .75rem'), { volume: state(40, number), committed: state(40, number) });
  const priceRange = { type: 'array', items: number };
  variant('slider', 'range', t('Adjust a minimum and maximum', '최소·최대 범위 조절'), 320, stack([
    row([
      paragraph(format(t('Minimum: ${/states/range/0}', '최소: ${/states/range/0}')), { variant: 'small' }),
      paragraph(format(t('Maximum: ${/states/range/1}', '최대: ${/states/range/1}')), { variant: 'small' }),
    ], 'justify-content: space-between'),
    node('Slider', {
      type: 'multiple', value: read('range'), min: 0, max: 100, step: 5,
      'aria-label': t('Price range', '가격 범위'), thumbLabels: [t('Minimum price', '최소 가격'), t('Maximum price', '최대 가격')],
    }, [], { on: { ...controlled('range', priceRange), ...controlled('committed', priceRange, 'valueCommit') } }),
    status(format(t('Committed range: ${/states/committed/0}–${/states/committed/1}', '확정된 범위: ${/states/committed/0}–${/states/committed/1}'))),
  ], 'gap: .75rem'), { range: state([25, 75], priceRange), committed: state([25, 75], priceRange) });
  variant('table', 'empty-state', t('Empty table', '빈 표'), 384, node('Table.Root', {}, [
    node('Table.Header', {}, [tableRow([t('Name', '이름'), t('Status', '상태')], 'Table.Head')]),
    node('Table.Body', {}, [node('Table.Row', {}, [text('Table.Cell', t('No projects yet', '아직 프로젝트가 없습니다'), {
      colspan: 2, style: 'text-align: center; padding: 1rem; color: var(--muted-foreground)',
    })])]),
  ]));
  variant('toggle', 'pressed', t('Pressed and disabled states', '눌림과 비활성 상태'), 'fit-content', row([
    node('Toggle', { text: t('Pinned', '고정됨'), variant: 'outline', pressed: true }),
    node('Toggle', { text: t('Unavailable', '사용 불가'), variant: 'outline', disabled: true }),
  ]));
  variant('toggle-group', 'single', t('Single selection', '한 항목만 선택'), 'fit-content', node('ToggleGroup.Root', {
    type: 'single', variant: 'outline', value: 'center', 'aria-label': t('Text alignment', '텍스트 정렬'),
  }, [
    text('ToggleGroup.Item', t('Left', '왼쪽'), { value: 'left' }),
    text('ToggleGroup.Item', t('Center', '가운데'), { value: 'center' }),
    text('ToggleGroup.Item', t('Right', '오른쪽'), { value: 'right' }),
  ]));
  variant('tooltip', 'focus', t('Keyboard focus and delay', '키보드 포커스와 표시 지연'), 'fit-content', node('Tooltip.Provider', { delayDuration: 150 }, [
    node('Tooltip.Root', {}, [
      child('Tooltip.Trigger', button(t('Focus for shortcut', '포커스해 단축키 보기'), { variant: 'outline' })),
      node('Tooltip.Content', {}, [node('Kbd.Group', {}, [text('Kbd.Root', 'Ctrl'), text('Kbd.Root', 'S')])]),
    ]),
  ]));
  variant('trace', 'initially-open', t('Expanded trace step', '펼친 실행 단계'), 384, node('Trace.Root', {}, [
    bound('Trace.Collapsible', 'open', boolean, {}, 'open', 'openChange', [
      text('Trace.CollapsibleTrigger', t('Show validation details', '검증 세부 정보 보기')),
      node('Trace.CollapsibleContent', {}, [
        text('Trace.Line', t('Checked the view definition', 'View 정의를 검사했습니다')),
        node('CodeBlock.Root', {}, [node('CodeBlock.Content', { code: t('Validation passed.', '검증을 통과했습니다.') })]),
      ]),
    ]),
  ]), { open: state(true, boolean) });
  variant('typography', 'inline-styles', t('Lead, inline code and muted text', '소개 문장·인라인 코드·보조 문구'), 448, stack([
    paragraph(t('Render a View in the browser', '브라우저에서 View를 렌더링하세요'), { variant: 'lead' }),
    row([paragraph(t('Call', '호출할 함수'), { as: 'span', variant: 'small' }), paragraph('attach(view, target)', { variant: 'code' })]),
    paragraph(t('Pass a connected DOM element as the target.', 'DOM에 연결된 요소를 대상으로 전달하세요.'), { variant: 'muted' }),
  ], 'gap: .75rem'));

  for (const slug of componentDemoSlugs) {
    const entries = demos.get(slug);
    if (!entries || entries[0].anchor) throw new Error('Missing reference example: ' + slug);
    const anchors = entries.slice(1).map(entry => entry.anchor);
    if (!anchors.length || anchors.some(anchor => !anchor) || new Set(anchors).size !== anchors.length) {
      throw new Error('Missing or duplicate variant anchor: ' + slug);
    }
  }
  return demos;
}

const localized = { en: build('en'), ko: build('ko') };

/**
 * @param {string} slug
 * @param {'en' | 'ko'} locale
 * @returns {{ width: number | string, view: import('@viewstem/core').ViewSpec }}
 */
export function getComponentReference(slug, locale) {
  const primary = localized[locale].get(slug)?.[0];
  if (!primary) throw new Error(`Missing reference example: ${slug}/${locale}`);
  return primary;
}

/**
 * @param {string} slug
 * @param {'en' | 'ko'} locale
 * @returns {{ title: string, anchor: string, width: number | string, view: import('@viewstem/core').ViewSpec }[]}
 */
export function getComponentReferenceVariants(slug, locale) {
  return (localized[locale].get(slug) ?? []).filter(example => example.anchor);
}
