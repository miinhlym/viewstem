import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import postcss from 'postcss';
import { createStyleScope } from '@viewstem/dom/styles';
import { scopeUiCss } from '@viewstem/dom/styles/postcss';

const id = 'acme-forms';
const guard = `:where([data-vs-ui-owner="${id}"])`;
const svg = 'http://www.w3.org/2000/svg';

function compile(css, options, owner = id) {
  return postcss([scopeUiCss(owner, options)]).process(css, { from: undefined }).css;
}

test('guards the subject of each selector, including nested rules and originating elements', () => {
  const css = compile(`
    @namespace svg url("${svg}");
    .card > header, svg|svg > svg|circle, :is(.active, [title="a,b"]):first-letter { color: red; }
    .card {
      @media (hover: hover) {
        > header, & > aside::before, .group::after { color: blue; }
      }
    }
    @scope (.maybe-owned) {
      color: red;
      :scope > a { color: blue; }
      padding: 2px;
    }
  `);
  const selectors = [];
  postcss.parse(css).walkRules(rule => { selectors.push(rule.selector); });
  assert.deepEqual(selectors, [
    `.card > header${guard}, svg|svg > svg|circle${guard}, :is(.active, [title="a,b"])${guard}:first-letter`,
    '.card',
    `> header${guard}, & > aside${guard}::before, .group${guard}::after`,
    `:where(:scope)${guard}`,
    `:scope > a${guard}`,
    `:where(:scope)${guard}`,
  ]);
  assert.equal(compile(css), css);
});

