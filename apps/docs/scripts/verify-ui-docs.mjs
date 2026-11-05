import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { svelteConsumerPlugin } from '../../../packages/svelte-ui/test/fixtures/svelte-consumer-plugin.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const docs = join(root, 'apps/docs/src/content/docs');
const temporary = await mkdtemp(join(tmpdir(), 'viewstem-ui-docs-'));
const bin = name => join(root, 'node_modules/.bin', name);
const readmeRoot = join(root, 'packages/svelte-ui');
const html = '<!doctype html><meta charset="utf-8"><div id="app"></div>';

async function snippets(path, language) {
  const body = await readFile(path, 'utf8');
  return [...body.matchAll(new RegExp('^\x60{3}' + language + '\\n([\\s\\S]*?)^\x60{3}$', 'gm'))].map(match => match[1]);
}

async function bundle(contents) {
  const output = await build({
    stdin: { contents, loader: 'ts', resolveDir: temporary },
    bundle: true,
    write: false,
    outdir: temporary,
    format: 'iife',
    platform: 'browser',
    conditions: ['svelte', 'browser'],
    plugins: [svelteConsumerPlugin],
  });
  return {
    javascript: output.outputFiles.find(file => file.path.endsWith('.js')).text,
    css: output.outputFiles.find(file => file.path.endsWith('.css'))?.text,
  };
}

