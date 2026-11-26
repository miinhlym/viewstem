import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.DOCS_ORIGIN ?? 'http://localhost:4321';
const browser = await chromium.launch({ channel: process.env.DEMO_BROWSER_CHANNEL });

async function verifyLesson(page, preview, check, t) {
  const jump = page.locator('[data-example-jump]');
  const status = page.locator('[data-example-status]');
  const panel = file => page.locator('#source-' + file);
  const activeFile = await jump.getAttribute('data-file');
  const anchor = await jump.getAttribute('data-find');
  assert.ok(activeFile && anchor);
  assert.ok((await panel(activeFile).locator('[data-source-original]').inputValue()).includes(anchor), 'Edit target is absent');
  assert.ok((await page.locator('.example-instructions h1').innerText()).trim());

  async function edit(change, { file = activeFile, invalid = false } = {}) {
    if (file === activeFile) await jump.click();
    else await page.getByRole('tab', { name: file + '.json', exact: true }).click();
    const original = await panel(file).locator('[data-source-original]').inputValue();
    let updated;
    if (Array.isArray(change)) {
      const [target] = change;
      assert.ok(typeof target === 'string' ? original.includes(target) : target.test(original), 'Edit did not match original source');
      updated = original.replace(...change);
    } else {
      updated = JSON.stringify(change(JSON.parse(original)), null, 2);
    }
    assert.notEqual(updated, original);
    const current = await preview.elementHandle();
    try {
      const editor = panel(file).getByRole('textbox', { name: file + '.json', exact: true });
      await editor.press('ControlOrMeta+a');
      await page.keyboard.insertText(updated);
      if (invalid) await status.waitFor();
      else {
        await page.waitForFunction(previous => !previous.isConnected, current);
        await status.waitFor({ state: 'hidden' });
      }
    } finally {
      await current.dispose();
    }
  }

  const match = value => preview.getByText(value, { exact: true });
  const see = value => match(value).waitFor();
  const hide = value => match(value).waitFor({ state: 'hidden' });
  const click = name => preview.getByRole('button', { name, exact: true }).click();
  const field = name => preview.getByLabel(name, { exact: true });
  const toggle = () => preview.getByRole('switch').click();
  const order = async (first, second) => {
    await see(first);
    await see(second);
    const rendered = await preview.innerText();
    assert.ok(rendered.indexOf(first) < rendered.indexOf(second));
  };
  const reset = () => page.getByRole('button', { name: t('Reset code', '코드 초기화'), exact: true }).click();
  await check({ edit, see, hide, click, field, toggle, order, reset, preview, status, match });
}

