import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { compile } from 'svelte/compiler';
import { samples as examples } from './fixtures/samples.mjs';
import support from '../dist/support.json' with { type: 'json' };

const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const testDir = fileURLToPath(new URL('.', import.meta.url));
const hosts = ['vanilla', 'react', 'vue', 'svelte'];
const frameworkModule = /(?:^|\/)node_modules\/(?:react(?:-dom)?|scheduler|svelte|vue|@vue\/[^/]+)(?:\/|$)/;
const npm = (cwd, args) => execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

async function buildHost(host, directory) {
  const bundle = await build({
    absWorkingDir: directory,
    entryPoints: [`hosts/${host}.mjs`],
    bundle: true,
    platform: 'browser',
    outfile: `${host}.js`,
    conditions: ['browser'],
    nodePaths: [join(workspace, 'node_modules')],
    write: false,
    metafile: true,
    plugins: [{
      name: 'svelte-host',
      setup(builder) {
        builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
          const { js } = compile(await readFile(path, 'utf8'), { filename: path, generate: 'client' });
          return { contents: js.code, loader: 'js' };
        });
      },
    }],
  });
  const inputs = Object.keys(bundle.metafile.inputs);
  assert.ok(inputs.includes('node_modules/@viewstem/ui/dist/index.js'));
  assert.ok(inputs.includes('node_modules/@viewstem/ui/dist/styles.css'));
  assert.ok(inputs.includes('node_modules/@viewstem/core/dist/index.js'));
  if (host === 'vanilla') assert.deepEqual(inputs.filter(path => frameworkModule.test(path)), []);
  else assert.ok(inputs.some(path => path.includes(`node_modules/${host}/`)), `${host} must run its real runtime`);
  return bundle.outputFiles;
}

