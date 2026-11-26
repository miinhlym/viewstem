import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import Ajv2020 from 'ajv/dist/2020.js';
import { resourceKinds, resourceSchema, resourceSchemaUrl } from '../src/lib/resource-schemas.mjs';

const origin = process.env.DOCS_ORIGIN ?? 'http://localhost:4321';
const ajv = new Ajv2020({ strict: false });
const schemas = new Map(resourceKinds.map(kind => [kind, ajv.compile(resourceSchema(kind))]));
const browser = await chromium.launch({ channel: process.env.DEMO_BROWSER_CHANNEL });

async function verifySchemaPages(page, prefix) {
  await page.goto(origin + prefix + '/docs/dsl/');
  const links = await page.locator('a[href$="-json-schema"]').evaluateAll(items => items.map(link => link.href));
  assert.equal(links.length, resourceKinds.length);
  for (const [index, kind] of resourceKinds.entries()) {
    await page.goto(links[index]);
    const details = page.locator(`details[data-resource-schema="${kind}"]`);
    const code = details.locator('pre code');
    await code.waitFor();
    const download = await details.locator('a[download]').getAttribute('href');
    assert.equal(download, resourceSchemaUrl(kind));
    const response = await page.request.get(origin + download);
    assert.equal(response.status(), 200);
    const downloaded = await response.json();
    assert.deepEqual(JSON.parse(await code.textContent()), downloaded);
    assert.deepEqual(downloaded, resourceSchema(kind));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await details.locator('summary').press('Enter');
    await code.waitFor({ state: 'hidden' });
  }
}

async function verifyLessonSchemas(page) {
  const files = page.locator('#source-view, #source-resources');
  for (const file of await files.all()) {
    for (const source of await file.locator('[data-source-original], [data-source-solution]').all()) {
      const value = JSON.parse(await source.inputValue());
      const entries = Array.isArray(value) ? value : [{ kind: 'View', id: 'lesson-view', spec: value }];
      for (const entry of entries) {
        const validate = schemas.get(entry.kind);
        assert.ok(validate?.(entry), ajv.errorsText(validate?.errors));
      }
    }
  }
}

