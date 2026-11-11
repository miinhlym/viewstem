import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { Scanner } from '@tailwindcss/oxide';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { compile } from 'tailwindcss';

const require = createRequire(import.meta.url);
const { values: options } = parseArgs({
	options: {
		check: { type: 'boolean' },
		families: { type: 'string' },
		output: { type: 'string' },
	},
});
if (Boolean(options.families) !== Boolean(options.output)) {
	throw new Error('Pass --families and --output together to build a subset.');
}
const root = fileURLToPath(new URL('../src/lib/shadcn/', import.meta.url));
const archive = JSON.parse(gunzipSync(readFileSync(new URL('../upstream/source.json.gz', import.meta.url))));
const { style } = JSON.parse(readFileSync(new URL('../upstream/source.json', import.meta.url)));
const theme = JSON.parse(archive['docs/static/registry/colors/neutral.json']).cssVars;
const animationsPath = require.resolve.paths('tw-animate-css').map((path) =>
	join(path, 'tw-animate-css/dist/tw-animate.css')).find(existsSync);
if (!animationsPath) throw new Error('tw-animate-css is required to build shadcn styles');
const animations = readFileSync(animationsPath, 'utf8');
const defaultTheme = readFileSync(require.resolve('tailwindcss/theme.css'), 'utf8');
const marker = ':is([data-viewstem-shadcn], .viewstem-shadcn-root)';
const dark = ':is(.dark, [data-theme="dark"])';
const markerScope = `:where(${marker}, ${marker} *)`;
const darkScope = `:where(${dark}, ${dark} *)`;

const semanticTokens = Object.keys(theme.light).filter((name) => name !== 'radius');
const radii = { sm: 0.6, md: 0.8, lg: 1, xl: 1.4, '2xl': 1.8, '3xl': 2.2, '4xl': 2.6 };
const radiusVars = Object.entries(radii).map(([size, ratio]) => `--radius-${size}: calc(var(--radius) * ${ratio});`).join('\n');
const colorVars = semanticTokens.map((name) => `--color-${name}: var(--${name});`).join('\n');
const themeDefaults = (mode) => Object.entries(theme[mode]).map(([name, value]) =>
	`--${name}: var(--viewstem-${name}, ${value});`).join('\n');

// Use upstream Tailwind preflight verbatim, scoped to this UI subtree.
// Hand-maintaining a subset dropped heading/image/hidden behavior required by shadcn.
const preflight = postcss.parse(readFileSync(require.resolve('tailwindcss/preflight.css'), 'utf8'));
preflight.walkRules((rule) => {
  if (rule.selector === 'html,\n:host') {
    rule.selector = `:where(${marker}:not(${marker} *))`;
    // The kit inherits the application's selected font, as before.
    rule.walkDecls('font-family', (decl) => { decl.value = 'inherit'; });
    return;
  }
  rule.selector = selectorParser((selectors) => {
    for (const selector of selectors.nodes) {
      const guard = selectorParser().astSync(markerScope).first.first;
      const pseudoElement = selector.nodes.find((node) => node.type === 'pseudo' && node.value.startsWith('::'));
      if (pseudoElement) {
        guard.spaces.before = pseudoElement.spaces.before;
        pseudoElement.spaces.before = '';
        selector.insertBefore(pseudoElement, guard);
      }
      else selector.append(guard);
    }
  }).processSync(rule.selector);
});

const input = `
@layer viewstem-theme, viewstem-base, base, components, component, viewstem-utilities;
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
  ${preflight.toString()}
  :where(${marker}, ${marker} *, ${marker}::before, ${marker}::after) {
    border-color: var(--border);
  }
	:where(${marker}:not(${marker} *)) {
		color: var(--foreground);
	}
	:where([data-bits-day])${markerScope}:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent);
	}
	:where([data-slot="popover-close"])${markerScope}:focus-visible {
		border-radius: 2px;
		outline: 2px solid var(--ring);
	}
}
@layer viewstem-utilities {
	@tailwind utilities;
}
`;

// Scan content supplied by this package, including recipe classes, without scanning the host.
const scanRoots = options.families
	? options.families.split(',').map((family) => {
		if (!/^[a-z][a-z-]*$/.test(family)) throw new Error(`Invalid shadcn family: ${family}`);
		return join(root, 'vendor', family);
	})
	: [root];
const files = scanRoots.flatMap((source) => readdirSync(source, { recursive: true, withFileTypes: true }))
	.filter((file) => file.isFile() && /\.(svelte|ts)$/.test(file.name) && !file.name.endsWith('.d.ts'));
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
const output = `/* Generated by scripts/css-build.mjs from the pinned ${style} registry and local UI. */\n`
	+ css.toString().replaceAll(/--(tw-|scroll-fade-(?:[tbse]|mask)\b|shimmer-(?:angle|image|text-fill)\b)/g, '--viewstem-$1');
const path = options.output ?? join(root, 'styles.css');
if (options.check) {
	if (readFileSync(path, 'utf8') !== output) throw new Error(`Generated shadcn CSS differs: ${path}`);
} else {
	writeFileSync(path, output);
}
console.log(`Shadcn styles: ${Buffer.byteLength(output)} bytes`);