function lessonChecks(t) {
  const seats = (free, total = 12) => t(free + ' of ' + total + ' seats free', '전체 ' + total + '석 중 ' + free + '석 이용 가능');
  const bottle = amount => t(amount + ' mL in the bottle', '물병에 ' + amount + 'mL');
  const brightness = percent => t(percent + '% brightness', '밝기 ' + percent + '%');
  const pages = count => t(count + ' of 120 pages read', '120쪽 중 ' + count + '쪽 읽음');
  const syrup = t('Use the same amount of maple syrup.', '같은 양의 메이플 시럽을 넣으세요.');
  const alert = t('Footbridge closed', '보행교 통제');
  const bookSummary = t('A guide to recognizing the features of the Moon.', '달 표면의 특징을 알아보는 안내서입니다.');
  const borrowed = t('Available to borrow', '대출 가능');
  const showRoute = t('Show route', '경로 보기');
  const lift = t('Take the lift from the east entrance to floor 4.', '동쪽 입구에서 엘리베이터로 4층까지 이동하세요.');
  const borrow = t('Borrow one kit', '한 세트 빌리기');
  const submit = t('Submit report', '신고 제출');
  const reportError = t('Enter a title before submitting.', '제목을 입력한 뒤 제출하세요.');
  const media = t('Send sample reservation', '샘플 예약 요청');
  const park = t('Riverside trail guide', '강변 산책로 안내');
  const studio = t('10:00 · Printmaking · Studio', '10:00 · 판화 · 작업실');
  const garden = t('13:30 · Seed exchange · Garden', '13:30 · 씨앗 나눔 · 정원');

  return {
    'issue-intake': async ({ click, see, field, edit, reset }) => {
      const title = field(t('Title (required)', '제목 (필수)'));
      const details = field(t('Details', '상세 내용'));
      await click(submit);
      await see(reportError);
      await title.fill('Checkout');
      await details.fill('Card declined');
      await field(t('Priority', '우선순위')).selectOption(t('High', '높음'));
      await click(submit);
      await see(t('Report prepared: Checkout (High)', '신고 내용 확인: Checkout (높음)'));
      await details.fill('New draft details');
      await see('Card declined');
      await edit(['size(title.trim()) > 0', 'size(title.trim()) >= 5']);
      await title.fill('Sun');
      await click(submit);
      await see(reportError);
      await title.fill('Cloud');
      await click(submit);
      await see(t('Report prepared: Cloud (Medium)', '신고 내용 확인: Cloud (보통)'));
      await reset();
      await see(t('Not submitted', '아직 제출하지 않음'));
    },
    'issue-queue': async ({ click, see, hide, field, edit, preview }) => {
      const filter = field(t('Filter incidents', '장애 검색'));
      await filter.fill(t('Jin', '진'));
      await see('INC-106');
      await hide('INC-104');
      await filter.fill('');
      await click(t('Next', '다음'));
      await see('INC-105');
      await click(t('Previous', '이전'));
      await click(t('ID', '번호'));
      await preview.locator('tbody tr').first().getByText('INC-102', { exact: true }).waitFor();
      await edit(['"owner": "' + t('Mina', '민아') + '"', '"owner": "' + t('Sam', '샘') + '"']);
      await filter.fill(t('Sam', '샘'));
      await see('INC-104');
      await hide('INC-103');
    },
    'service-overview': async ({ field, see, click, edit }) => {
      await see(t('128 requests · 96% resolved', '요청 128건 · 해결률 96%'));
      await field(t('Reporting period', '조회 기간')).selectOption('month');
      await see(t('540 requests · 93% resolved', '요청 540건 · 해결률 93%'));
      await see('235');
      await click(t('Show data source', '데이터 출처 보기'));
      await see(t('Illustrative data; no server is connected.', '예시 데이터이며 서버에 연결되어 있지 않습니다.'));
      await edit(['"requests": 58', '"requests": 68']);
      await see(t('138 requests · 89% resolved', '요청 138건 · 해결률 89%'));
      await see('68');
    },
    'first-view': async ({ preview, edit, see, hide }) => {
      await preview.getByRole('heading', { name: park, exact: true }).waitFor();
      const notice = t('Trail closed after dark', '해가 지면 산책로를 닫습니다');
      await edit(view => ({ ...view, render: { ...view.render, componentRef: 'shadcn.Alert.Root', inputs: { text: notice } } }));
      await see(notice);
      await hide(park);
    },
    'component-inputs': async ({ preview, edit }) => {
      const reserve = preview.getByRole('button', { name: t('Reserve Friday', '금요일 예약') });
      assert.equal(await reserve.isDisabled(), true);
      assert.equal(await preview.getByRole('button', { name: t('Join the waitlist', '대기 명단 등록') }).isEnabled(), true);
      await edit(['"disabled": true', '"disabled": false']);
      assert.equal(await reserve.isEnabled(), true);
    },
    'slots': async ({ order, edit }) => {
      await order(bookSummary, borrowed);
      await edit(view => {
        const [header, body, footer] = view.render.slots.default;
        view.render.slots.default = [header, footer, body];
        return view;
      });
      await order(borrowed, bookSummary);
    },
    'conditions': async ({ see, hide, edit }) => {
      await see(t('North trail', '북쪽 산책로'));
      await hide(alert);
      await edit(['"when": false', '"when": true']);
      await see(alert);
      await see(t('Take the signed detour along the lake.', '호숫가에 표시된 우회로를 이용하세요.'));
    },
    'repeat': async ({ see, edit }) => {
      await see(t('2.4 km · 35 min', '2.4km · 35분'));
      await see(t('4.8 km · 70 min', '4.8km · 70분'));
      const name = t('Lakeside', '호숫가 코스');
      await edit(view => {
        const items = view.render.slots.default[1].repeat.items;
        items.push({ ...items[1], id: 'lake', name });
        return view;
      });
      await see(name);
    },
    'view-inputs': async ({ see, edit }) => {
      await see(t('Estimated time: 35 min', '예상 소요 시간 35분'));
      await edit(['"minutes": 35', '"minutes": 45']);
      await see(t('Estimated time: 45 min', '예상 소요 시간 45분'));
    },
    'port-default': async ({ see, edit, reset }) => {
      const defaultLanguage = t('Guide language: English', '안내 언어: 한국어');
      await see(defaultLanguage);
      await edit(() => ({ language: t('Spanish', '스페인어') }));
      await see(t('Guide language: Spanish', '안내 언어: 스페인어'));
      await reset();
      await see(defaultLanguage);
    },
    'value-call': async ({ see, edit }) => {
      await see(t('Starts at 10:30 in Studio B', '10:30 · 작업실 B'));
      await edit(['10:30', '11:15']);
      await see(t('Starts at 11:15 in Studio B', '11:15 · 작업실 B'));
    },
    'state': async ({ see, edit, preview }) => {
      await see(pages(42));
      await edit(['"initial": 42', '"initial": 90']);
      await see(pages(90));
      assert.equal(await preview.getByRole('progressbar').getAttribute('aria-valuenow'), '90');
    },
    'set-state': async ({ see, click, edit }) => {
      const refill = t('Refill bottle', '물병 채우기');
      await see(bottle(250));
      await click(refill);
      await see(bottle(750));
      await click(t('Empty bottle', '물병 비우기'));
      await see(bottle(0));
      await edit(['"value": 750', '"value": 500']);
      await click(refill);
      await see(bottle(500));
    },
    'event-payload': async ({ field, see, edit }) => {
      const name = field(t('Name on the tag', '이름표에 적을 이름'));
      await name.fill('Alex');
      await see('Alex');
      await edit([/"next": \{\s*"@path": "\/event\/value"\s*\}/, '"next": ' + JSON.stringify(t('Guest', '손님'))]);
      await name.fill('Alex');
      await see(t('Guest', '손님'));
    },
    'conditional-ui': async ({ see, hide, toggle, edit }) => {
      await hide(syrup);
      await toggle();
      await see(syrup);
      await toggle();
      await hide(syrup);
      await edit([/"when": \{\s*"@path": "\/states\/enabled"\s*\}/, '"when": true']);
      await see(syrup);
    },
    'derived': async ({ field, see, edit }) => {
      const title = field(t('Journal title', '일지 제목'));
      await title.fill('Star charts');
      await see(t('11 characters', '11자'));
      await title.fill('');
      await see(t('0 characters', '0자'));
      await edit(['size(title)', 'size(title.trim())']);
      await title.fill('  Sun  ');
      await see(t('3 characters', '3자'));
    },
    'state-reaction': async ({ field, edit }) => {
      const show = field(t('Show', '상영작'));
      const seat = field(t('Seat', '좌석'));
      await seat.selectOption('A1');
      await show.selectOption('stars');
      assert.equal(await seat.inputValue(), '');
      await edit(view => { view.reactions[0].value = 'A2'; return view; });
      await seat.selectOption('A1');
      await show.selectOption('stars');
      assert.equal(await seat.inputValue(), 'A2');
    },
    'action-ref': async ({ click, see, edit }) => {
      const focus = t('Reset focus timer', '집중 타이머 초기화');
      const rest = t('Reset break timer', '휴식 타이머 초기화');
      await click(focus);
      await see(t('Focus: 5 min', '집중: 5분'));
      await see(t('Break: 10 min', '휴식: 10분'));
      await edit(['"value": 5', '"value": 3']);
      await click(focus);
      await click(rest);
      await see(t('Focus: 3 min', '집중: 3분'));
      await see(t('Break: 3 min', '휴식: 3분'));
    },
    'action-branch': async ({ click, see, toggle, edit }) => {
      await click(showRoute);
      await see(t('Take the central staircase to floor 4.', '중앙 계단으로 4층까지 올라가세요.'));
      await toggle();
      await click(showRoute);
      await see(lift);
      await edit([/"condition": \{\s*"@path": "\/ports\/accessible"\s*\}/, '"condition": true']);
      await click(showRoute);
      await see(lift);
    },
    'action-assert': async ({ click, see, status, toggle, edit }) => {
      const one = t('1 kits currently available', '대여 가능한 세트 1개');
      await click(borrow);
      await status.getByText(t('Confirm the return time before borrowing.', '대여 전에 반납 시간을 확인하세요.')).waitFor();
      await see(t('2 kits currently available', '대여 가능한 세트 2개'));
      await toggle();
      await click(borrow);
      await see(one);
      await edit([/"condition": \{\s*"@path": "\/ports\/confirmed"\s*\}/, '"condition": true']);
      await click(borrow);
      await see(one);
    },
    'action-output': async ({ field, click, see, edit }) => {
      const recipient = field(t('Recipient', '수령인'));
      const print = t('Prepare pickup slip', '수령표 만들기');
      await recipient.fill('Alex');
      await click(print);
      await see(t('Alex, pick up at counter B.', 'Alex 님, B 창구에서 수령하세요.'));
      await edit(['"counter": "B"', '"counter": "D"']);
      await recipient.fill('Alex');
      await click(print);
      await see(t('Alex, pick up at counter D.', 'Alex 님, D 창구에서 수령하세요.'));
    },
    'action-status': async ({ click, see, toggle, edit }) => {
      const check = t('Run departure check', '출발 전 점검');
      const state = value => t('Last check: ' + value, '최근 점검: ' + value);
      await see(state('idle'));
      await click(check);
      await see(state('error'));
      await toggle();
      await click(check);
      await see(state('success'));
      await edit([/"condition": \{\s*"@path": "\/ports\/closed"\s*\}/, '"condition": true']);
      await see(state('idle'));
      await click(check);
      await see(state('success'));
    },
    'action-variable': async ({ field, click, see, edit }) => {
      const packs = field(t('Seed packs', '씨앗 봉투'));
      const calculate = t('Count seedlings', '모종 수 계산');
      await packs.selectOption('3');
      await click(calculate);
      await see(t('18 planting cells needed', '심을 칸 18개 필요'));
      await edit(['int(packs) * 6', 'int(packs) * 8']);
      await packs.selectOption('3');
      await click(calculate);
      await see(t('24 planting cells needed', '심을 칸 24개 필요'));
    },
    'query-result': async ({ see, edit }) => {
      const temperature = t('Temperature: 18 °C', '기온 18°C');
      await see(temperature);
      await see(t('Wind: 12 km/h', '바람 12km/h'));
      await edit(['"wind": 12', '"wind": 25']);
      await see(temperature);
      await see(t('Wind: 25 km/h', '바람 25km/h'));
    },
    'query-inputs': async ({ see, field, edit }) => {
      await see(t('09:15 · Gate A', '09:15 · A 출입구'));
      const window = field(t('Travel window', '이동 시간대'));
      await window.selectOption(t('Afternoon', '오후'));
      await see(t('14:40 · Gate C', '14:40 · C 출입구'));
      await edit(['"departure": "14:40"', '"departure": "15:10"']);
      await window.selectOption(t('Afternoon', '오후'));
      await see(t('15:10 · Gate C', '15:10 · C 출입구'));
    },
    'query-ref': async ({ see, edit }) => {
      await see(t('Valley: 18 °C', '계곡 기온 18°C'));
      await see(t('Summit: 10 °C', '정상 기온 10°C'));
      await edit(['°C', t('degrees Celsius', ' 섭씨')]);
      await see(t('Valley: 18 degrees Celsius', '계곡 기온 18 섭씨'));
      await see(t('Summit: 10 degrees Celsius', '정상 기온 10 섭씨'));
    },
    'http-datasource': async ({ see, edit }) => {
      await see(t('Reading room', '열람실'));
      await see(seats(8));
      await edit(['/sources/main/availability', '/sources/main/mediaRoom']);
      await see(t('Media room', '미디어실'));
      await see(seats(4, 6));
    },
    'query-on-click': async ({ field, click, see, edit }) => {
      const name = field(t('Name on reservation', '예약자 이름'));
      await name.fill('Kim');
      await click(media);
      await see(t('LIB-014 · Kim at 14:00', 'LIB-014 · 14:00 Kim 님'));
      await edit(['"slot": "14:00"', '"slot": "16:30"']);
      await name.fill('Kim');
      await click(media);
      await see(t('LIB-014 · Kim at 16:30', 'LIB-014 · 16:30 Kim 님'));
    },
    'query-gate': async ({ see, hide, toggle, edit }) => {
      await hide(seats(8));
      await toggle();
      await see(seats(8));
      await edit(view => { view.queries.seats.executeWhen = true; return view; });
      await see(seats(8));
    },
    'refresh-query': async ({ see, click, edit, status }) => {
      await see(seats(8));
      await click(t('Check for new availability', '빈자리 다시 확인'));
      await see(seats(7));
      await edit(['"/ports/seats"', '"/ports/missing"'], { invalid: true });
      await status.getByText(t('Showing the last successful result.', '마지막으로 성공한 결과를 표시합니다.'), { exact: false }).waitFor();
      await see(seats(7));
    },
    'query-polling': async ({ see, toggle, edit, match }) => {
      await see(seats(8));
      await toggle();
      await see(seats(7));
      await see(seats(6));
      await toggle();
      await assert.rejects(match(seats(5)).waitFor({ timeout: 1800 }), { name: 'TimeoutError' });
      await edit(['"intervalMs": 1500', '"intervalMs": 4000']);
      await see(seats(8));
      await toggle();
      await see(seats(7));
      await assert.rejects(match(seats(6)).waitFor({ timeout: 2000 }), { name: 'TimeoutError' });
      await see(seats(6));
    },
    'query-concat': async ({ order, edit, hide, see }) => {
      const blue = t('Blue team · 18 points', '파랑 팀 · 18 점');
      const orange = t('Orange team · 21 points', '주황 팀 · 21 점');
      await order(blue, orange);
      await edit(view => { view.queries.scores.query.transform.steps[0].with = []; return view; });
      await see(blue);
      await hide(orange);
    },
    'query-join': async ({ order, edit, hide, see }) => {
      const moon = t('The Moon Atlas · Shelf A4', '달 지도 · A4 서가');
      const night = t('Night Garden · Shelf C2', '밤의 정원 · C2 서가');
      await order(moon, night);
      await edit(['"book": "moon"', '"book": "missing"']);
      await see(night);
      await hide(moon);
    },
    'query-sources': async ({ order, edit }) => {
      await order(studio, garden);
      await edit(view => {
        const transform = view.queries.schedule.query.transform;
        [transform.input, transform.steps[0].with[0]] = [transform.steps[0].with[0], transform.input];
        return view;
      });
      await order(garden, studio);
    },
    'reusable-component': async ({ see, edit }) => {
      await see(t('2.4 km · 35 min', '2.4km · 35분'));
      await see(t('4.8 km · 70 min', '4.8km · 70분'));
      await edit([/ · \$\{\/ports\/minutes\}(?: min|분)/, '']);
      await see(t('2.4 km', '2.4km'));
      await see(t('4.8 km', '4.8km'));
    },
    'inline-component': async ({ see, edit }) => {
      await see('5–11 °C');
      await edit(['"minimum": 5', '"minimum": 2']);
      await see('2–11 °C');
    },
    'component-state': async ({ see, edit, match, preview }) => {
      const dim = preview.getByRole('button', { name: t('Dim to 25%', '25%로 낮추기'), exact: true });
      await dim.first().click();
      await see(brightness(25));
      await see(brightness(60));
      await edit(['"initial": 60', '"initial": 40']);
      assert.equal(await match(brightness(40)).count(), 2);
      await dim.first().click();
      await see(brightness(25));
      await see(brightness(40));
    },
    'shared-state-port': async ({ see, edit, match, preview }) => {
      const dim = preview.getByRole('button', { name: t('Dim to 25%', '25%로 낮추기'), exact: true });
      await dim.first().click();
      await match(brightness(25)).nth(1).waitFor();
      await edit(view => {
        view.render.slots.default.find(node => node.id === 'remote').inputs.level['@path'] = '/states/independent';
        return view;
      });
      await dim.first().click();
      await see(brightness(25));
      await see(brightness(40));
    },
    'forward-slot': async ({ see, edit }) => {
      const drawing = t('Bring a pencil and a sketchbook.', '연필과 스케치북을 가져오세요.');
      await see(t('Meet by the lake at 08:00.', '08:00에 호숫가에서 만나요.'));
      await see(drawing);
      await edit(['08:00', '09:00']);
      await see(t('Meet by the lake at 09:00.', '09:00에 호숫가에서 만나요.'));
      await see(drawing);
    },
    'component-event': async ({ click, see, edit }) => {
      await click('10:00');
      await see(t('10:00 · Room A', '10:00 · A실'));
      await click('14:30');
      await see(t('14:30 · Room B', '14:30 · B실'));
      await edit(['"room": "B"', '"room": "C"']);
      await click('14:30');
      await see(t('14:30 · Room C', '14:30 · C실'));
    },
    'variable-ref': async ({ see, edit }) => {
      await see(t('13 basil seedlings: 3 trays', '바질 모종 13개: 트레이 3판'));
      await see(t('8 parsley seedlings: 2 trays', '파슬리 모종 8개: 트레이 2판'));
      await edit(['(plants + cells - 1) / cells', 'plants / cells']);
      await see(t('13 basil seedlings: 2 trays', '바질 모종 13개: 트레이 2판'));
      await see(t('8 parsley seedlings: 1 trays', '파슬리 모종 8개: 트레이 1판'));
    },
    'shared-type': async ({ see, edit, status }) => {
      await see(t('At departure: 80%', '출발할 때 80%'));
      await see(t('On return: 20%', '돌아올 때 20%'));
      await edit(['"returnTrip": 20', '"returnTrip": 35'], { invalid: true });
      await status.getByText(t('Showing the last successful result.', '마지막으로 성공한 결과를 표시합니다.'), { exact: false }).waitFor();
      await edit(resources => { resources[0].spec.schema.enum.push(35); return resources; }, { file: 'resources' });
      await see(t('On return: 35%', '돌아올 때 35%'));
    },
  };
}