async function verifyLesson(page, preview, check, t) {
  const jump = page.locator('[data-example-jump]');
  const status = page.locator('[data-example-status]');
  const panel = file => page.locator('#source-' + file);
  const activeFile = await jump.getAttribute('data-file');
  const anchor = await jump.getAttribute('data-find');
  const workbench = page.locator('[data-example-preview]');
  const show = page.getByRole('button', { name: t('Show changed result', '변경 결과 보기'), exact: true });
  const back = page.getByRole('button', { name: t('Back to my code', '내 코드로 돌아가기'), exact: true });
  assert.ok(activeFile && anchor);
  assert.ok((await panel(activeFile).locator('[data-source-original]').inputValue()).includes(anchor), 'Edit target is absent');
  assert.ok((await page.locator('.example-instructions h1').innerText()).trim());
  assert.equal(await page.locator('#example-result header').getByRole('button', { name: t('Show changed result', '변경 결과 보기'), exact: true }).count(), 1);

  async function showSolution() {
    await show.click();
    await back.waitFor();
    await page.locator('[data-example-running]').waitFor({ state: 'hidden' });
    await status.waitFor({ state: 'hidden' });
    assert.equal(await workbench.getAttribute('data-active-file'), activeFile);
    assert.equal(await panel(activeFile).getByRole('textbox').getAttribute('contenteditable'), 'false');
    assert.equal(await preview.count(), 1);
  }

  async function hideSolution() {
    await back.click();
    await show.waitFor();
  }

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
  await check({ edit, showSolution, hideSolution, see, hide, click, field, toggle, order, reset, preview, status, match });
  if (await back.isVisible()) await hideSolution();
  assert.equal(await workbench.getAttribute('data-example-mode'), 'draft');
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
  const reportError = minimum => t(`Enter a title with ${minimum} or more characters.`, `제목은 ${minimum}자 이상 입력하세요.`);
  const media = t('Send sample reservation', '샘플 예약 요청');
  const park = t('Riverside trail guide', '강변 산책로 안내');
  const studio = t('10:00 · Printmaking · Studio', '10:00 · 판화 · 작업실');
  const garden = t('13:30 · Seed exchange · Garden', '13:30 · 씨앗 나눔 · 정원');

  return {
    'issue-intake': async ({ click, see, field, showSolution, reset }) => {
      const title = field(t('Title (required)', '제목 (필수)'));
      const details = field(t('Details', '상세 내용'));
      await click(submit);
      await see(reportError(1));
      await title.fill('Checkout');
      await details.fill('Card declined');
      await field(t('Priority', '우선순위')).selectOption(t('High', '높음'));
      await click(submit);
      await see(t('Report prepared: Checkout (High)', '신고 내용 확인: Checkout (높음)'));
      await details.fill('New draft details');
      await see('Card declined');
      await showSolution();
      await title.fill('Sun');
      await click(submit);
      await see(reportError(5));
      await title.fill('Cloud');
      await click(submit);
      await see(t('Report prepared: Cloud (Medium)', '신고 내용 확인: Cloud (보통)'));
      await reset();
      await see(t('Not submitted', '아직 제출하지 않음'));
    },
    'issue-queue': async ({ click, see, hide, field, showSolution, preview }) => {
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
      await showSolution();
      await filter.fill(t('Sam', '샘'));
      await see('INC-104');
      await hide('INC-103');
    },
    'service-overview': async ({ field, see, click, showSolution }) => {
      await see(t('128 requests · 96% resolved', '요청 128건 · 해결률 96%'));
      await field(t('Reporting period', '조회 기간')).selectOption('month');
      await see(t('540 requests · 93% resolved', '요청 540건 · 해결률 93%'));
      await see('235');
      await click(t('Show data source', '데이터 출처 보기'));
      await see(t('Illustrative data; no server is connected.', '예시 데이터이며 서버에 연결되어 있지 않습니다.'));
      await showSolution();
      await see(t('138 requests · 89% resolved', '요청 138건 · 해결률 89%'));
      await see('68');
    },
    'first-view': async ({ preview, showSolution, see, hide }) => {
      await preview.getByRole('heading', { name: park, exact: true }).waitFor();
      const notice = t('Trail closed after dark', '해가 지면 산책로를 닫습니다');
      await showSolution();
      await see(notice);
      await hide(park);
    },
    'component-inputs': async ({ preview, showSolution }) => {
      const reserve = preview.getByRole('button', { name: t('Reserve Friday', '금요일 예약') });
      assert.equal(await reserve.isDisabled(), true);
      assert.equal(await preview.getByRole('button', { name: t('Join the waitlist', '대기 명단 등록') }).isEnabled(), true);
      await showSolution();
      assert.equal(await reserve.isEnabled(), true);
    },
    'input-object': async ({ see, preview, showSolution, hideSolution }) => {
      const open = t('The trail is open.', '산책로를 이용할 수 있습니다.');
      const closed = t('The trail is closed.', '산책로가 통제되었습니다.');
      const notice = preview.locator('[data-vs-component="Alert.Root"]');
      await see(open);
      assert.equal(await notice.getAttribute('data-variant'), 'default');
      await showSolution();
      await see(closed);
      assert.equal(await notice.getAttribute('data-variant'), 'destructive');
      await hideSolution();
      await see(open);
    },
    'input-object-call': async ({ see, preview, showSolution, hideSolution, edit }) => {
      const open = t('The trail is open.', '산책로를 이용할 수 있습니다.');
      const closed = t('The trail is closed.', '산책로가 통제되었습니다.');
      const notice = preview.locator('[data-vs-component="Alert.Root"]');
      const expectNotice = async (message, variant) => {
        await see(message);
        assert.equal(await notice.getAttribute('data-variant'), variant);
      };
      await expectNotice(open, 'default');
      await showSolution();
      await expectNotice(closed, 'destructive');
      await hideSolution();
      await expectNotice(open, 'default');
      await edit(source => {
        assert.equal(source.render.inputs['@call'], 'makeNotice');
        source.render.inputs.args = [true, open, 'Closed by the editor'];
        return source;
      });
      await expectNotice('Closed by the editor', 'destructive');
    },
    'slots': async ({ order, showSolution }) => {
      await order(bookSummary, borrowed);
      await showSolution();
      await order(borrowed, bookSummary);
    },
    'conditions': async ({ see, hide, showSolution }) => {
      await see(t('North trail', '북쪽 산책로'));
      await hide(alert);
      await showSolution();
      await see(alert);
      await see(t('Take the signed detour along the lake.', '호숫가에 표시된 우회로를 이용하세요.'));
    },
    'repeat': async ({ see, showSolution }) => {
      await see(t('2.4 km · 35 min', '2.4km · 35분'));
      await see(t('4.8 km · 70 min', '4.8km · 70분'));
      const name = t('Lakeside', '호숫가 코스');
      await showSolution();
      await see(name);
    },
    'view-inputs': async ({ see, showSolution }) => {
      await see(t('Estimated time: 35 min', '예상 소요 시간 35분'));
      await showSolution();
      await see(t('Estimated time: 45 min', '예상 소요 시간 45분'));
    },
    'port-default': async ({ see, showSolution, reset }) => {
      const defaultLanguage = t('Guide language: English', '안내 언어: 한국어');
      await see(defaultLanguage);
      await showSolution();
      await see(t('Guide language: Spanish', '안내 언어: 스페인어'));
      await reset();
      await see(defaultLanguage);
    },
    'value-call': async ({ see, showSolution }) => {
      await see(t('Starts at 10:30 in Studio B', '10:30 · 작업실 B'));
      await showSolution();
      await see(t('Starts at 11:15 in Studio B', '11:15 · 작업실 B'));
    },
    'state': async ({ see, showSolution, preview }) => {
      await see(pages(42));
      await showSolution();
      await see(pages(90));
      assert.equal(await preview.getByRole('progressbar').getAttribute('aria-valuenow'), '90');
    },
    'set-state': async ({ see, click, showSolution, hideSolution }) => {
      const refill = t('Refill bottle', '물병 채우기');
      await see(bottle(250));
      await click(refill);
      await see(bottle(750));
      await click(t('Empty bottle', '물병 비우기'));
      await see(bottle(0));
      await showSolution();
      await click(refill);
      await see(bottle(500));
      await hideSolution();
      await see(bottle(0));
    },
    'event-payload': async ({ field, see, showSolution }) => {
      const name = field(t('Name on the tag', '이름표에 적을 이름'));
      await name.fill('Alex');
      await see('Alex');
      await showSolution();
      await name.fill('Alex');
      await see(t('Guest', '손님'));
    },
    'conditional-ui': async ({ see, hide, toggle, showSolution }) => {
      await hide(syrup);
      await toggle();
      await see(syrup);
      await toggle();
      await hide(syrup);
      await showSolution();
      await see(syrup);
    },
    'derived': async ({ field, see, showSolution }) => {
      const title = field(t('Journal title', '일지 제목'));
      await title.fill('Star charts');
      await see(t('11 characters', '11자'));
      await title.fill('');
      await see(t('0 characters', '0자'));
      await showSolution();
      await title.fill('  Sun  ');
      await see(t('3 characters', '3자'));
    },
    'state-reaction': async ({ field, showSolution }) => {
      const show = field(t('Show', '상영작'));
      const seat = field(t('Seat', '좌석'));
      await seat.selectOption('A1');
      await show.selectOption('stars');
      assert.equal(await seat.inputValue(), '');
      await showSolution();
      await seat.selectOption('A1');
      await show.selectOption('stars');
      assert.equal(await seat.inputValue(), 'A2');
    },
    'action-ref': async ({ click, see, showSolution }) => {
      const focus = t('Reset focus timer', '집중 타이머 초기화');
      const rest = t('Reset break timer', '휴식 타이머 초기화');
      await click(focus);
      await see(t('Focus: 5 min', '집중: 5분'));
      await see(t('Break: 10 min', '휴식: 10분'));
      await showSolution();
      await click(focus);
      await click(rest);
      await see(t('Focus: 3 min', '집중: 3분'));
      await see(t('Break: 3 min', '휴식: 3분'));
    },
    'action-branch': async ({ click, see, toggle, showSolution }) => {
      await click(showRoute);
      await see(t('Take the central staircase to floor 4.', '중앙 계단으로 4층까지 올라가세요.'));
      await toggle();
      await click(showRoute);
      await see(lift);
      await showSolution();
      await click(showRoute);
      await see(lift);
    },
    'action-assert': async ({ click, see, status, toggle, showSolution }) => {
      const stock = count => t(`Available kits: ${count}`, `대여 가능한 세트 ${count}개`);
      const noStock = t('There are no kits left to borrow.', '대여할 수 있는 세트가 없습니다.');
      await click(borrow);
      await status.getByText(t('Confirm the return time before borrowing.', '대여 전에 반납 시간을 확인하세요.')).waitFor();
      await see(stock(2));
      await toggle();
      await click(borrow);
      await see(stock(1));
      await click(borrow);
      await see(stock(0));
      await click(borrow);
      await status.getByText(noStock, { exact: true }).waitFor();
      await see(stock(0));
      await showSolution();
      await click(borrow);
      await see(stock(1));
    },
    'action-output': async ({ field, click, see, showSolution }) => {
      const recipient = field(t('Recipient', '수령인'));
      const print = t('Prepare pickup slip', '수령표 만들기');
      await recipient.fill('Alex');
      await click(print);
      await see(t('Alex, pick up at counter B.', 'Alex 님, B 창구에서 수령하세요.'));
      await showSolution();
      await recipient.fill('Alex');
      await click(print);
      await see(t('Alex, pick up at counter D.', 'Alex 님, D 창구에서 수령하세요.'));
    },
    'action-status': async ({ click, see, toggle, showSolution }) => {
      const check = t('Run departure check', '출발 전 점검');
      const state = value => t('Last check: ' + value, '최근 점검: ' + value);
      await see(state('idle'));
      await click(check);
      await see(state('error'));
      await toggle();
      await click(check);
      await see(state('success'));
      await showSolution();
      await see(state('idle'));
      await click(check);
      await see(state('success'));
    },
    'action-variable': async ({ field, click, see, showSolution }) => {
      const packs = field(t('Seed packs', '씨앗 봉투'));
      const calculate = t('Count seedlings', '모종 수 계산');
      await packs.selectOption('3');
      await click(calculate);
      await see(t('18 planting cells needed', '심을 칸 18개 필요'));
      await showSolution();
      await packs.selectOption('3');
      await click(calculate);
      await see(t('24 planting cells needed', '심을 칸 24개 필요'));
    },
    'query-result': async ({ see, showSolution }) => {
      const temperature = t('Temperature: 18 °C', '기온 18°C');
      await see(temperature);
      await see(t('Wind: 12 km/h', '바람 12km/h'));
      await showSolution();
      await see(temperature);
      await see(t('Wind: 25 km/h', '바람 25km/h'));
    },
    'query-inputs': async ({ see, field, showSolution }) => {
      await see(t('09:15 · Gate A', '09:15 · A 출입구'));
      const window = field(t('Travel window', '이동 시간대'));
      await window.selectOption(t('Afternoon', '오후'));
      await see(t('14:40 · Gate C', '14:40 · C 출입구'));
      await showSolution();
      await window.selectOption(t('Afternoon', '오후'));
      await see(t('15:10 · Gate C', '15:10 · C 출입구'));
    },
    'query-ref': async ({ see, showSolution }) => {
      await see(t('Valley: 18 °C', '계곡 기온 18°C'));
      await see(t('Summit: 10 °C', '정상 기온 10°C'));
      await showSolution();
      await see(t('Valley: 18 degrees Celsius', '계곡 기온 18 섭씨'));
      await see(t('Summit: 10 degrees Celsius', '정상 기온 10 섭씨'));
    },
    'http-datasource': async ({ see, showSolution }) => {
      await see(t('Reading room', '열람실'));
      await see(seats(8));
      await showSolution();
      await see(t('Media room', '미디어실'));
      await see(seats(4, 6));
    },
    'query-on-click': async ({ field, click, see, showSolution }) => {
      const name = field(t('Name on reservation', '예약자 이름'));
      await name.fill('Kim');
      await click(media);
      await see(t('LIB-014 · Kim at 14:00', 'LIB-014 · 14:00 Kim 님'));
      await showSolution();
      await name.fill('Kim');
      await click(media);
      await see(t('LIB-014 · Kim at 16:30', 'LIB-014 · 16:30 Kim 님'));
    },
    'query-gate': async ({ see, hide, toggle, showSolution }) => {
      await hide(seats(8));
      await toggle();
      await see(seats(8));
      await showSolution();
      await see(seats(8));
    },
    'refresh-query': async ({ see, click, showSolution, status }) => {
      await see(seats(8));
      await click(t('Check for new availability', '빈자리 다시 확인'));
      await see(seats(7));
      await showSolution();
      await see(seats(8));
      await click(t('Check for new availability', '빈자리 다시 확인'));
      await status.getByText('QUERY_REFRESH_DISABLED', { exact: true }).waitFor();
      await see(seats(8));
    },
    'query-polling': async ({ see, toggle, showSolution, match }) => {
      await see(seats(8));
      await toggle();
      await see(seats(7));
      await see(seats(6));
      await toggle();
      await assert.rejects(match(seats(5)).waitFor({ timeout: 1800 }), { name: 'TimeoutError' });
      await showSolution();
      await see(seats(8));
      await toggle();
      await see(seats(7));
      await assert.rejects(match(seats(6)).waitFor({ timeout: 2000 }), { name: 'TimeoutError' });
      await see(seats(6));
    },
    'query-concat': async ({ order, showSolution, hide, see }) => {
      const blue = t('Blue team · 18 points', '파랑 팀 · 18 점');
      const orange = t('Orange team · 21 points', '주황 팀 · 21 점');
      await order(blue, orange);
      await showSolution();
      await see(blue);
      await hide(orange);
    },
    'query-join': async ({ order, showSolution, hide, see }) => {
      const moon = t('The Moon Atlas · Shelf A4', '달 지도 · A4 서가');
      const night = t('Night Garden · Shelf C2', '밤의 정원 · C2 서가');
      await order(moon, night);
      await showSolution();
      await see(night);
      await hide(moon);
    },
    'query-sources': async ({ order, hide, showSolution }) => {
      await order(studio, garden);
      await showSolution();
      await order(t('11:30 · Printmaking · Studio', '11:30 · 판화 · 작업실'), garden);
      await hide(studio);
    },
    'reusable-component': async ({ see, showSolution }) => {
      await see(t('2.4 km · 35 min', '2.4km · 35분'));
      await see(t('4.8 km · 70 min', '4.8km · 70분'));
      await showSolution();
      await see(t('2.4 km', '2.4km'));
      await see(t('4.8 km', '4.8km'));
    },
    'inline-component': async ({ see, showSolution }) => {
      await see('5–11 °C');
      await showSolution();
      await see('2–11 °C');
    },
    'component-state': async ({ see, showSolution, match, preview }) => {
      const dim = preview.getByRole('button', { name: t('Dim to 25%', '25%로 낮추기'), exact: true });
      await dim.first().click();
      await see(brightness(25));
      await see(brightness(60));
      await showSolution();
      assert.equal(await match(brightness(40)).count(), 2);
      await dim.first().click();
      await see(brightness(25));
      await see(brightness(40));
    },
    'shared-state-port': async ({ see, showSolution, match, preview }) => {
      const dim = preview.getByRole('button', { name: t('Dim to 25%', '25%로 낮추기'), exact: true });
      await dim.first().click();
      await match(brightness(25)).nth(1).waitFor();
      await showSolution();
      await dim.first().click();
      await see(brightness(25));
      await see(brightness(40));
    },
    'forward-slot': async ({ see, showSolution }) => {
      const drawing = t('Bring a pencil and a sketchbook.', '연필과 스케치북을 가져오세요.');
      await see(t('Meet by the lake at 08:00.', '08:00에 호숫가에서 만나요.'));
      await see(drawing);
      await showSolution();
      await see(t('Meet by the lake at 09:00.', '09:00에 호숫가에서 만나요.'));
      await see(drawing);
    },
    'component-event': async ({ click, see, showSolution }) => {
      await click('10:00');
      await see(t('10:00 · Room A', '10:00 · A실'));
      await click('14:30');
      await see(t('14:30 · Room B', '14:30 · B실'));
      await showSolution();
      await click('14:30');
      await see(t('14:30 · Room C', '14:30 · C실'));
    },
    'variable-ref': async ({ see, showSolution }) => {
      await see(t('13 basil seedlings: 3 trays', '바질 모종 13개: 트레이 3판'));
      await see(t('8 parsley seedlings: 2 trays', '파슬리 모종 8개: 트레이 2판'));
      await showSolution();
      await see(t('13 basil seedlings: 2 trays', '바질 모종 13개: 트레이 2판'));
      await see(t('8 parsley seedlings: 1 trays', '파슬리 모종 8개: 트레이 1판'));
    },
    'shared-type': async ({ see, edit, status, showSolution, hideSolution, preview, reset }) => {
      await see(t('At departure: 80%', '출발할 때 80%'));
      await see(t('On return: 20%', '돌아올 때 20%'));
      await edit(['"returnTrip": 20', '"returnTrip": 35'], { invalid: true });
      await status.getByText(t('Showing the last successful result.', '마지막으로 성공한 결과를 표시합니다.'), { exact: false }).waitFor();
      await showSolution();
      await see(t('On return: 35%', '돌아올 때 35%'));
      assert.equal(await preview.getByRole('progressbar').count(), 2);
      await hideSolution();
      await status.getByText(t('Showing the last successful result.', '마지막으로 성공한 결과를 표시합니다.'), { exact: false }).waitFor();
      await see(t('On return: 20%', '돌아올 때 20%'));
      await reset();
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
    await verifySchemaPages(page, prefix);
    await page.goto(`${origin}${prefix}/docs/dsl/values/`);
    await page.locator(`a[href="${prefix}/examples/input-object-call/"]`).first().click();
    await page.waitForURL(`${origin}${prefix}/examples/input-object-call/`);
    const lessons = entries.filter(entry => entry.isDirectory());
    assert.ok(lessons.length > 0);
    const cases = lessonChecks(t);
    assert.deepEqual(lessons.map(({ name }) => name).sort(), Object.keys(cases).sort(), 'Every lesson needs an outcome and edit check');
    const failures = [];
    for (const { name } of lessons) {
      try {
        const preview = await open(name);
        await verifyLessonSchemas(page);
        await verifyLesson(page, preview, cases[name], t);
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
    return { locale, resourceSchemas: resourceKinds.length, lessonPages: lessons.length, lessonSolutions: lessons.length,
      playground: 'run, invalid definition, retained preview and rerun', componentLinks: ['breadcrumb', 'navigation-menu'] };
  } finally { await context.close(); }
}

try {
  const results = await Promise.allSettled(['en', 'ko'].map(verify));
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Preview checks failed');
  console.log(JSON.stringify(results.map(result => result.value), null, 2));
} finally { await browser.close(); }
