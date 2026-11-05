import assert from 'node:assert/strict';
import { appendFile, chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { componentDemoSlugs } from '../src/examples/component-demos.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, ...value] = arg.replace(/^--/, '').split('='); return [key, value.join('=') || 'true']; }));
const origin = args.origin || 'http://localhost:4321';
const phase = args.phase || 'baseline';
const out = resolve(args.output || `./preview-design-${phase}`);
await mkdir(out, { recursive: true });
const dumpSource = args['dom-dump'] ? await readFile(args['dom-dump'], 'utf8') : null;
if (dumpSource) await mkdir(resolve(out, 'dom'), { recursive: true, mode: 0o700 });
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
const browser = await chromium.launch({ handleSIGINT: false });
const checks = [], failures = [], captures = [], interactions = [], domSkipped = [];
const redact = path => new Promise(resolveResult => {
  const child = spawn(args.redactor || resolve(dirname(args['dom-dump']), '../bin/gstack-redact'), ['--from-file', path, '--max-bytes', '10485760'], { stdio: 'ignore' });
  child.on('error', () => resolveResult(-1));
  child.on('close', code => resolveResult(code));
});
const variants = phase === 'interactions' ? [] : phase === 'baseline' ? [{ locale: 'ko', theme: 'light', width: 1440 }] :
  ['ko', 'en'].flatMap(locale => ['light', 'dark'].flatMap(theme => [320, 1440].map(width => ({ locale, theme, width }))));
const families = args.family ? componentDemoSlugs.filter(family => family === args.family) : componentDemoSlugs;
assert.ok(families.length > 0, `Unknown family: ${args.family}`);
const tasks = variants.flatMap(variant => families.map(family => ({ ...variant, family })));
try {
  await Promise.all(Array.from({ length: Number(args.workers || 3) }, async () => {
    for (let task; !stopping && (task = tasks.shift());) {
      const { locale, theme, width, family } = task;
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(`${origin}${locale === 'ko' ? '/ko' : ''}/docs/svelte-ui/components/${family}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => { const d = document.querySelector('[data-component-demo]'); return d?.hasAttribute('data-demo-error') || (d?.dataset.demoReady === 'true' && d.dataset.demoVersion === d.dataset.demoAppliedVersion); }, null, { timeout: 60000 });
        const state = await page.evaluate(() => ({ error: document.querySelector('[data-component-demo]').getAttribute('data-demo-error'), children: document.querySelector('[data-demo-target]').childElementCount, stageWidth: document.querySelector('[data-demo-target]').getBoundingClientRect().width, contentWidth: document.querySelector('[data-demo-target] > div > *')?.getBoundingClientRect().width, theme: document.documentElement.dataset.theme, width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert.equal(state.error, null);
        assert.ok(state.children > 0, 'preview target is empty');
        assert.ok(state.stageWidth > 0, 'preview stage has zero width');
        assert.ok(state.contentWidth > 0, 'preview content has zero width');
        assert.equal(state.theme, theme, 'site theme');
        assert.ok(state.scrollWidth <= state.width, `page overflow ${state.scrollWidth} > ${state.width}`);
        assert.deepEqual(errors, []);
        if (phase === 'baseline' || (locale === 'ko' && theme === 'light' && width === 1440)) {
          const path = resolve(out, `${family}.png`);
          await page.locator('.workbench-preview').screenshot({ path, animations: 'disabled', timeout: 20000 });
          captures.push({ family, path });
          if (dumpSource) {
            const dump = await page.evaluate(`(${dumpSource})()`);
            if (!dump || Buffer.byteLength(dump) > 10 * 1024 * 1024) domSkipped.push({ family, reason: 'empty or exceeds 10 MB' });
            else {
              const dumpPath = resolve(out, 'dom', `${family}.dom.html`);
              await writeFile(dumpPath, dump, { mode: 0o600 });
              await chmod(dumpPath, 0o600);
              const code = await redact(dumpPath);
              if (code !== 0 && code !== 2) { await unlink(dumpPath); domSkipped.push({ family, code }); }
            }
          }
        }
        checks.push(task);
      } catch (error) { const failure = { ...task, error: error.message }; failures.push(failure); await appendFile(resolve(out, 'failures.ndjson'), JSON.stringify(failure) + '\n'); console.error(JSON.stringify(failure)); }
      finally { await context.close(); }
    }
  }));
  if (phase !== 'baseline' && phase !== 'matrix') {
    for (const locale of ['ko', 'en']) {
      if (stopping) break;
      const ko = locale === 'ko';
      const t = (en, kr) => ko ? kr : en;
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const cases = {
        'alert-dialog': async target => {
          await target.getByRole('button', { name: t('Delete draft', '보고서 삭제') }).click();
          const dialog = page.getByRole('alertdialog'); await dialog.waitFor();
          await dialog.getByRole('button', { name: t('Cancel', '취소') }).click(); await dialog.waitFor({ state: 'hidden' });
          await target.getByRole('button', { name: t('Delete draft', '보고서 삭제') }).click();
          await page.getByRole('alertdialog').getByRole('button', { name: t('Delete', '삭제'), exact: true }).click();
          await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
        },
        carousel: async target => {
          const track = target.locator('[data-embla-container]'); const before = await track.evaluate(e => e.style.transform);
          await target.locator('[data-slot="carousel-next"]').click();
          await page.waitForFunction(before => document.querySelector('[data-demo-target] [data-embla-container]').style.transform !== before, before);
        },
        command: async target => {
          const input = target.getByPlaceholder(t('Search commands', '명령 검색')); await input.fill(t('Export', '내보내기'));
          await target.getByRole('option', { name: t('Export report', '보고서 내보내기') }).waitFor();
          assert.equal(await target.getByRole('option').count(), 1);
          await target.getByRole('option', { name: t('Export report', '보고서 내보내기') }).click();
        },
        combobox: async target => {
          await target.getByRole('combobox').click();
          await page.getByRole('combobox', { name: t('Search locations', '지역 검색') }).fill(t('Busan', '부산'));
          await page.getByRole('option', { name: t('Busan', '부산') }).click();
          await target.getByRole('combobox', { name: t('Busan', '부산') }).waitFor();
        },
        'data-table': async target => {
          const filter = target.getByRole('searchbox'); await filter.fill(t('Apr', '4월'));
          await target.locator('tbody').getByText(t('Apr', '4월'), { exact: true }).waitFor();
          await filter.fill('');
          await target.locator('tbody input[type=checkbox], tbody [role=checkbox]').first().click();
          await target.getByRole('button', { name: /Next|다음/ }).click();
          await target.locator('tbody').getByText(t('Mar', '3월'), { exact: true }).waitFor();
          await target.getByText(t('Processed', '처리량'), { exact: true }).click();
          await target.getByLabel(t('Rows per page', '페이지당 행 수')).selectOption('10');
          await page.waitForFunction(() => document.querySelectorAll('[data-demo-target] tbody tr').length === 4);
        },
        'date-picker': async target => {
          await target.getByRole('button').click();
          await page.locator('[data-calendar-day][data-value="2026-11-05"]').first().click();
          assert.match(await target.innerText(), /5/);
        },
        'input-otp': async target => {
          await target.locator('input').fill('123456');
          assert.deepEqual((await target.locator('[data-slot="input-otp-slot"]').allTextContents()).map(v => v.trim()), [...'123456']);
        },
        'navigation-menu': async target => {
          for (const width of [1440, 320]) {
            await page.setViewportSize({ width, height: 1000 });
            await target.getByRole('button', { name: t('Documents', '문서') }).click();
            const link = target.getByRole('link', { name: 'API', exact: true });
            await link.waitFor();
            // Check the settled viewport, not the opening animation's transient size.
            await page.waitForTimeout(500);
            const geometry = await link.evaluate(element => {
              const rect = element.getBoundingClientRect();
              const viewport = element.closest('[data-slot="navigation-menu-viewport"]')?.getBoundingClientRect();
              const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
              return { inside: !!viewport && rect.left >= viewport.left && rect.right <= viewport.right && rect.top >= viewport.top && rect.bottom <= viewport.bottom, hit: hit === element || element.contains(hit) };
            });
            assert.deepEqual(geometry, { inside: true, hit: true }, `Navigation Menu link at ${width}px`);
            await page.keyboard.press('Escape');
          }
          await page.setViewportSize({ width: 1440, height: 1000 });
        },
        popover: async target => {
          await target.getByRole('button', { name: t('Notification settings', '알림 설정') }).click();
          await page.getByText(t('Enable the channels you need.', '필요한 채널만 활성화하세요.'), { exact: true }).waitFor();
          await page.getByRole('button', { name: t('Done', '완료') }).click();
        },
        questionnaire: async target => {
          await target.getByText(t('Question 1 of 2', '2개 질문 중 1번째'), { exact: true }).waitFor();
          await target.locator('input[name=format][value=summary]').check();
          await target.locator('[data-slot="questionnaire-next"]').click();
          await target.getByText(t('Question 2 of 2', '2개 질문 중 2번째'), { exact: true }).waitFor();
          await target.locator('input[name=detail][value=comparison]').check();
          await target.locator('[data-slot="questionnaire-submit"]').click();
          await target.getByText(t('Answers submitted.', '답변을 제출했습니다.')).waitFor();
        },
        'range-calendar': async target => {
          const day = target.locator('[data-range-calendar-day][data-value="2026-11-10"]').first(); await day.click();
          await target.locator('[data-range-calendar-day][data-value="2026-11-12"]').first().click();
          assert.equal(await day.getAttribute('data-selected'), '');
        },
        resizable: async target => {
          const pane = target.locator('[data-pane]').first(); const width = await pane.evaluate(e => e.getBoundingClientRect().width);
          const box = await target.locator('[data-slot="resizable-handle"]').boundingBox(); assert.ok(box);
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
          assert.ok(await pane.evaluate(e => e.getBoundingClientRect().width) > width + 5);
        },
        'scroll-area': async target => {
          const viewport = target.locator('[data-slot="scroll-area-viewport"]').last();
          await viewport.evaluate(e => { e.scrollTop = e.scrollHeight; }); assert.ok(await viewport.evaluate(e => e.scrollTop) > 0);
        },
        'message-scroller': async target => {
          const viewport = target.locator('[data-slot="message-scroller-viewport"]');
          await viewport.evaluate(e => { e.scrollTop = 0; });
          await target.locator('[data-slot="message-scroller-button"]').click();
          await page.waitForFunction(() => { const e = document.querySelector('[data-demo-target] [data-slot="message-scroller-viewport"]'); return e.scrollTop > 20 && e.scrollHeight - e.clientHeight - e.scrollTop < 12; });
        },
        tooltip: async target => {
          const trigger = target.locator('[data-slot="tooltip-trigger"]'); await trigger.hover();
          await page.locator('[data-slot="tooltip-content"]').first().waitFor();
        },
        trace: async target => {
          await target.getByRole('button', { name: t('View run details', '실행 단계 보기') }).click();
          await target.getByText(t('Read 4 files', '파일 4개 읽기'), { exact: true }).waitFor();
        },
        textarea: async target => { const el = target.locator('textarea'); await el.fill('changed'); assert.equal(await el.inputValue(), 'changed'); },
        toggle: async target => { const el = target.getByRole('button').first(); const before = await el.getAttribute('aria-pressed'); await el.click(); assert.notEqual(await el.getAttribute('aria-pressed'), before); },
        'toggle-group': async target => { const el = target.getByRole('radio').last(); await el.click(); assert.equal(await el.getAttribute('aria-checked'), 'true'); },
        field: async target => {
          const input = target.locator('input[type=email]'); assert.equal(await input.getAttribute('aria-invalid'), 'true');
          await target.getByText(t('Enter a valid email address.', '유효한 이메일 주소를 입력하세요.'), { exact: true }).waitFor();
          await input.fill('person@example.com');
          assert.equal(await input.inputValue(), 'person@example.com');
          await page.locator('[data-demo-reset]').click();
          await page.waitForFunction(() => document.querySelector('[data-demo-target] input[type=email]')?.value === 'invalid');
        },
        attachment: async target => {
          const link = target.getByRole('link', { name: t('Download', '내려받기') });
          const href = await link.getAttribute('href'); assert.match(href, /^data:text\/csv/); assert.ok(await link.getAttribute('download'));
          assert.equal(await page.evaluate(async url => (await fetch(url)).text(), href), 'month,processed\n2026-11,58');
        },
        chart: async target => {
          const svg = target.locator('svg').first(); await svg.scrollIntoViewIfNeeded(); const box = await svg.boundingBox(); assert.ok(box);
          await page.mouse.move(box.x + box.width * .55, box.y + box.height * .55);
          await target.locator('.lc-highlight-point').first().waitFor();
        },
        slider: async target => {
          const slider = target.getByRole('slider'); await slider.focus(); await page.keyboard.press('ArrowRight');
          await target.getByText(t('Volume: 40%', '볼륨 40%')).waitFor();
        },
        sonner: async target => {
          await target.getByRole('button', { name: t('Show toast', '알림 보내기') }).click();
          await page.getByText(t('Draft saved', '초안을 저장했습니다'), { exact: true }).waitFor();
        },
        label: async target => {
          await target.getByText(t('Search term', '검색어'), { exact: true }).click();
          assert.equal(await target.locator('input').evaluate(e => e === document.activeElement), true);
        },
        'code-block': async target => { await target.locator('[data-slot="code-block-copy-button"]').click(); await page.waitForFunction(async () => await navigator.clipboard.readText() === 'const total = 58;'); },
        'button-group': async target => {
          await target.getByRole('button', { name: t('Name', '이름순'), exact: true }).click();
          await target.getByText(t('Sorted by name', '이름순으로 정렬'), { exact: true }).waitFor();
          await page.locator('[data-demo-reset]').click();
          await target.getByText(t('Sorted by date', '날짜순으로 정렬'), { exact: true }).waitFor();
        },
        collapsible: async target => {
          await target.getByRole('button', { name: t('Error details', '오류 세부 정보') }).click();
          await target.getByText(t('The report link has expired.', '보고서 연결이 만료됐습니다.')).waitFor();
          await page.locator('[data-demo-reset]').click();
          await target.getByText(t('The report link has expired.', '보고서 연결이 만료됐습니다.')).waitFor({ state: 'hidden' });
        },
        'input-group': async target => {
          const input = target.getByRole('textbox', { name: t('Search report titles', '보고서 제목 검색') });
          await input.fill('test');
          await target.getByRole('button', { name: t('Clear', '지우기') }).click();
          assert.equal(await input.inputValue(), '');
          await input.fill('test');
          await page.locator('[data-demo-reset]').click();
          await page.waitForFunction(() => document.querySelector('[data-demo-target] input')?.value === '');
        },
        'native-select': async target => {
          const select = target.locator('select');
          await select.selectOption('busan');
          assert.equal(await select.inputValue(), 'busan');
          await page.locator('[data-demo-reset]').click();
          await page.waitForFunction(() => document.querySelector('[data-demo-target] select')?.value === 'seoul');
        },
        pagination: async target => {
          await target.getByRole('button', { name: t('Go to next page', '다음 페이지로 이동') }).click();
          await target.getByText(t('Page 2 of 3', '3페이지 중 2페이지'), { exact: true }).waitFor();
          await page.locator('[data-demo-reset]').click();
          await target.getByText(t('Page 1 of 3', '3페이지 중 1페이지'), { exact: true }).waitFor();
        },
        progress: async target => {
          await target.getByRole('button', { name: t('Mark complete', '완료 표시') }).click();
          assert.equal(await target.getByRole('progressbar').getAttribute('aria-valuenow'), '100');
          await page.locator('[data-demo-reset]').click();
          await page.waitForFunction(() => document.querySelector('[data-demo-target] [role="progressbar"]')?.getAttribute('aria-valuenow') === '58');
        },
        'radio-group': async target => {
          await target.getByRole('radio', { name: t('Busan', '부산') }).check();
          assert.equal(await target.getByRole('radio', { name: t('Busan', '부산') }).isChecked(), true);
          await page.locator('[data-demo-reset]').click();
          await page.waitForFunction(() => document.querySelector('#radio-seoul')?.getAttribute('data-state') === 'checked');
        },
        sidebar: async target => {
          await target.getByRole('button', { name: t('Settings', '설정') }).click();
          await target.getByText(t('Workspace preferences', '작업 공간 환경 설정')).waitFor();
          await page.locator('[data-demo-reset]').click();
          await target.getByText(t('Monthly reports', '월간 보고서')).waitFor();
        },
      };
      for (const [family, title] of [['drawer', t('Filter reports', '필터 설정')], ['sheet', t('Export options', '내보내기 옵션')]]) cases[family] = async target => {
        await target.getByRole('button', { name: title }).click(); const dialog = page.getByRole('dialog'); await dialog.waitFor();
        await dialog.getByRole('button', { name: t('Close', '닫기'), exact: true }).first().click(); await dialog.waitFor({ state: 'hidden' });
      };
      for (const [family, label, button] of [['context-menu', t('Right-click here', '여기를 마우스 오른쪽 버튼으로 클릭'), 'right'], ['dropdown-menu', t('Document actions', '문서 작업'), 'left'], ['menubar', t('File', '파일'), 'left']]) cases[family] = async target => {
        await target.getByText(label, { exact: true }).click({ button });
        await page.getByRole('menuitem', { name: t('Duplicate', '사본 만들기') }).click();
        await target.getByText(t('Duplicate', '사본 만들기'), { exact: true }).waitFor();
      };
      cases.avatar = async target => { await target.getByText(ko ? 'SY' : 'AV', { exact: true }).waitFor(); };
      for (const family of ['breadcrumb', 'empty', 'item']) cases[family] = async target => {
        const link = target.getByRole('link').first(); const href = await link.getAttribute('href');
        assert.ok(href?.startsWith(ko ? '/ko/' : '/'), `${family} has an internal localized link`);
      };
      cases['hover-card'] = async target => {
        await target.getByText('@operations').hover();
        await page.getByText(t('Manages daily reports and operations.', '일일 보고서와 운영 현황을 관리합니다.'), { exact: true }).waitFor();
      };
      for (const [family, test] of Object.entries(cases)) {
        if (stopping) break;
        if (args.family && family !== args.family) continue;
        try {
          await page.goto(`${origin}${ko ? '/ko' : ''}/docs/svelte-ui/components/${family}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.locator('[data-demo-ready="true"]').waitFor({ timeout: 15000 });
          await test(page.locator('[data-demo-target]'));
          interactions.push({ locale, family });
        } catch (error) { const failure = { locale, family, interaction: true, error: error.message }; failures.push(failure); await appendFile(resolve(out, 'failures.ndjson'), JSON.stringify(failure) + '\n'); console.error(JSON.stringify(failure)); }
      }
      await context.close();
    }
  }
  captures.sort((a, b) => componentDemoSlugs.indexOf(a.family) - componentDemoSlugs.indexOf(b.family));
  const tileWidth = 400, tileHeight = 285, columns = 3, rowsPerSheet = 4;
  for (let start = 0; start < captures.length; start += columns * rowsPerSheet) {
    const group = captures.slice(start, start + columns * rowsPerSheet);
    const composite = [];
    for (const [index, capture] of group.entries()) {
      const image = await sharp(capture.path).resize(tileWidth, tileHeight - 24, { fit: 'contain', background: '#eeeeee' }).png().toBuffer();
      const label = Buffer.from(`<svg width="${tileWidth}" height="24"><rect width="100%" height="100%" fill="white"/><text x="8" y="17" font-size="14" font-family="sans-serif">${capture.family}</text></svg>`);
      composite.push({ input: label, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight });
      composite.push({ input: image, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight + 24 });
    }
    await sharp({ create: { width: tileWidth * columns, height: tileHeight * Math.ceil(group.length / columns), channels: 4, background: '#ffffff' } }).composite(composite).png().toFile(resolve(out, `contact-${String(start / (columns * rowsPerSheet) + 1).padStart(2, '0')}.png`));
  }
  const existingInteractionSuite = ['accordion', 'button', 'calendar', 'checkbox', 'dialog', 'input', 'select', 'switch', 'tabs'];
  const interactionFamilies = [...new Set(interactions.map(item => item.family))];
  const renderOnlyFamilies = componentDemoSlugs.filter(family => !interactionFamilies.includes(family) && !existingInteractionSuite.includes(family));
  const result = { origin, phase, interrupted: stopping, interactionFamilies, existingInteractionSuite, renderOnlyFamilies, domSkipped, checked: checks.length, expected: variants.length * families.length, captures: captures.length, checks, interactions, failures };
  await writeFile(resolve(out, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ checked: checks.length, expected: result.expected, captures: captures.length, interactions: interactions.length, failures }, null, 2));
  if (failures.length || stopping) process.exitCode = 1;
} finally { await browser.close(); }
