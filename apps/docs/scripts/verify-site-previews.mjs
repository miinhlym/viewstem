import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.DOCS_ORIGIN ?? 'http://localhost:4321';
const browser = await chromium.launch({ channel: process.env.DEMO_BROWSER_CHANNEL });

async function verify(locale) {
  const ko = locale === 'ko';
  const t = (en, kr) => ko ? kr : en;
  const prefix = ko ? '/ko' : '';
  const context = await browser.newContext({ viewport: { width: ko ? 390 : 1440, height: 900 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const open = async slug => {
      await page.goto(`${origin}${prefix}/examples/${slug}/`, { waitUntil: 'commit' });
      const preview = page.locator('[data-example-target] [data-viewstem-ui]');
      await preview.first().waitFor({ state: 'attached' });
      await page.locator('[data-example-running]').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('[data-example-status]').isVisible(), false, slug);
      return preview;
    };
    const entries = await readdir(new URL(`../dist${prefix}/examples/`, import.meta.url), { withFileTypes: true });
    const lessons = entries.filter(entry => entry.isDirectory());
    assert.ok(lessons.length > 0);
    for (const { name } of lessons) await open(name);

    let preview = await open('event-payload');
    await preview.getByRole('textbox', { name: t('Project name', '프로젝트 이름') }).fill('Migration check');
    await preview.getByText('Migration check', { exact: true }).waitFor();
    preview = await open('conditional-ui');
    const toggle = preview.getByRole('switch');
    const details = preview.getByText(t('Details are visible', '세부 정보가 표시됩니다'), { exact: true });
    await toggle.click();
    await details.waitFor();
    await toggle.click();
    await details.waitFor({ state: 'hidden' });
    preview = await open('refresh-query');
    await preview.getByText(t('Projects 1', '프로젝트 1'), { exact: true }).waitFor();
    await preview.getByRole('button', { name: t('Refresh', '새로고침'), exact: true }).click();
    await preview.getByText(t('Projects 2', '프로젝트 2'), { exact: true }).waitFor();
    preview = await open('set-state');
    const source = await page.locator('#source-view textarea').inputValue();
    await preview.getByRole('button', { name: t('Save', '저장'), exact: true }).click();
    await preview.getByText(t('Saved', '저장됨'), { exact: true }).waitFor();

    await page.goto(`${origin}${prefix}/playground/`);
    const editor = page.locator('.cm-content');
    const run = page.getByRole('button', { name: t('Run', '실행'), exact: true });
    const draft = JSON.stringify(JSON.parse(source));
    await editor.fill(draft);
    await run.click();
    const result = page.locator('[data-viewstem-ui]');
    const initial = result.getByText(t('Draft', '초안'), { exact: true });
    const saved = result.getByText(t('Saved', '저장됨'), { exact: true });
    await initial.waitFor();
    await result.getByRole('button', { name: t('Save', '저장'), exact: true }).click();
    await saved.waitFor();
    await editor.fill('{"render":{"id":"bad","componentRef":"unknown"}}');
    await run.click();
    await page.getByRole('alert').filter({ hasText: 'REFERENCE_NOT_FOUND' }).waitFor();
    await saved.waitFor();
    await editor.fill(draft);
    await run.click();
    await initial.waitFor();
    await page.getByRole('alert').waitFor({ state: 'hidden' });

    await page.goto(`${origin}${prefix}/docs/svelte-ui/components/button/`);
    await page.waitForURL(`${origin}${prefix}/docs/ui/components/button/`);
    await page.locator('[data-demo-target] [data-viewstem-ui]').first().waitFor();
    assert.deepEqual(errors, []);
    return { locale, lessonPages: lessons.length, events: ['input', 'checkedChange', 'click', 'RefreshQuery'], playground: 'run, invalid definition, retained preview and rerun', redirect: true };
  } finally { await context.close(); }
}

try {
  console.log(JSON.stringify(await Promise.all(['en', 'ko'].map(verify)), null, 2));
} finally { await browser.close(); }