async function verify(locale) {
  const ko = locale === 'ko';
  const t = (en, kr) => ko ? kr : en;
  const prefix = ko ? '/ko' : '';
  const context = await browser.newContext({ viewport: { width: ko ? 390 : 1440, height: 900 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const open = async slug => {
      await page.goto(`${origin}${prefix}/examples/${slug}/`, { waitUntil: 'commit' });
      const preview = page.locator('[data-example-target] [data-viewstem-ui]:visible');
      await preview.first().waitFor({ state: 'attached' });
      await page.locator('[data-example-running]').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('[data-example-status]').isVisible(), false, slug);
      return preview;
    };
    const entries = await readdir(new URL(`../dist${prefix}/examples/`, import.meta.url), { withFileTypes: true });
    const lessons = entries.filter(entry => entry.isDirectory());
    assert.ok(lessons.length > 0);
    const cases = lessonChecks(t);
    assert.deepEqual(lessons.map(({ name }) => name).sort(), Object.keys(cases).sort(), 'Every lesson needs an outcome and edit check');
    const failures = [];
    for (const { name } of lessons) {
      try {
        await verifyLesson(page, await open(name), cases[name], t);
      } catch (cause) {
        const context = cause.message.split('\n').slice(0, 3).join('\n');
        failures.push(name + ' (' + locale + '): ' + context);
      }
    }
    assert.deepEqual(failures, [], 'Example outcome or edit checks failed');

    await open('set-state');
    const source = await page.locator('#source-view [data-source-original]').inputValue();
    await page.goto(`${origin}${prefix}/playground/`);
    const editor = page.locator('.cm-content');
    const run = page.getByRole('button', { name: t('Run', '실행'), exact: true });
    const draft = JSON.stringify(JSON.parse(source));
    await editor.fill(draft);
    await run.click();
    const result = page.locator('[data-viewstem-ui]');
    const initial = result.getByText(t('250 mL in the bottle', '물병에 250mL'), { exact: true });
    const full = result.getByText(t('750 mL in the bottle', '물병에 750mL'), { exact: true });
    await initial.waitFor();
    await result.getByRole('button', { name: t('Refill bottle', '물병 채우기'), exact: true }).click();
    await full.waitFor();
    await editor.fill('{"render":{"id":"bad","componentRef":"unknown"}}');
    await run.click();
    await page.getByRole('alert').filter({ hasText: 'Unknown Component "unknown".' }).waitFor();
    await full.waitFor();
    await editor.fill(draft);
    await run.click();
    await initial.waitFor();
    await page.getByRole('alert').waitFor({ state: 'hidden' });

    const componentPreview = async slug => {
      const response = await page.goto(`${origin}${prefix}/docs/ui/components/${slug}/`);
      assert.equal(response?.status(), 200);
      const preview = page.locator('[data-demo-target] [data-viewstem-ui]').first();
      await preview.waitFor();
      return preview;
    };

    const breadcrumb = await componentPreview('breadcrumb');
    const components = breadcrumb.getByRole('link', { name: t('Components', '컴포넌트'), exact: true });
    assert.equal(await components.getAttribute('href'), `${prefix}/docs/ui/components/`);
    await components.click();
    await page.waitForURL(`${origin}${prefix}/docs/ui/components/`);

    const navigation = await componentPreview('navigation-menu');
    await navigation.getByRole('button', { name: t('Components', '컴포넌트'), exact: true }).click();
    const alertDialog = page.locator('[data-viewstem-ui]').getByRole('link', { name: 'Alert Dialog', exact: true });
    assert.equal(await alertDialog.getAttribute('href'), `${prefix}/docs/ui/components/alert-dialog/`);
    await alertDialog.click();
    await page.waitForURL(`${origin}${prefix}/docs/ui/components/alert-dialog/`);
    assert.deepEqual(errors, []);
    return { locale, lessonPages: lessons.length, lessonEdits: lessons.length, playground: 'run, invalid definition, retained preview and rerun', componentLinks: ['breadcrumb', 'navigation-menu'] };
  } finally { await context.close(); }
}

try {
  const results = await Promise.allSettled(['en', 'ko'].map(verify));
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Preview checks failed');
  console.log(JSON.stringify(results.map(result => result.value), null, 2));
} finally { await browser.close(); }
