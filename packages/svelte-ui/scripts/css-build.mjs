import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { Scanner } from '@tailwindcss/oxide';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { compile } from 'tailwindcss';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../src/lib/shadcn/', import.meta.url));
const archive = JSON.parse(gunzipSync(readFileSync(new URL('../upstream/source.json.gz', import.meta.url))));
const theme = JSON.parse(archive['docs/static/registry/colors/neutral.json']).cssVars;
const animationsPath = require.resolve.paths('tw-animate-css').map((path) =>
	join(path, 'tw-animate-css/dist/tw-animate.css')).find(existsSync);
if (!animationsPath) throw new Error('tw-animate-css is required to build shadcn styles');
const animations = readFileSync(animationsPath, 'utf8');
const defaultTheme = readFileSync(require.resolve('tailwindcss/theme.css'), 'utf8');
const marker = '[data-viewstem-shadcn]';
const dark = ':is(.dark, [data-theme="dark"])';
const markerScope = `:where(${marker}, ${marker} *)`;
const darkScope = `:where(${dark}, ${dark} *)`;

const semanticTokens = Object.keys(theme.light).filter((name) => name !== 'radius');
const radii = { sm: 0.6, md: 0.8, lg: 1, xl: 1.4, '2xl': 1.8, '3xl': 2.2, '4xl': 2.6 };
const radiusVars = Object.entries(radii).map(([size, ratio]) => `--radius-${size}: calc(var(--radius) * ${ratio});`).join('\n');
const colorVars = semanticTokens.map((name) => `--color-${name}: var(--${name});`).join('\n');
const themeDefaults = (mode) => Object.entries(theme[mode]).map(([name, value]) =>
	`--${name}: var(--viewstem-${name}, ${value});`).join('\n');

const input = `
@layer viewstem-theme, viewstem-base, viewstem-utilities;
@layer viewstem-theme {
	${defaultTheme}
	:where(${marker}) {
		${themeDefaults('light')}
		${colorVars}
		${radiusVars}
	}
	:where(${marker})${darkScope} {
		${themeDefaults('dark')}
	}
}
@theme inline {
	${colorVars}
	${radiusVars}
	--animate-accordion-down: accordion-down 0.2s ease-out;
	--animate-accordion-up: accordion-up 0.2s ease-out;
	--animate-caret-blink: viewstem-caret-blink 1.25s ease-out infinite;
	@keyframes viewstem-caret-blink {
		0%, 70%, 100% { opacity: 1; }
		20%, 50% { opacity: 0; }
	}
}
@custom-variant dark (&${darkScope});
${animations}
${archive['packages/cli/src/tailwind.css']}
@layer viewstem-base {
	/* Supply the layout and border defaults expected by the widgets only on kit elements. */
	:where(${marker}, ${marker}::before, ${marker}::after, ${marker}::file-selector-button) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
		border: 0 solid var(--border);
	}
	:where(button, input, select, textarea)${markerScope} {
		font: inherit;
		color: inherit;
		letter-spacing: inherit;
	}
	:where(button, input, select, textarea)${markerScope}:where(:not([type="checkbox"], [type="radio"])) {
		background-color: transparent;
	}
	:where(a)${markerScope} {
		color: inherit;
		text-decoration: inherit;
	}
	:where(${marker}:not(${marker} *)) {
		color: var(--foreground);
	}
}
@layer viewstem-utilities {
	@tailwind utilities;
}
`;

// Scan content supplied by this package, including recipe classes, without scanning the host.
const files = readdirSync(root, { recursive: true, withFileTypes: true }).filter((file) =>
	file.isFile() && /\.(svelte|ts)$/.test(file.name) && !file.name.endsWith('.d.ts'));
const scanner = new Scanner({ sources: [] });
const candidates = scanner.scanFiles(files.map((file) => ({
	content: readFileSync(join(file.parentPath, file.name), 'utf8'),
	extension: file.name.split('.').at(-1),
})));
const css = postcss.parse((await compile(input)).build(candidates));

const scoped = selectorParser((selectors) => {
	for (const selector of selectors.nodes) {
		let utility;
		selector.walkClasses((classNode) => {
			utility = classNode;
			return false;
		});
		if (!utility) throw new Error(`Expected utility class in ${selector}`);
		const guard = selectorParser().astSync(markerScope).first.first;
		utility.parent.insertAfter(utility, guard);
	}
});
css.walkAtRules('layer', (layer) => {
	if (layer.params === 'viewstem-utilities') {
		layer.walkRules((rule) => {
			if (rule.parent.type === 'rule') return;
			rule.selector = scoped.processSync(rule.selector);
		});
	}
});
css.walkRules((rule) => {
	if (rule.selector === ':root, :host') rule.selector = `:where(${marker})`;
	// Upstream reduced-motion override for the shimmer utility.
	if (rule.selector === '.shimmer') rule.selector += markerScope;
	// Tailwind's optional property reset is emitted as * including pseudoelements.
	if (rule.selector === '*, ::before, ::after, ::backdrop') {
		rule.selector = `${markerScope}, ${markerScope}::before, ${markerScope}::after, ${markerScope}::backdrop`;
	}
});

// CSS custom property registrations and keyframes are global regardless of selector scope.
const keyframes = new Set();
css.walkAtRules('keyframes', (rule) => {
	if (rule.params.startsWith('viewstem-')) return;
	keyframes.add(rule.params);
	rule.params = `viewstem-${rule.params}`;
});
css.walkDecls((decl) => {
	if (/(?:^animation(?:-name)?$|^--animate-)/.test(decl.prop)) {
		for (const name of keyframes) {
			decl.value = decl.value.replace(new RegExp(`(^|[\\s,])${name}(?=[\\s,]|$)`, 'g'), '$1viewstem-' + name);
		}
	}
});

css.walkAtRules('layer', (layer) => {
	if (layer.params === 'properties') layer.params = 'viewstem-properties';
});
const output = '/* Generated by scripts/css-build.mjs from the pinned Nova registry and local UI. */\n'
	+ css.toString().replaceAll(/--(tw-|scroll-fade-(?:[tbse]|mask)\b|shimmer-(?:angle|image|text-fill)\b)/g, '--viewstem-$1');
const path = join(root, 'styles.css');
if (process.argv.includes('--check')) {
	if (readFileSync(path, 'utf8') !== output) throw new Error('Generated shadcn/styles.css differs');
} else {
	writeFileSync(path, output);
}
console.log(`Shadcn styles: ${Buffer.byteLength(output)} bytes`);