async function load(page, contents) {
  const { javascript, css } = await bundle(contents);
  await page.route('http://ui-docs.test/', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://ui-docs.test/');
  if (css) await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
}

async function withPage(browser, run) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack));
  try {
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

function mountView(view, sets, families = sets) {
  const imports = sets.map((name, index) => 'import { ' + name + ' } from "@viewstem/svelte-ui/shadcn/' + families[index] + '";');
  return `
import { createRenderer } from '@viewstem/svelte';
import { registerComponents } from '@viewstem/svelte-ui';
import '@viewstem/svelte-ui/shadcn/styles.css';
${imports.join('\n')}

(async () => {
  const renderer = createRenderer();
  registerComponents(renderer, [${sets.join(', ')}]);
  window.viewErrors = [];
  const mounted = await renderer.mount({
    target: document.querySelector('#app'), view: ${JSON.stringify(view)},
    onError: diagnostic => window.viewErrors.push(diagnostic.error),
  });
  await mounted.initialComplete;
  window.mounted = mounted;
  window.closeView = async () => { await mounted.dispose(); await renderer.dispose(); };
})();
`;
}

try {
  await symlink(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir');
  await writeFile(join(temporary, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true },
    include: ['*.ts', '*.svelte'],
  }));

  const cases = [];
  const typeFiles = [];
  for (const [locale, label] of [['en', 'Save'], ['ko', '저장']]) {
    const ui = join(docs, locale === 'ko' ? 'ko/docs' : 'docs', 'svelte-ui');
    const writeTypeFile = async (name, contents) => {
      typeFiles.push(name);
      await writeFile(join(temporary, name), contents);
    };

    const [register, fullKit, cleanup] = await snippets(join(ui, 'guides/register-families.md'), 'ts');
    assert.ok(register && fullKit && cleanup);
    await writeTypeFile(locale + '-register.ts', register + '\n' + cleanup);
    await writeTypeFile(locale + '-full-kit.ts', register
      .replace("import { button } from '@viewstem/svelte-ui/shadcn/button';\n", '')
      .replace('registerComponents(renderer, [button]);', fullKit.trim()));
    cases.push({ label, register, cleanup });

    const [dialog, input] = (await snippets(join(ui, 'guides/compose-json.md'), 'json')).map(JSON.parse);
    assert.ok(dialog && input);
    Object.assign(cases.at(-1), { dialog, input });

    const [native] = await snippets(join(ui, 'guides/style-and-native.md'), 'svelte');
    const nativeFile = locale + '-Calendar.svelte';
    await writeTypeFile(nativeFile, native);
    cases.at(-1).nativeFile = nativeFile;

    const readme = join(readmeRoot, locale === 'ko' ? 'README.ko.md' : 'README.md');
    const [nativeReadme] = await snippets(readme, 'svelte');
    await writeTypeFile(locale + '-ReadmeCalendar.svelte', nativeReadme);

    const [signature, custom] = await snippets(join(ui, 'registration/index.md'), 'ts');
    await writeTypeFile(locale + '-signature.ts', signature);
    await writeTypeFile(locale + '-custom.ts', custom);
    for (const route of ['support/index.md', 'component-sets/index.md']) {
      const [example] = await snippets(join(ui, route), 'ts');
      await writeTypeFile(locale + '-' + route.split('/')[0] + '.ts', example);
    }

    cases.at(-1).familyExamples = [];
    for (const file of await readdir(join(ui, 'components'))) {
      const path = join(ui, 'components', file);
      const [imports, ...examples] = await snippets(path, 'ts');
      for (const view of await snippets(path, 'json')) {
        cases.at(-1).familyExamples.push({ family: file.replace('.md', ''), view: JSON.parse(view) });
      }
      assert.ok(imports, file);
      await writeTypeFile(locale + '-' + file.replace('.md', '.ts'), imports);
      for (const [index, example] of examples.entries()) {
        await writeTypeFile(locale + '-' + file.replace('.md', '-' + index + '.ts'), example);
      }
    }
  }

  execFileSync(bin('svelte-check'), ['--workspace', temporary, '--tsconfig', './tsconfig.json', '--fail-on-warnings'], { stdio: 'inherit' });

  let browserExamples = 0;
  const browser = await chromium.launch();
  try {
    for (const { label, register, cleanup, dialog, input, nativeFile, familyExamples } of cases) {
      await withPage(browser, async page => {
        const imports = register.match(/^import .*;$/gm).join('\n');
        const body = register.replace(/^import .*;$/gm, '');
        await load(page, imports + '\n(async () => {\n' + body +
          '\nwindow.closeView = async () => {\n' + cleanup + '\n};\n})();');
        const button = page.getByRole('button', { name: label });
        await button.waitFor();
        await page.waitForFunction(() => typeof window.closeView === 'function');
        await page.evaluate(() => window.closeView());
        await button.waitFor({ state: 'detached' });
      });

      await withPage(browser, async page => {
        await load(page, mountView(dialog, ['button', 'dialog']));
        await page.waitForFunction(() => Boolean(window.mounted));
        await page.getByRole('button', { name: dialog.render.slots.default[0].slots.child[0].inputs.text }).click();
        const modal = page.getByRole('dialog');
        await modal.waitFor();
        const closeLabel = dialog.render.slots.default[1].slots.default[2].inputs.text;
        await modal.getByRole('button', { name: closeLabel, exact: true }).first().click();
        await modal.waitFor({ state: 'hidden' });
        await page.evaluate(() => window.closeView());
      });

      await withPage(browser, async page => {
        await load(page, mountView(input, ['input']));
        await page.waitForFunction(() => Boolean(window.mounted));
        await page.getByRole('textbox', { name: input.render.inputs['aria-label'] }).fill('Viewstem 한글');
        await page.waitForFunction(() => window.mounted.view.getState('name').getSnapshot().value === 'Viewstem 한글');
        await page.evaluate(() => window.closeView());
      });

      await withPage(browser, async page => {
        await load(page, 'import { mount } from "svelte"; import Calendar from "./' + nativeFile +
          '"; mount(Calendar, { target: document.querySelector("#app") });');
        await page.getByRole('grid').waitFor();
        assert.ok(await page.getByRole('gridcell').count() >= 28);
      });

      const validateExample = {
        accordion: async (page, render) => {
          const [trigger, content] = render.slots.default[0].slots.default;
          const answer = page.getByText(content.inputs.text);
          await answer.waitFor({ state: 'hidden' });
          await page.getByRole('button', { name: trigger.inputs.text }).click();
          await answer.waitFor();
        },
        button: async (page, { inputs }) => {
          const button = page.getByRole('button', { name: inputs.text });
          assert.match(await button.getAttribute('class'), /\bborder-border\b/);
        },
        card: async (page, render) => {
          const [header, content] = render.slots.default;
          await page.getByText(header.slots.default[0].inputs.text, { exact: true }).waitFor();
          await page.getByText(content.inputs.text, { exact: true }).waitFor();
        },
        chart: (page, { inputs }) => page.getByRole('figure', { name: inputs.label }).locator('svg').first().waitFor(),
        combobox: (page, { inputs }) => page.getByRole('combobox', { name: inputs.options[0].label }).waitFor(),
        'data-table': (page, { inputs }) => page.getByRole('cell', { name: inputs.data[0].report }).waitFor(),
        'date-picker': async page => {
          await page.locator('#app button').first().click();
          await page.getByRole('grid').waitFor();
        },
        dialog: async (page, render) => {
          const [trigger, content] = render.slots.default;
          const [title] = content.slots.default;
          await page.getByRole('button', { name: trigger.inputs.text }).click();
          const modal = page.getByRole('dialog', { name: title.inputs.text });
          await modal.waitFor();
          await page.keyboard.press('Escape');
          await modal.waitFor({ state: 'hidden' });
        },
        input: async (page, { inputs }) => {
          const textbox = page.getByRole('textbox', { name: inputs['aria-label'] });
          assert.equal(await textbox.inputValue(), inputs.value);
          await textbox.fill('Viewstem 한글');
          assert.equal(await textbox.inputValue(), 'Viewstem 한글');
        },
        select: async (page, render) => {
          const [trigger, content] = render.slots.default;
          const [initial, next] = content.slots.default;
          const combobox = page.getByRole('combobox', { name: trigger.inputs['aria-label'] });
          await combobox.getByText(initial.inputs.label, { exact: true }).waitFor();
          await combobox.click();
          await page.getByRole('option', { name: next.inputs.label }).click();
          await combobox.getByText(next.inputs.label, { exact: true }).waitFor();
        },
        sonner: (page, { inputs }) => page.getByText(inputs.notifications[0].title, { exact: true }).waitFor(),
        tabs: async (page, render) => {
          const [list, initial, next] = render.slots.default;
          await page.getByRole('tabpanel').filter({ hasText: initial.inputs.text }).waitFor();
          await page.getByRole('tab', { name: list.slots.default[1].inputs.text }).click();
          await page.getByRole('tabpanel').filter({ hasText: next.inputs.text }).waitFor();
        },
        typography: (page, { inputs }) => page.getByRole('heading', { name: inputs.text, level: 2 }).waitFor(),
      };
      assert.deepEqual(familyExamples.map(({ family }) => family).sort(), Object.keys(validateExample).sort());
      for (const { family, view } of familyExamples) {
        const set = { 'data-table': 'dataTable', 'date-picker': 'datePicker' }[family] ?? family;
        await withPage(browser, async page => {
          await load(page, mountView(view, [set], [family]));
          await page.waitForFunction(() => Boolean(window.mounted));
          await validateExample[family](page, view.render);
          assert.deepEqual(await page.evaluate(() => window.viewErrors), [], family);
          await page.evaluate(() => window.closeView());
        });
      }
      browserExamples += 4 + familyExamples.length;
    }
  } finally {
    await browser.close();
  }

  console.log('Verified ' + typeFiles.length + ' TypeScript/Svelte snippets and ' + browserExamples + ' browser examples across both locales.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
