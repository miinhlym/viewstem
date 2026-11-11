import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const content = new URL('../src/content/docs/', import.meta.url);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const origin = 'http://task-guides.test';

async function openExample(page, locale, guide) {
  const markdown = await readFile(new URL(`${locale}/guides/${guide}.md`, content), 'utf8');
  const [, source] = markdown.match(/^\x60{3}js title="src\/main\.js"\n([\s\S]*?)^\x60{3}$/m) ?? [];
  assert.ok(source, `${locale}/${guide} is missing its runnable example`);

  const { outputFiles } = await build({
    stdin: { contents: source + '\nwindow.mountedGuide = mounted;', resolveDir: root },
    outdir: '.',
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  });
  const assets = {
    '/': {
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/main.css">'
        + '<div id="viewstem"></div><script type="module" src="/main.js"></script>',
    },
    '/main.js': {
      contentType: 'text/javascript',
      body: outputFiles.find(file => file.path.endsWith('.js')).text,
    },
    '/main.css': {
      contentType: 'text/css',
      body: outputFiles.find(file => file.path.endsWith('.css')).text,
    },
  };
  const unexpectedRequests = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && Object.hasOwn(assets, url.pathname)) {
      return route.fulfill(assets[url.pathname]);
    }
    unexpectedRequests.push(url.href);
    return route.abort();
  });
  await page.goto(origin);
  await page.waitForFunction(() => Boolean(window.mountedGuide));
  assert.deepEqual(await page.evaluate(async () => (await window.mountedGuide.initialComplete).queryErrors), []);
  return unexpectedRequests;
}

async function verifyForm(page, labels) {
  const input = page.getByRole('textbox', { name: labels.name });
  const message = page.getByText(labels.validation, { exact: true });
  const readState = () => page.evaluate(() => {
    const { view } = window.mountedGuide;
    return ['name', 'nameMessage'].map(name => view.getState(name).getSnapshot().value);
  });
  await message.waitFor();
  assert.deepEqual(await readState(), ['', labels.validation]);

  await input.fill(labels.typed);
  await message.waitFor({ state: 'hidden' });
  assert.equal(await input.inputValue(), labels.typed);
  assert.deepEqual(await readState(), [labels.typed, '']);

  await input.fill('   ');
  await message.waitFor();
  assert.deepEqual(await readState(), ['   ', labels.validation]);
}

async function verifyDashboard(page, labels) {
  const status = value => page.getByText(labels.status + value, { exact: true });
  const week = page.getByText(labels.weekResult, { exact: true });
  const month = page.getByText(labels.monthResult, { exact: true });
  const stale = page.getByText(labels.stale, { exact: true });
  const choose = name => page.getByRole('button', { name, exact: true }).click();
  const snapshot = () => page.evaluate(() => window.mountedGuide.view.getQuery('report').getSnapshot());

  await week.waitFor();
  assert.equal((await snapshot()).dataInputs.period, 'week');

  await choose(labels.month);
  await status('running').waitFor();
  await month.waitFor();
  await status('success').waitFor();
  assert.equal((await snapshot()).dataInputs.period, 'month');

  await choose(labels.fail);
  await status('error').waitFor();
  await stale.waitFor();
  assert.ok(await month.isVisible());
  const failed = await snapshot();
  assert.equal(failed.error.code, 'HTTP_ERROR');
  assert.equal(failed.stale, true);
  assert.equal(failed.dataInputs.period, 'month');

  await choose(labels.week);
  await week.waitFor();
  await status('success').waitFor();
  await stale.waitFor({ state: 'hidden' });
  assert.equal((await snapshot()).stale, false);
}

const cases = {
  docs: {
    name: 'Project name', validation: 'Enter a name.', typed: '  Onboarding  ',
    week: 'Last 7 days', month: 'Last 30 days', fail: 'Simulate a failed request',
    weekResult: 'Last 7 days: 12 visits', monthResult: 'Last 30 days: 46 visits',
    status: 'Report status: ', stale: 'Showing the last successful result.',
  },
  'ko/docs': {
    name: '프로젝트 이름', validation: '이름을 입력하세요.', typed: '  온보딩  ',
    week: '최근 7일', month: '최근 30일', fail: '요청 실패 재현',
    weekResult: '최근 7일 방문 12회', monthResult: '최근 30일 방문 46회',
    status: '조회 상태: ', stale: '마지막으로 성공한 결과를 표시합니다.',
  },
};

const browser = await chromium.launch();
try {
  for (const [locale, labels] of Object.entries(cases)) {
    for (const [guide, verify] of [['form-validation', verifyForm], ['query-dashboard', verifyDashboard]]) {
      const page = await browser.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.stack));
      try {
        const unexpectedRequests = await openExample(page, locale, guide);
        await verify(page, labels);
        assert.deepEqual(errors, []);
        assert.deepEqual(unexpectedRequests, []);
      } catch (cause) {
        throw new Error(`${locale}/${guide}`, { cause });
      } finally {
        await page.close();
      }
      console.log(`${locale}/${guide}: runtime and browser checks passed`);
    }
  }
} finally {
  await browser.close();
}