test('packed UI renders the same View JSON in four browser hosts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'viewstem-ui-consumer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'package.json'), '{"private":true,"type":"module"}\n');
  const packs = ['core', 'ui'].map(pkg => JSON.parse(npm(workspace, [
    'pack', `./packages/${pkg}`, '--pack-destination', directory, '--ignore-scripts', '--json',
  ]))[0]);
  npm(directory, ['install', ...packs.map(pack => join(directory, pack.filename)), '--ignore-scripts', '--no-audit', '--no-fund']);
  const lock = JSON.parse(await readFile(join(directory, 'package-lock.json'), 'utf8'));
  assert.deepEqual(Object.keys(lock.packages).filter(path => frameworkModule.test(path)), []);
  const uiPackage = JSON.parse(await readFile(join(directory, 'node_modules/@viewstem/ui/package.json'), 'utf8'));
  assert.deepEqual(uiPackage.dependencies, {
    '@viewstem/core': '0.1.0',
    '@internationalized/date': '3.12.0',
    '@tanstack/table-core': '9.0.0',
    '@zag-js/date-picker': '1.47.0',
    '@zag-js/hover-card': '1.47.0',
    '@zag-js/menu': '1.47.0',
    '@zag-js/navigation-menu': '1.47.0',
    '@zag-js/scroll-area': '1.47.0',
    '@zag-js/slider': '1.47.0',
    '@zag-js/splitter': '1.47.0',
    '@zag-js/vanilla': '1.47.0',
    'd3-scale': '4.0.2',
    'embla-carousel': '8.6.0',
  });
  assert.equal(uiPackage.peerDependencies, undefined);

  await cp(join(testDir, 'hosts'), join(directory, 'hosts'), { recursive: true });
  await cp(join(testDir, 'view.json'), join(directory, 'view.json'));
  await writeFile(join(directory, 'catalog.json'), JSON.stringify(examples));
  const bundles = (await Promise.all(hosts.map(host => buildHost(host, directory)))).flat();
  const files = new Map(bundles.map(file => [basename(file.path), file.contents]));
  const server = createServer((request, response) => {
    const path = request.url?.slice(1) ?? '';
    if (files.has(path)) {
      response.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript');
      response.end(files.get(path));
    } else if (hosts.includes(path)) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Viewstem UI</title>
        <link rel="stylesheet" href="/${path}.css"><main id="host"></main><button id="outside">Host content</button>
        <script>window.fixture = { errors: [] };</script><script src="/${path}.js"></script></html>`);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`;

  for (const host of hosts) {
    // The vanilla lane also mounts every catalog example and exercises its controllers.
    await t.test(host, { timeout: host === 'vanilla' ? 60_000 : 20_000 }, async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(5_000);
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      try {
        await page.goto(`${origin}/${host}`);
        await page.waitForFunction(() => window.fixture.ready !== undefined);
        await page.evaluate(() => window.fixture.ready);

        const card = page.locator('[data-vs-part=card]');
        assert.equal(await card.locator('[data-vs-part=card-title]').textContent(), 'Profile');
        assert.equal(await card.evaluate(element => getComputedStyle(element).display), 'flex');
        assert.equal(await page.locator('#outside').evaluate(element => element.closest('[data-viewstem-ui]')), null);
        assert.equal(await page.evaluate(() => {
          try { window.fixture.checkDuplicate(); } catch { return true; }
          return false;
        }), true);

        const name = page.getByRole('textbox', { name: 'Name', exact: true });
        await name.pressSequentially('Mina');
        await page.waitForFunction(() => window.fixture.view.getState('name').read() === 'Mina');
        assert.equal(await name.evaluate(element => document.activeElement === element && element.selectionStart === 4), true);
        assert.equal(await card.locator('[data-vs-part=card-description]').textContent(), 'Mina');
        await name.fill('<b>literal</b>');
        await page.getByText('<b>literal</b>', { exact: true }).waitFor();
        assert.equal(await card.locator('b').count(), 0);

        const checkbox = page.getByRole('checkbox', { name: 'Enable profile' });
        await checkbox.check();
        await page.waitForFunction(() => window.fixture.view.getState('enabled').read() === true);
        await page.evaluate(() => window.fixture.view.getState('enabled').write(false));
        await page.waitForFunction(() => !document.querySelector('[data-vs-part=checkbox]').checked);
        await page.getByRole('button', { name: 'Save profile' }).click();
        await page.getByText('Saved', { exact: true }).waitFor();

        const bravo = page.getByRole('textbox', { name: 'Bravo' });
        await bravo.fill('local edit');
        await bravo.evaluate(element => { element.setSelectionRange(2, 5); window.fixture.original = element; });
        await page.evaluate(() => window.fixture.view.getState('rows').write(['Bravo', 'Alpha']));
        await page.waitForFunction(() => document.querySelector('[aria-label="Bravo"]').nextElementSibling?.getAttribute('aria-label') === 'Alpha');
        assert.deepEqual(await bravo.evaluate(element => [
          element === window.fixture.original, document.activeElement === element,
          element.value, element.selectionStart, element.selectionEnd,
        ]), [true, true, 'local edit', 2, 5]);

        const trigger = page.getByRole('button', { name: 'Open settings' });
        const dialog = page.getByRole('dialog', { name: 'Profile settings' });
        const close = dialog.getByRole('button', { name: 'Close settings' });
        await trigger.click();
        await dialog.waitFor({ state: 'visible' });
        assert.equal(await dialog.evaluate(element => element.matches(':modal')), true);
        assert.equal(await close.evaluate(element => document.activeElement === element), true);
        assert.equal(await page.evaluate(() => window.fixture.view.getState('open').read()), true);
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => window.fixture.view.getState('open').read()), false);
        assert.equal(await trigger.evaluate(element => document.activeElement === element), true);
        await trigger.press('Enter');
        await dialog.waitFor({ state: 'visible' });
        await close.click();
        await dialog.waitFor({ state: 'hidden' });

        const nameBeforeDetach = await name.inputValue();
        await page.evaluate(() => {
          const input = document.querySelector('[aria-label=Name]');
          window.fixture.detach();
          input.value = 'stale';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        assert.equal(await card.count(), 0);
        assert.equal(await page.evaluate(() => window.fixture.view.getState('name').read()), nameBeforeDetach);
        await page.evaluate(() => window.fixture.reattach());
        if (host === 'vanilla') {
          assert.deepEqual(
            examples.map(({ slug }) => slug).sort(),
            [...new Set(support.map(({ family }) => family))].sort(),
            'Every supported family must run its unchanged original ViewSpec',
          );
          for (const { slug } of examples) {
            const roots = await page.evaluate(slug => window.fixture.showExample(slug), slug);
            function assertReady(nodes) {
              for (const node of nodes) {
                assert.equal(node.status, 'ready', `${slug}: ${node.componentRef}`);
                assertReady(node.children);
              }
            }
            assertReady(roots);
            assert.ok(await page.locator('#catalog-example [data-vs-component]').count(), slug);
          }
          const demo = page.locator('#catalog-example');
          await page.evaluate(() => window.fixture.showExample('data-table'));
          const sort = demo.getByRole('button', { name: '처리량', exact: true });
          assert.equal(await sort.evaluate(button => getComputedStyle(button).backgroundColor), 'rgba(0, 0, 0, 0)');
          const table = demo.getByRole('table');
          assert.equal(await table.evaluate(element => getComputedStyle(element.parentElement).borderTopWidth), '1px');
          const rowCheckbox = table.getByRole('checkbox', { name: 'Select row a' });
          assert.equal(await rowCheckbox.evaluate(element => getComputedStyle(element).appearance), 'none');
          const pageSize = demo.getByRole('combobox', { name: 'Rows per page' });
          assert.ok(await pageSize.evaluate(element => {
            const label = element.labels[0].getBoundingClientRect();
            const select = element.getBoundingClientRect();
            return select.left >= label.right && select.top < label.bottom && select.bottom > label.top;
          }));
          await page.evaluate(() => window.fixture.showExample('combobox'));
          const combo = demo.locator('.combobox > button');
          await combo.click();
          const comboSearch = demo.getByPlaceholder('지역 검색');
          await comboSearch.waitFor();
          assert.equal(await comboSearch.evaluate(input => input === document.activeElement), true);
          const firstOption = demo.getByRole('option', { name: '서울', exact: true });
          assert.equal(await comboSearch.getAttribute('aria-activedescendant'), await firstOption.getAttribute('id'));
          assert.deepEqual(await comboSearch.evaluate(input => {
            const search = input.parentElement;
            return {
              inset: search.offsetTop,
              fontSize: getComputedStyle(input).fontSize,
              filled: getComputedStyle(search).backgroundColor !== 'rgba(0, 0, 0, 0)',
            };
          }), { inset: 8, fontSize: '14px', filled: true });
          await comboSearch.fill('없는 지역');
          await comboSearch.press('Escape');
          await comboSearch.waitFor({ state: 'hidden' });
          assert.equal(await combo.evaluate(button => button === document.activeElement), true);
          assert.equal(await combo.textContent(), '서울');
          await combo.click();
          await demo.getByRole('option', { name: '부산' }).click();
          assert.equal(await page.evaluate(() => window.fixture.example.getState('site').read()), 'busan');
          await page.evaluate(() => window.fixture.example.getState('site').write('jeju'));
          assert.equal(await combo.textContent(), '제주');
          await page.evaluate(() => window.fixture.showExample('tabs'));
          await demo.getByRole('tab').nth(1).click();
          assert.equal(await demo.getByRole('tab').nth(1).getAttribute('aria-selected'), 'true');
          assert.equal(await page.evaluate(() => window.fixture.example.getState('tab').read()), 'activity');
          await page.evaluate(() => window.fixture.showExample('select'));
          await demo.locator('.select > button').click();
          await demo.getByRole('option', { name: '부산' }).waitFor();
          assert.equal(await demo.getByRole('option').count(), 3);
          await demo.getByRole('option', { name: '부산' }).click();
          assert.equal(await page.evaluate(() => window.fixture.example.getState('site').read()), 'busan');
          await page.evaluate(() => window.fixture.showExample('command'));
          const commandInput = demo.getByPlaceholder('명령 검색');
          const commandEmpty = demo.getByText('검색 결과가 없습니다.');
          await commandInput.focus();
          assert.deepEqual(await commandInput.evaluate(input => {
            const style = getComputedStyle(input);
            return [style.fontSize, style.borderTopWidth, style.boxShadow];
          }), ['14px', '0px', 'none']);
          assert.equal(await commandEmpty.isVisible(), false);
          await commandInput.fill('없는 명령');
          await commandEmpty.waitFor({ state: 'visible' });
          await commandInput.fill('환경');
          await commandEmpty.waitFor({ state: 'hidden' });
          await commandInput.press('Enter');
          assert.equal(await page.evaluate(() => window.fixture.example.getState('selected').read()), 'settings');
          await page.evaluate(() => window.fixture.showExample('accordion'));
          await demo.getByText('결제', { exact: true }).click();
          await demo.getByText('다음 결제 예정일을 확인합니다.').waitFor();
          await demo.getByText('이 영역에서 팀 설정을 변경합니다.').waitFor({ state: 'hidden' });
          assert.equal(await page.evaluate(() => window.fixture.example.getState('section').read()), 'billing');
          await page.evaluate(() => window.fixture.showExample('input-group'));
          const groupedInput = demo.getByPlaceholder('보고서 제목');
          await demo.getByText('검색', { exact: true }).click();
          assert.equal(await groupedInput.evaluate(input => input === document.activeElement && getComputedStyle(input).borderTopWidth === '0px'), true);
          await groupedInput.fill('월간 보고서');
          await demo.getByRole('button', { name: '지우기' }).click();
          assert.equal(await groupedInput.inputValue(), '');
          await page.evaluate(() => window.fixture.showExample('native-select'));
          await demo.getByRole('combobox').selectOption('jeju');
          assert.equal(await page.evaluate(() => window.fixture.example.getState('site').read()), 'jeju');
          await page.evaluate(() => window.fixture.showExample('pagination'));
          await demo.getByRole('button', { name: '2', exact: true }).click();
          assert.equal(await page.evaluate(() => window.fixture.example.getState('page').read()), 2);
          await page.evaluate(() => window.fixture.showExample('slider'));
          await demo.getByRole('slider').press('ArrowRight');
          assert.equal(await page.evaluate(() => window.fixture.example.getState('level').read()), 40);
          await page.evaluate(() => window.fixture.showExample('popover'));
          const popoverTrigger = demo.getByRole('button', { name: '알림 설정' });
          const popoverClose = demo.getByRole('button', { name: '완료' });
          await popoverTrigger.click();
          await popoverClose.evaluate(button => {
            if (button !== document.activeElement) throw new Error('Popover did not move focus to its first control');
          });
          await popoverClose.press('Escape');
          await popoverClose.waitFor({ state: 'hidden' });
          assert.equal(await popoverTrigger.evaluate(button => button === document.activeElement), true);
          assert.equal(await page.evaluate(() => window.fixture.example.getState('open').read()), false);
          await page.evaluate(() => window.fixture.showExample('sonner'));
          await demo.getByRole('button', { name: '알림 보내기' }).click();
          await demo.getByText('저장했습니다', { exact: true }).waitFor();
          await demo.getByRole('button', { name: 'Close' }).click();
          assert.deepEqual(await page.evaluate(() => window.fixture.example.getState('messages').read()), []);
          await page.evaluate(() => window.fixture.showExample('drawer'));
          await demo.getByRole('button', { name: '필터 설정' }).click();
          await demo.getByText('보고서 목록에서 표시할 조건을 선택합니다.').waitFor();
          await demo.getByRole('button', { name: '하위 세부 정보' }).click();
          await demo.getByText('상위 패널에서 연결된 패널입니다.').waitFor();
          await demo.getByRole('button', { name: '세부 정보 닫기' }).click();
          await demo.getByText('상위 패널에서 연결된 패널입니다.').waitFor({ state: 'hidden' });
          await demo.getByRole('button', { name: '닫기', exact: true }).click();
          await demo.getByText('보고서 목록에서 표시할 조건을 선택합니다.').waitFor({ state: 'hidden' });
          assert.equal(await page.evaluate(() => window.fixture.example.getState('open').read()), false);
          await page.evaluate(() => window.fixture.showExample('dropdown-menu'));
          const menuTrigger = demo.getByRole('button', { name: '문서 작업' });
          await menuTrigger.click();
          const menu = demo.getByRole('menu');
          await page.waitForFunction(() => {
            const trigger = document.querySelector('[data-vs-component="DropdownMenu.Trigger"]');
            const menu = document.querySelector('[data-vs-component="DropdownMenu.Content"]');
            return !!menu && document.activeElement === menu && menu.getBoundingClientRect().width >= trigger?.getBoundingClientRect().width;
          });
          assert.deepEqual(await menu.evaluate(menu => {
            const popup = menu.parentElement;
            return [menu === document.activeElement, popup.offsetWidth === popup.previousElementSibling.offsetWidth];
          }), [true, true]);
          const gridMode = demo.getByRole('menuitemcheckbox', { name: '격자 표시' });
          await gridMode.click();
          assert.equal(await gridMode.getAttribute('aria-checked'), 'false');
          assert.equal(await menuTrigger.getAttribute('aria-expanded'), 'true');
          await page.keyboard.press('Escape');
          await gridMode.waitFor({ state: 'hidden' });
          await menuTrigger.click();
          await demo.getByRole('menuitem', { name: '내보내기', exact: true }).hover();
          await demo.getByRole('menuitem', { name: 'CSV', exact: true }).click();
          await demo.getByText('선택한 작업: CSV 내보내기', { exact: true }).waitFor();
          assert.equal(await page.evaluate(() => window.fixture.example.getState('selection').read()), 'CSV 내보내기');
          const previousViewport = page.viewportSize();
          await page.setViewportSize({ width: 460, height: 720 });
          for (const slug of ['calendar', 'range-calendar']) {
            await page.evaluate(slug => window.fixture.showExample(slug), slug);
            const typography = await demo.getByRole('combobox').evaluateAll(selects =>
              selects.map(select => {
                const { fontSize, fontWeight } = getComputedStyle(select);
                return [fontSize, fontWeight];
              }));
            assert.deepEqual(typography, [['14px', '500'], ['14px', '500']]);
          }
          await page.evaluate(() => window.fixture.showExample('alert-dialog'));
          await demo.getByRole('button', { name: '보고서 삭제', exact: true }).click();
          const alert = demo.getByRole('alertdialog');
          await alert.waitFor();
          assert.ok(await alert.evaluate(dialog => {
            const header = dialog.querySelector('header').getBoundingClientRect();
            const media = dialog.querySelector('figure').getBoundingClientRect();
            const title = dialog.querySelector('h2').getBoundingClientRect();
            return Math.abs((header.left + header.right) / 2 - (media.left + media.right) / 2) < 1
              && media.bottom <= title.top;
          }));
          assert.equal(await alert.evaluate(dialog => getComputedStyle(dialog, '::backdrop').backgroundColor), 'rgba(0, 0, 0, 0.19)');
          await alert.getByRole('button', { name: '확인' }).click();
          await alert.waitFor({ state: 'hidden' });
          await page.setViewportSize(previousViewport);
        }
        await trigger.click();
        await dialog.waitFor({ state: 'visible' });
        await page.evaluate(() => window.fixture.unmount());
        await page.locator('[data-viewstem-ui]').waitFor({ state: 'detached' });
        assert.equal(await page.locator('dialog:modal').count(), 0);
        await page.locator('#outside').click();
        assert.deepEqual(await page.evaluate(() => window.fixture.errors), []);
        assert.deepEqual(errors, []);
      } finally {
        await page.close();
      }
    });
  }
});
