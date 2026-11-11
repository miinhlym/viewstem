import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { componentDemoSlugs } from '../src/examples/component-demos.mjs';
import { componentDescriptions, componentSections } from '../src/examples/component-reference-copy.mjs';
import { getComponentReference, getComponentReferenceVariants } from '../src/examples/component-reference-demos.mjs';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(dist, '.' + pathname, ...(pathname.endsWith('/') ? ['index.html'] : []));
  if (!file.startsWith(dist.endsWith(sep) ? dist : dist + sep)) { response.writeHead(403).end(); return; }
  try { const body = await readFile(file); response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.DEMO_BROWSER_CHANNEL });
const checks = [];
const failures = [];
const interactions = [];
try {
  const queue = process.env.DEMO_INTERACTIONS_ONLY ? [] : ['en', 'ko'].flatMap(locale => componentDemoSlugs.map(family => ({ locale, family })));
  await Promise.all(Array.from({ length: 4 }, async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    let errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (let task; (task = queue.shift());) {
      const { locale, family } = task;
      const pathname = `${locale === 'ko' ? '/ko' : ''}/docs/ui/components/${family}/`;
      errors = [];
      try {
        await page.goto(origin + pathname, { waitUntil: 'domcontentloaded' });
        const variants = getComponentReferenceVariants(family, locale);
        assert.ok(variants.length > 0, `${family} has no variant examples`);
        const demo = page.locator('[data-component-demo]:not([data-demo-lazy])');
        await page.locator('[data-component-demo]:not([data-demo-lazy]):is([data-demo-ready], [data-demo-error])').waitFor({ timeout: 45000 });
        assert.equal(await demo.count(), 1);
        assert.equal(await page.locator('[data-demo-target]').count(), 1 + variants.length);
        assert.equal(await page.locator('[data-component-reference], [data-reference-choice], [data-demo-options-host], [data-demo-option-link]').count(), 0);
        assert.equal(await page.getByRole('link', { name: locale === 'ko' ? '공식 예제 보기' : 'Official examples', exact: true }).count(), 0);
        assert.deepEqual(await demo.locator('.workbench-toolbar [role="tab"]').allTextContents(), [locale === 'ko' ? '미리보기' : 'Preview', 'JSON']);
        const labels = componentSections[locale];
        const headings = await page.locator('.component-detail h2').evaluateAll(elements => elements
          .filter(element => !element.closest('[data-demo-target]'))
          .map(element => ({ id: element.id, title: element.textContent.trim(), size: parseFloat(getComputedStyle(element).fontSize) })));
        assert.deepEqual(headings.map(({ title }) => title), [labels.preview.title, labels.usage.title, labels.examples.title, labels.reference.title]);
        assert.equal(new Set(headings.map(({ size }) => size)).size, 1);
        assert.equal(await page.locator('.component-intro').textContent(), componentDescriptions[family][locale === 'ko' ? 1 : 0]);
        assert.equal(await page.locator(`[id="${labels.reference.legacyId}"]`).count(), 1);
        const outline = [...headings.slice(0, 3).map(({ id }) => id), ...variants.map(({ anchor }) => anchor), headings.at(-1).id];
        const toc = await page.locator('.right-sidebar nav a').evaluateAll(links => links.map(link => decodeURIComponent(link.hash.slice(1))));
        assert.deepEqual(toc.filter(id => outline.includes(id)), outline);
        const observed = await page.evaluate(() => ({
          ready: document.querySelector('[data-component-demo]')?.getAttribute('data-demo-ready'),
          error: document.querySelector('[data-component-demo]')?.getAttribute('data-demo-error'),
          source: JSON.parse(document.querySelector('[data-demo-view]').textContent),
          code: document.querySelector('.source-code code').textContent,
          rendered: document.querySelector('[data-demo-target]').childElementCount,
          menu: [...document.querySelectorAll('#starlight__sidebar a')].filter(a => a.pathname.includes(`/docs/ui/components/`) && /\/components\/[^/]+\/$/.test(a.pathname)).length,
          current: document.querySelector('#starlight__sidebar [aria-current="page"]')?.getAttribute('href'),
          width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
          domPreview: !!document.querySelector('[data-demo-target] [data-viewstem-ui]'),
        }));
        assert.equal(observed.error, null);
        assert.equal(observed.ready, 'true');
        assert.deepEqual(observed.source, getComponentReference(family, locale).view);
        assert.deepEqual(JSON.parse(observed.code), observed.source);
        assert.equal(observed.menu, 66);
        assert.equal(observed.current, pathname);
        assert.ok(observed.rendered > 0);
        assert.equal(observed.domPreview, true);
        assert.ok(observed.scrollWidth <= observed.width);
        await page.setViewportSize({ width: 320, height: 800 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const mobile = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(mobile.scroll <= mobile.width, JSON.stringify(mobile));
        const sizes = await page.evaluate(() => {
          const fontSize = selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
          return [fontSize('main h1'), fontSize('.component-doc-heading'), fontSize('.component-variants h3'), fontSize('.component-intro')];
        });
        assert.ok(sizes[0] > sizes[1] && sizes[1] > sizes[2] && sizes[3] >= 16, JSON.stringify(sizes));
        for (const { anchor, view } of variants) {
          const example = page.locator(`[data-component-demo][aria-labelledby="${anchor}"]`);
          await example.locator('[data-demo-target]').scrollIntoViewIfNeeded();
          await page.locator(`[aria-labelledby="${anchor}"]:is([data-demo-ready="true"], [data-demo-error])`).waitFor({ timeout: 15000 });
          assert.equal(await example.getAttribute('data-demo-error'), null, anchor);
          assert.equal(await example.locator('[data-demo-target] [data-viewstem-ui]').count(), 1, anchor);
          assert.deepEqual(JSON.parse(await example.locator('[data-demo-view]').textContent()), view, anchor);
          await example.getByRole('tab', { name: 'JSON', exact: true }).click();
          const json = example.locator('.source-code code');
          await json.waitFor();
          assert.deepEqual(JSON.parse(await json.textContent()), view, anchor);
          await example.getByRole('tab', { name: locale === 'ko' ? '미리보기' : 'Preview', exact: true }).click();
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), anchor);
        }
        assert.deepEqual(errors, []);
        checks.push({ locale, family, exactJson: true, variants: variants.map(({ anchor }) => anchor), sidebar: 66, desktopWidth: observed.width, mobileWidth: mobile.width });
      } catch (error) {
        failures.push({ ...task, error: error.message });
        console.error(`${locale}/${family}: ${error.message}`);
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await context.close();
  }));
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const noScriptPage = await noScript.newPage();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const interactionErrors = [];
  page.on('pageerror', error => interactionErrors.push(error.message));
  for (const locale of ['en', 'ko']) {
    const ko = locale === 'ko';
    const t = (en, koText) => ko ? koText : en;
    const base = `${origin}${ko ? '/ko' : ''}/docs/ui/components/`;
    const open = async family => {
      await page.goto(base + family + '/', { waitUntil: 'commit' });
      const primary = page.locator('[data-component-demo]:not([data-demo-lazy])');
      await page.locator('[data-component-demo]:not([data-demo-lazy]):is([data-demo-ready="true"], [data-demo-error])').waitFor();
      assert.equal(await primary.getAttribute('data-demo-error'), null, `${locale}/${family} preview`);
      return primary.locator('[data-demo-target]');
    };
    let target = await open('dialog');
    await target.getByRole('button', { name: t('Open Dialog', '대화상자 열기'), exact: true }).click();
    const profile = page.getByRole('dialog', { name: t('Edit profile', '프로필 수정') });
    await profile.getByRole('textbox', { name: t('Name', '이름'), exact: true }).fill('Alex Morgan');
    await profile.getByRole('button', { name: t('Save changes', '변경 사항 저장') }).click();
    await profile.waitFor({ state: 'hidden' });
    await target.getByText(t('Saved name: Alex Morgan', '저장된 이름: Alex Morgan'), { exact: true }).waitFor();

    target = await open('attachment');
    await target.getByRole('button', { name: t('Cancel upload', '업로드 취소') }).click();
    await target.getByText(t('Upload canceled.', '업로드를 취소했습니다.'), { exact: true }).waitFor();
    assert.equal(await target.getByRole('button', { name: t('Cancel upload', '업로드 취소') }).count(), 0);

    target = await open('sidebar');
    const sidebarToggle = target.getByRole('button', { name: t('Toggle Sidebar', '사이드바 전환') });
    const sidebar = target.locator('[data-vs-component="Sidebar.Root"]');
    await sidebarToggle.click();
    assert.equal(await sidebar.getAttribute('aria-hidden'), 'true');
    await sidebarToggle.click();
    await target.getByText('Acme Inc', { exact: true }).waitFor();

    target = await open('message-scroller');
    await target.getByRole('textbox', { name: t('Message', '메시지') }).fill('Hello Viewstem');
    await target.getByRole('button', { name: t('Send', '보내기') }).click();
    await target.getByText('Hello Viewstem', { exact: true }).waitFor();
    assert.equal(await target.getByRole('textbox', { name: t('Message', '메시지') }).inputValue(), '');
    interactions.push(`${locale}: reference dialog editing, attachment preview, sidebar toggle, message append`);

    target = await open('alert-dialog');
    const alertTrigger = target.getByRole('button', { name: t('Show Dialog', '확인 창 열기'), exact: true });
    await alertTrigger.click();
    const alert = page.getByRole('alertdialog', { name: t('Are you absolutely sure?', '계속하시겠습니까?') });
    await alert.getByRole('button', { name: t('Cancel', '취소'), exact: true }).click();
    await alert.waitFor({ state: 'hidden' });
    await alertTrigger.click();
    await alert.getByRole('button', { name: t('Continue', '계속'), exact: true }).click();
    await alert.waitFor({ state: 'hidden' });
    interactions.push(`${locale}: Alert Dialog cancel and continue`);

    target = await open('input');
    const input = target.locator('input[type="password"]');
    const primary = page.locator('[data-component-demo]:not([data-demo-lazy])');
    const previewTab = primary.locator('[data-demo-tab="preview"]');
    const jsonTab = primary.locator('[data-demo-tab="json"]');
    const sourceCode = primary.locator('.source-code code');
    const source = getComponentReference('input', locale).view;
    assert.equal(await previewTab.getAttribute('aria-selected'), 'true');
    assert.equal(await sourceCode.isVisible(), false);
    await input.fill('test-key');
    await previewTab.focus();
    await page.keyboard.press('ArrowRight');
    await sourceCode.waitFor();
    assert.equal(await jsonTab.getAttribute('aria-selected'), 'true');
    assert.equal(await target.isVisible(), false);
    assert.deepEqual(JSON.parse(await sourceCode.textContent()), source);
    await primary.locator('[data-demo-copy]').click();
    assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), source);
    await previewTab.click();
    assert.equal(await input.inputValue(), 'test-key');
    await primary.getByRole('link', { name: 'view.json', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'component-json');
    assert.equal(await jsonTab.getAttribute('aria-selected'), 'true');
    await primary.locator('.example-usage .setup-code pre').waitFor();
    await previewTab.click();
    await primary.locator('[data-demo-reset]').click();
    await page.waitForFunction(() => document.querySelector('[data-demo-target] input')?.value === '');
    interactions.push(`${locale}: keyboard tabs, usage link and setup, input retention/reset, exact displayed and copied JSON`);

    await noScriptPage.goto(base + 'input/', { waitUntil: 'domcontentloaded' });
    const noScriptPrimary = noScriptPage.locator('[data-component-demo]:not([data-demo-lazy])');
    const fallback = noScriptPrimary.locator('.source-code code');
    await fallback.waitFor();
    assert.deepEqual(JSON.parse(await fallback.textContent()), source);
    assert.equal(await noScriptPrimary.locator('[data-demo-target]').isVisible(), false);
    interactions.push(`${locale}: JSON fallback with JavaScript disabled`);

    target = await open('calendar');
    const day = target.locator('[data-date="2026-11-05"]').first();
    await day.click();
    assert.equal(await day.getAttribute('data-selected'), '');
    interactions.push(`${locale}: calendar date selection`);

    target = await open('combobox');
    const combo = target.locator('button[aria-haspopup="listbox"]');
    assert.equal(await combo.textContent(), t('Select a framework', '프레임워크 선택'));
    await combo.click();
    await target.getByRole('combobox').fill('Astro');
    await target.getByRole('option', { name: 'Astro', exact: true }).click();
    assert.equal(await combo.textContent(), 'Astro');

    target = await open('select');
    const select = target.locator('[data-vs-component="Select.Trigger"]');
    assert.equal(await select.textContent(), t('Select a fruit', '과일 선택'));
    await select.click();
    await target.getByRole('option', { name: t('Banana', '바나나'), exact: true }).click();
    assert.equal(await select.textContent(), t('Banana', '바나나'));

    target = await open('pagination');
    const secondPage = target.locator('[data-vs-component="Pagination.Link"]').nth(1);
    assert.equal(await secondPage.textContent(), '2');
    await secondPage.click();
    await target.getByText(t('Page 2 of 3', '3페이지 중 2페이지'), { exact: true }).waitFor();
    assert.equal(await secondPage.getAttribute('aria-current'), 'page');

    target = await open('command');
    await target.getByRole('textbox').fill(t('Billing', '결제'));
    await target.getByRole('menuitem', { name: new RegExp(t('Billing', '결제')) }).waitFor();
    interactions.push(`${locale}: Combobox and Select placeholders, Pagination labels and selection, Command labels with shortcuts`);

    target = await open('sonner');
    await target.getByRole('button').first().click();
    const notification = page.locator('[data-demo-notifications] [data-viewstem-ui]');
    await notification.getByText(t('Event has been created', '이벤트를 만들었습니다'), { exact: true }).waitFor();
    interactions.push(`${locale}: Sonner host action targets the retained example`);

    await page.setViewportSize({ width: 320, height: 700 });
    const button = await open('button');
    assert.equal(await button.getByRole('button', { name: t('Button', '버튼'), exact: true }).count(), 1);
    assert.equal(await page.locator('[data-demo-lazy][data-demo-version]').count(), 0, 'offscreen variants should not mount');
    const toc = page.getByRole('button', { name: t('On this page', '목차'), exact: true });
    const buttonVariants = getComponentReferenceVariants('button', locale);
    for (const { anchor, title, view } of buttonVariants) {
      await toc.click();
      await page.getByRole('menuitem', { name: title, exact: true }).click();
      await page.waitForFunction(id => location.hash === '#' + id && document.activeElement?.id === id, anchor);
      const example = page.locator(`[data-component-demo][aria-labelledby="${anchor}"]`);
      await page.locator(`[data-demo-ready][aria-labelledby="${anchor}"]`).waitFor();
      assert.equal(await example.locator('[data-viewstem-ui]').count() > 0, true);
      const rendered = example.locator('[data-demo-target] button');
      if (anchor === 'button-styles') {
        assert.equal(await rendered.count(), 6);
        assert.ok(await rendered.evaluateAll(buttons => new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top))).size > 1));
      } else if (anchor === 'button-sizes') {
        assert.equal(await rendered.count(), 4);
        assert.equal(await rendered.evaluateAll(buttons => new Set(buttons.map(button => button.offsetHeight)).size), 4);
      } else if (anchor === 'button-loading') {
        assert.ok(await rendered.isDisabled());
        assert.equal(await rendered.getAttribute('aria-busy'), 'true');
        await example.getByRole('button', { name: t('Please wait', '잠시 기다려 주세요'), exact: true }).waitFor();
        const spinner = rendered.locator('[data-icon="inline-start"]');
        await spinner.waitFor();
        assert.notEqual(await spinner.evaluate(element => getComputedStyle(element).animationName), 'none');
      } else if (anchor === 'button-action') {
        await rendered.click();
        await example.getByText(t('Draft saved.', '초안을 저장했습니다.'), { exact: true }).waitFor();
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      await example.getByRole('tab', { name: 'JSON', exact: true }).click();
      assert.deepEqual(JSON.parse(await example.locator('.source-code code').textContent()), view);
      await example.locator('[data-demo-copy]').click();
      assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), view);
      await example.getByRole('tab', { name: 'JSON', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      const setupCode = example.locator('.workbench-setup pre code');
      await setupCode.waitFor();
      const setupText = await setupCode.textContent();
      assert.match(setupText, /@viewstem\/ui/);
      assert.equal(await example.getByRole('tab', { name: t('Setup', '실행 코드'), exact: true }).getAttribute('aria-selected'), 'true');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      await example.getByRole('button', { name: t('Copy setup code', '실행 코드 복사'), exact: true }).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), setupText);
      await example.getByRole('tab', { name: t('Preview', '미리보기'), exact: true }).click();
      await rendered.first().waitFor();
    }
    const exampleIds = await page.locator('[data-component-demo][id], [data-component-demo] [id]').evaluateAll(elements => elements.map(element => element.id));
    assert.equal(new Set(exampleIds).size, exampleIds.length);
    await page.goto(base + 'button/#button-sizes-json', { waitUntil: 'commit' });
    await page.waitForFunction(() => document.activeElement?.id === 'button-sizes-json');
    assert.equal(await page.locator('[aria-labelledby="button-sizes"] [data-demo-tab="json"]').getAttribute('aria-selected'), 'true');
    await noScriptPage.goto(base + 'button/#button-loading-json', { waitUntil: 'domcontentloaded' });
    const noScriptLoading = noScriptPage.locator('[aria-labelledby="button-loading"] .source-code code');
    await noScriptLoading.waitFor();
    await noScriptPage.locator('[aria-labelledby="button-loading"] .workbench-setup pre code').waitFor();
    assert.deepEqual(JSON.parse(await noScriptLoading.textContent()), buttonVariants.find(({ anchor }) => anchor === 'button-loading').view);
    await page.setViewportSize({ width: 1440, height: 1000 });
    interactions.push(`${locale}: mobile Button variants, links and focus, exact JSON and setup copy, lazy mounting, no-script sources`);

    const openVariant = async (family, anchor) => {
      await page.goto(`${base}${family}/#${anchor}`, { waitUntil: 'commit' });
      const example = page.locator(`[data-component-demo][aria-labelledby="${anchor}"]`);
      const preview = example.locator('[data-demo-target]');
      await preview.scrollIntoViewIfNeeded();
      await page.locator(`[aria-labelledby="${anchor}"]:is([data-demo-ready], [data-demo-error])`).waitFor();
      assert.equal(await example.getAttribute('data-demo-error'), null, anchor);
      return preview;
    };
    await page.setViewportSize({ width: 390, height: 844 });
    target = await openVariant('slider', 'slider-range');
    const minimum = target.getByRole('slider', { name: t('Minimum price', '최소 가격'), exact: true });
    const maximum = target.getByRole('slider', { name: t('Maximum price', '최대 가격'), exact: true });
    const committedRange = target.getByRole('status');
    const committedText = (low, high) => t(`Committed range: ${low}–${high}`, `확정된 범위: ${low}–${high}`);
    await minimum.scrollIntoViewIfNeeded();
    const track = await target.locator('[data-scope="slider"][data-part="track"]').boundingBox();
    for (const [thumb, value, text, committedBefore, committedAfter] of [
      [minimum, 40, t('Minimum: 40', '최소: 40'), committedText(25, 75), committedText(40, 75)],
      [maximum, 65, t('Maximum: 65', '최대: 65'), committedText(40, 75), committedText(40, 65)],
    ]) {
      const box = await thumb.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(track.x + track.width * value / 100, box.y + box.height / 2, { steps: 5 });
      await target.getByText(text, { exact: true }).waitFor();
      assert.equal(await committedRange.textContent(), committedBefore);
      await page.mouse.up();
      await committedRange.filter({ hasText: committedAfter }).waitFor();
    }
    await minimum.press('ArrowRight');
    await committedRange.filter({ hasText: committedText(45, 65) }).waitFor();
    await page.keyboard.press('Tab');
    assert.equal(await maximum.evaluate(element => document.activeElement === element), true);
    await page.keyboard.press('ArrowLeft');
    await committedRange.filter({ hasText: committedText(45, 60) }).waitFor();
    assert.equal(await minimum.getAttribute('aria-valuenow'), '45');
    assert.equal(await maximum.getAttribute('aria-valuenow'), '60');
    interactions.push(`${locale}: Slider thumbs, Tab order, pointer drag, live and committed ranges`);

    target = await openVariant('date-picker', 'date-picker-range');
    const dateTrigger = target.locator('.vs-date-trigger');
    await dateTrigger.click();
    await target.locator('[data-date="2026-11-09"]').first().click();
    await target.locator('[data-date="2026-11-12"]').first().click();
    assert.match(await dateTrigger.innerText(), /9.*12/);
    assert.equal(await dateTrigger.getAttribute('aria-expanded'), 'false');

    target = await openVariant('data-table', 'data-table-pagination-and-selection');
    const firstRow = await target.locator('tbody tr').first().innerText();
    await target.getByRole('button', { name: t('Next', '다음'), exact: true }).click();
    const nextRow = target.locator('tbody tr').first();
    await nextRow.getByRole('checkbox').check();
    assert.notEqual(await nextRow.innerText(), firstRow);

    target = await openVariant('select', 'select-multiple');
    const selectTrigger = target.locator('[data-vs-component="Select.Trigger"]');
    await selectTrigger.click();
    const blueberry = target.getByRole('option', { name: t('Blueberry', '블루베리'), exact: true });
    await blueberry.click();
    assert.equal(await blueberry.getAttribute('aria-selected'), 'true');
    assert.match(await selectTrigger.innerText(), new RegExp(t('Apple.*Banana.*Blueberry', '사과.*바나나.*블루베리')));
    await page.keyboard.press('Escape');

    target = await openVariant('context-menu', 'context-menu-keep-open');
    await target.locator('[data-vs-component="ContextMenu.Trigger"]').click({ button: 'right' });
    const guides = target.getByRole('menuitemcheckbox', { name: t('Show guides', '안내선 표시'), exact: true });
    await guides.click();
    assert.equal(await guides.getAttribute('aria-checked'), 'true');
    assert.equal(await guides.isVisible(), true);
    await page.keyboard.press('Escape');

    target = await openVariant('drawer', 'drawer-explicit-dismissal');
    await target.getByRole('button', { name: t('Open confirmation drawer', '확인 드로어 열기'), exact: true }).click();
    const drawer = page.getByRole('dialog', { name: t('Review your delivery', '배송 정보 확인') });
    await drawer.waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await drawer.isVisible(), true);
    await drawer.getByRole('button', { name: t('Confirm', '확인'), exact: true }).click();
    await drawer.waitFor({ state: 'hidden' });

    target = await openVariant('questionnaire', 'questionnaire-multiple-answers');
    await target.locator('input[value="email"]').check();
    await target.locator('input[value="in-app"]').check();
    assert.equal(await target.locator('input:checked').count(), 2);
    await target.getByRole('button', { name: t('Submit', '제출'), exact: true }).click();
    await target.getByText(t('Preferences saved.', '설정을 저장했습니다.'), { exact: true }).waitFor();
    await page.setViewportSize({ width: 1440, height: 1000 });
    interactions.push(`${locale}: date range, table pagination and selection, multiple Select, context menu, controlled Drawer, multiple answers`);

    await open('typography');
    assert.equal(await page.locator('#starlight__sidebar [aria-current="page"]').evaluate(element => {
      const parent = document.getElementById('starlight__sidebar').getBoundingClientRect();
      const current = element.getBoundingClientRect();
      return current.top >= parent.top && current.bottom <= parent.bottom;
    }), true);
    await page.setViewportSize({ width: 375, height: 800 });
    const menu = page.getByRole('button', { name: t('Docs menu', '문서 메뉴'), exact: true });
    await menu.click();
    await page.getByRole('dialog', { name: t('Docs menu', '문서 메뉴') }).locator('[aria-current="page"]').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal(await menu.evaluate(element => element === document.activeElement), true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    interactions.push(`${locale}: long sidebar current item and mobile menu keyboard`);
  }
  assert.deepEqual(interactionErrors, []);
  await context.close();
  await noScript.close();
  assert.equal(failures.length, 0, 'Component demo verification failed');
} finally {
  console.log(JSON.stringify({ checked: checks.length, checks, interactions, failures }, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
