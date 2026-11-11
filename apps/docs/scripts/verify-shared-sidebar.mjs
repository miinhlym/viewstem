import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const origin = process.env.DOCS_ORIGIN ?? 'http://localhost:4321';
const browser = await chromium.launch({ channel: 'chrome' });
const checks = [];
const errors = [];
const styles = async (page, root) => {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  return page.locator(root).evaluate(el => {
  const read = e => {
    const s = getComputedStyle(e);
    return Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','paddingTop','paddingBottom','paddingLeft','paddingRight','borderRadius','color','backgroundColor','minHeight'].map(k => [k,s[k]]));
  };
  const group = el.querySelector('[data-sidebar-group] > button');
  const link = el.querySelector('a:not([aria-current])');
  const selected = el.querySelector('a[aria-current="page"]');
  return { group: read(group), link: read(link), selected: read(selected) };
  });
};
try {
  for (const ko of [false, true]) for (const theme of ['light','dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const prefix = ko ? '/ko' : '';
    await page.goto(origin+prefix+'/docs/');
    await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
    const docs = await styles(page, '#starlight__sidebar');
    const docsWidth = await page.locator('#starlight__sidebar').evaluate(el => el.getBoundingClientRect().width);
    await page.goto(origin+prefix+'/examples/');
    await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
    assert.deepEqual(await styles(page,'.example-nav'), docs, 'Both routes must render identical menu styles');
    assert.equal(await page.locator('.example-nav').evaluate(el=>el.getBoundingClientRect().width),docsWidth);
    const group = page.locator('.example-nav [data-sidebar-group] > button').first();
    await group.click(); assert.equal(await group.getAttribute('aria-expanded'),'false');
    await group.press('Enter'); assert.equal(await group.getAttribute('aria-expanded'),'true');
    for (const width of [375,768,800,1440,1920]) {
      await page.setViewportSize({width,height:900});
      const layout = await page.evaluate(()=>({
        body:document.documentElement.clientWidth, overflow:document.documentElement.scrollWidth,
        outer:document.querySelector('.examples-layout').getBoundingClientRect().width,
        content:document.querySelector('.example-main').getBoundingClientRect().width,
        sidebar:getComputedStyle(document.querySelector('.example-nav')).display,
      }));
      assert.equal(layout.outer,layout.body);
      assert.ok(layout.overflow<=layout.body+1);
      assert.ok(layout.content<=784);
      assert.equal(layout.sidebar==='none',width<800);
    }
    // Both menus use the same Sheet, ScrollArea and navigation tree.
    await page.setViewportSize({width:375,height:812});
    await page.goto(origin+prefix+'/docs/ui/components/tooltip/');
    await page.getByRole('button',{name:ko?'문서 메뉴':'Docs menu',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    const mobileDocs = await styles(page,'[role="dialog"]');
    await page.waitForFunction(()=>document.querySelector('[role="dialog"] [data-slot="scroll-area-viewport"]')?.scrollTop>500);
    await page.keyboard.press('Escape');
    await page.goto(origin+prefix+'/examples/first-view/');
    await page.getByRole('button',{name:ko?'학습 단계':'Learning stages',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    assert.deepEqual(await styles(page,'[role="dialog"]'),mobileDocs);
    await page.getByRole('dialog').locator(`a[href="${prefix}/examples/component-inputs/"]`).click();
    await page.waitForURL(origin+prefix+'/examples/component-inputs/');
    assert.equal(await page.getByRole('dialog').count(),0);
    await page.locator('[data-example-target] button').waitFor();
    checks.push({locale:ko?'ko':'en',theme,desktopStyleMatch:true,mobileStyleMatch:true,widths:[375,768,800,1440,1920],groupKeyboard:true,mobileNavigation:true});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({checks,errors},null,2));
} finally { await browser.close(); }