test('namespaces layers, local keyframes, local custom properties and their references', () => {
  const options = { publicProperties: ['--public-tone'] };
  const css = compile(`
    @layer reset, theme.palette;
    @layer theme { @layer palette { .palette { color: var(--public-tone); } } }
    @property --progress { syntax: "<number>"; inherits: false; initial-value: 1; }
    @property --default-motion { syntax: "<custom-ident>"; inherits: false; initial-value: ease; }
    @-webkit-keyframes "blink once" { from { opacity: 0; } 50%, to { opacity: 1; } }
    @keyframes ease { to { opacity: 1; } }
    .box {
      --accent: blue;
      --public-tone: var(--accent);
      --acme-forms--gap: 0;
      --label: "blink once";
      --motion: var(--fallback-motion, "blink once" 1s);
      --motion-alias: var(--motion);
      animation: 1s ease, 2s linear ease, var(--motion-alias), 1s host-entrance;
      -webkit-animation-name: var(--default-motion), "blink once";
      content: "var(--accent)";
      color: var(--host-accent, var(--accent));
      opacity: var(--progress);
    }
    @container style(--accent: blue) { .box { outline: none; } }
  `, options);
  assert.match(css, /@layer acme-forms--reset, acme-forms--theme\.palette;/);
  assert.match(css, /@layer acme-forms--theme \{ @layer palette/);
  assert.match(css, /@property --acme-forms--progress/);
  assert.match(css, /@property --acme-forms--default-motion \{ [^}]*initial-value: acme-forms--ease;/);
  assert.match(css, /@-webkit-keyframes "acme-forms--blink once" \{ from \{ opacity: 0; \} 50%, to/);
  assert.match(css, /@keyframes acme-forms--ease \{ to/);
  assert.match(css, /--public-tone: var\(--acme-forms--accent\);/);
  assert.match(css, /--acme-forms--gap: 0;/);
  assert.match(css, /--acme-forms--label: "blink once";/);
  assert.match(css, /--acme-forms--motion: var\(--fallback-motion, "acme-forms--blink once" 1s\);/);
  assert.match(css, /animation: 1s ease, 2s linear acme-forms--ease, var\(--acme-forms--motion-alias\), 1s host-entrance;/);
  assert.match(css, /-webkit-animation-name: var\(--acme-forms--default-motion\), "acme-forms--blink once";/);
  assert.match(css, /content: "var\(--accent\)";/);
  assert.match(css, /color: var\(--host-accent, var\(--acme-forms--accent\)\);/);
  assert.match(css, /opacity: var\(--acme-forms--progress\);/);
  assert.match(css, /@container style\(--acme-forms--accent: blue\)/);
  assert.equal(compile(css, options), css);
});

test('rejects invalid IDs, unresolved imports and cross-boundary pseudo-elements', () => {
  assert.throws(() => createStyleScope('Acme Forms'), /lowercase slug/);
  assert.throws(() => scopeUiCss('acme/forms'), /lowercase slug/);
  assert.throws(() => scopeUiCss(id, { publicProperties: ['accent'] }), /custom property/);
  assert.throws(() => compile('@import "vendor.css";'), /Inline @import/);
  assert.throws(() => compile(String.raw`@i\6d port "vendor.css";`), /Inline @import/);
  assert.throws(() => compile('x-foo::part(chevron) {}'), /originating UI element/);
  assert.throws(() => compile(String.raw`slot::s\6c otted(.header) {}`), /originating UI element/);
  assert.throws(() => compile('.box { --gap: 1px; --acme-forms--gap: 2px; }'), /same custom property/);
});

test('independently built style sets do not share animation names, layers or property registrations', async t => {
  const stylesheet = (owner, name, opacity, level) => compile(`
    @property --${name} { syntax: "<integer>"; inherits: false; initial-value: ${level}; }
    @layer ${name} {
      @keyframes ${name} { from, to { opacity: ${opacity}; } }
      .box { animation: ${name} 1s both; z-index: var(--${name}); }
    }
  `, undefined, owner);
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<div class="box" data-vs-ui-owner="a"></div><div class="box" data-vs-ui-owner="a-b"></div>');
  const read = () => page.locator('.box').evaluateAll(nodes => nodes.map(node => {
    const { opacity, zIndex, animationName } = getComputedStyle(node);
    return { opacity, zIndex, animationName };
  }));
  await page.addStyleTag({ content: stylesheet('a', 'b-pulse', 0.2, 2) });
  const [first] = await read();
  assert.equal(first.opacity, '0.2');
  assert.equal(first.zIndex, '2');
  await page.addStyleTag({ content: stylesheet('a-b', 'pulse', 0.8, 8) });
  const [stillFirst, second] = await read();
  assert.deepEqual(stillFirst, first);
  assert.equal(second.opacity, '0.8');
  assert.equal(second.zIndex, '8');
  assert.notEqual(second.animationName, first.animationName);
  const layers = await page.evaluate(() => [...document.styleSheets].map(sheet => sheet.cssRules[1].name));
  assert.notEqual(layers[0], layers[1]);
  await page.locator('.box').first().evaluate((node, name) => node.style.setProperty(name, '3'),
    createStyleScope('a').localProperty('--b-pulse'));
  assert.deepEqual((await read()).map(node => node.zIndex), ['3', '8']);
});

test('nested styles cross foreign ancestors and scope each declaration to its owned target', async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <section class="theme" id="host" data-vs-ui-owner="other-ui">
      <div class="badge" id="own" data-vs-ui-owner="${id}"></div>
      <div class="badge" id="foreign" data-vs-ui-owner="other-ui"></div>
      <div class="badge" id="plain"></div>
    </section>
    <section class="theme" id="local" data-vs-ui-owner="${id}"></section>
    <section class="theme emphasized" id="specific" data-vs-ui-owner="${id}"></section>
  `);
  const css = compile(`
    .theme, #unused {
      padding-left: 2px;
      .badge {
        border-top: 7px solid red;
        &::before { content: "owned"; }
      }
      @media all {
        padding-left: 3px;
        padding-right: 8px;
        > .badge { padding-top: 5px; }
      }
      @layer {
        padding-bottom: 1px !important;
        .badge { margin-top: 11px; }
        padding-bottom: 9px !important;
      }
      @scope (&) {
        .badge { margin-left: 10px; }
      }
      padding-left: 4px;
    }
    .theme.emphasized { padding-left: 6px; }
  `);
  assert.equal(compile(css), css);
  await page.addStyleTag({ content: css });
  const read = (selector, prop, pseudo) => page.locator(selector)
    .evaluateAll((nodes, [property, element]) => nodes.map(node => getComputedStyle(node, element)[property]), [prop, pseudo]);
  assert.deepEqual(await read('#host, #local, #specific', 'paddingLeft'), ['0px', '4px', '6px']);
  assert.deepEqual(await read('#host, #local, #specific', 'paddingRight'), ['0px', '8px', '8px']);
  assert.deepEqual(await read('#host, #local, #specific', 'paddingBottom'), ['0px', '9px', '9px']);
  assert.deepEqual(await read('.badge', 'borderTopWidth'), ['7px', '0px', '0px']);
  assert.deepEqual(await read('.badge', 'paddingTop'), ['5px', '0px', '0px']);
  assert.deepEqual(await read('.badge', 'marginTop'), ['11px', '0px', '0px']);
  assert.deepEqual(await read('.badge', 'marginLeft'), ['10px', '0px', '0px']);
  assert.deepEqual(await read('.badge', 'content', '::before'), ['"owned"', 'none', 'none']);
});

test('applies nested rules and generated content only to owned HTML and SVG elements', async t => {
  const source = `
    import { createStyleScope } from '@viewstem/dom/styles';
    const scope = createStyleScope('${id}');
    const foreign = createStyleScope('other-ui');
    const card = scope.createElement(document, 'article');
    card.className = 'card';
    const ownHeader = scope.createElement(document, 'header');
    const foreignHeader = foreign.createElement(document, 'header');
    const plainHeader = document.createElement('header');
    card.append(ownHeader, foreignHeader, plainHeader);
    scope.mark(ownHeader);
    let conflict = false;
    try { scope.mark(foreignHeader); } catch (error) { conflict = error instanceof TypeError; }
    const icon = scope.createElementNS(document, '${svg}', 'svg');
    const ownCircle = scope.createElementNS(document, '${svg}', 'circle');
    const plainCircle = document.createElementNS('${svg}', 'circle');
    icon.append(ownCircle, plainCircle);
    document.body.append(card, icon);
    globalThis.readStyles = () => ({
      colors: [ownHeader, foreignHeader, plainHeader].map(node => getComputedStyle(node).borderTopColor),
      widths: [ownHeader, foreignHeader, plainHeader].map(node => getComputedStyle(node).borderTopWidth),
      contents: [ownHeader, foreignHeader, plainHeader].map(node => getComputedStyle(node, '::before').content),
      fills: [ownCircle, plainCircle].map(node => getComputedStyle(node).fill),
      namespace: ownCircle.namespaceURI,
      conflict,
    });
  `;
  const { outputFiles } = await build({
    stdin: { contents: source, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    bundle: true,
    write: false,
  });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.addStyleTag({ content: compile(`
    @namespace svg url("${svg}");
    .card > header { border-top: 7px solid rgb(0, 0, 255); }
    .card {
      & > header::before { content: "owned"; }
    }
    svg|svg > svg|circle { fill: rgb(0, 128, 0); }
  `) });
  await page.addStyleTag({ content: compile('.card > header { border-top: 3px solid rgb(255, 0, 0); }', undefined, 'other-ui') });
  await page.addScriptTag({ content: outputFiles[0].text });
  assert.deepEqual(await page.evaluate(() => globalThis.readStyles()), {
    colors: ['rgb(0, 0, 255)', 'rgb(255, 0, 0)', 'rgb(0, 0, 0)'],
    widths: ['7px', '3px', '0px'],
    contents: ['"owned"', 'none', 'none'],
    fills: ['rgb(0, 128, 0)', 'rgb(0, 0, 0)'],
    namespace: svg,
    conflict: true,
  });
});
