import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { parse } from 'svelte/compiler';

const upstream = new URL('../upstream/', import.meta.url);
const vendor = fileURLToPath(new URL('../src/lib/shadcn/vendor/', import.meta.url));
const provenance = JSON.parse(readFileSync(new URL('source.json', upstream)));
const archive = JSON.parse(gunzipSync(readFileSync(new URL('source.json.gz', upstream))));
const outputs = new Map();

for (const [path, expected] of Object.entries(provenance.files)) {
	const actual = createHash('sha256').update(archive[path]).digest('hex');
	if (actual !== expected) throw new Error(`Upstream integrity check failed for ${path}`);
}

function localImport(from, target) {
	const path = relative(dirname(from), resolve(vendor, target)).replaceAll('\\', '/');
	return path.startsWith('.') ? path : `./${path}`;
}

function visit(node, callback) {
	if (!node || typeof node !== 'object') return;
	callback(node);
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) for (const child of value) visit(child, callback);
		else if (value?.type) visit(value, callback);
	}
}

function lucidePath(name) {
	// Matches the pinned CLI's pascalToKebab and toLucideKebab helpers.
	return name
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.replace(/([a-zA-Z])(\d)/g, '$1-$2')
		.replace(/(\d)([a-zA-Z])/g, '$1-$2')
		.toLowerCase()
		.replace('-icon', '');
}

// These wrappers spread consumer props after internal handlers. CopyButton and
// Sidebar.Trigger already extract and chain onclick before collecting restProps.
const handlersToCompose = {
	'carousel/carousel-next.svelte': { onclick: 'emblaCtx.scrollNext()', onkeydown: 'emblaCtx.handleKeyDown(e)' },
	'carousel/carousel-previous.svelte': { onclick: 'emblaCtx.scrollPrev()', onkeydown: 'emblaCtx.handleKeyDown(e)' },
	'input-group/input-group-addon.svelte': { onclick: null },
	'sidebar/sidebar-rail.svelte': { onclick: 'sidebar.toggle()' },
};

function composeHandlers(node, handlers, content, edits, composed, buttonOrAnchor) {
	if (!handlers) return;
	const spread = node.attributes.findLast((attr) => attr.type === 'SpreadAttribute');
	if (spread?.expression.name !== 'restProps') return;
	const indent = content.slice(content.lastIndexOf('\n', spread.start) + 1, spread.start);
	const replacements = [];
	for (const attribute of node.attributes) {
		const name = attribute.name;
		if (attribute.start > spread.start || !Object.hasOwn(handlers, name)) continue;
		const expression = attribute.value.expression;
		const original = handlers[name];
		const consumer = buttonOrAnchor
			? `(restProps.${name} as ((event: typeof e) => void) | null | undefined)`
			: `restProps.${name}`;
		const body = original === null
			? content.slice(expression.body.start + 1, expression.body.end - 1).trimEnd()
			: `\n${indent}\t${original};`;
		replacements.push(`${indent}${name}={(e) => {
${indent}\t${consumer}?.(e);
${indent}\tif (e.defaultPrevented) return;${body}
${indent}}}`);
		const start = content.lastIndexOf('\n', attribute.start) + 1;
		const end = content.indexOf('\n', attribute.end) + 1;
		edits.push([start, end, '']);
		composed.add(name);
	}
	if (replacements.length) edits.push([spread.end, spread.end, '\n' + replacements.join('\n')]);
}

function transformComponent(content, filename) {
	const ast = parse(content, { filename, modern: true });
	const edits = [];
	const icons = new Set();
	const path = relative(vendor, filename).replaceAll('\\', '/');
	const handlers = handlersToCompose[path];
	const composed = new Set();
	const iconLibraries = new Set(['lucide', 'tabler', 'hugeicons', 'phosphor', 'remixicon']);
	visit(ast.fragment, (node) => {
		if (node.type === 'Component' && node.name === 'IconPlaceholder') {
			const icon = node.attributes.find((attr) => attr.name === 'lucide')?.value?.[0]?.data;
			if (!icon || !/^[A-Z][a-zA-Z0-9]*$/.test(icon)) throw new Error(`Missing Lucide icon in ${filename}`);
			const rest = node.attributes.filter((attr) => !iconLibraries.has(attr.name))
				.map((attr) => content.slice(attr.start, attr.end));
			edits.push([node.start, node.end, `<${[icon, 'data-viewstem-shadcn=""', ...rest].join(' ')} />`]);
			icons.add(icon);
		} else if (node.type === 'Component' || node.type === 'RegularElement' || node.type === 'SvelteElement') {
			// Carousel's Button forwards either an anchor or button DOM event.
			composeHandlers(node, handlers, content, edits, composed, path.startsWith('carousel/'));
			const styleAnchor = node.attributes.find((attr) => attr.name === 'data-slot' || attr.name === 'class');
			if (styleAnchor) edits.push([styleAnchor.start, styleAnchor.start, 'data-viewstem-shadcn="" ']);
		}
	});
	if (handlers && Object.keys(handlers).some((name) => !composed.has(name))) {
		throw new Error(`Expected overridden event handlers in ${filename}`);
	}
	const scripts = [ast.module, ast.instance].filter(Boolean);
	for (const script of scripts) {
		for (const statement of script.content.body) {
			if (statement.type !== 'ImportDeclaration' || statement.specifiers[0]?.local.name !== 'IconPlaceholder') continue;
			const imports = [...icons].map((icon) => `import ${icon} from "@lucide/svelte/icons/${lucidePath(icon)}";`);
			edits.push([statement.start, statement.end, imports.join('\n\t')]);
		}
	}
	for (const [start, end, replacement] of edits.sort(([a], [b]) => b - a)) {
		content = content.slice(0, start) + replacement + content.slice(end);
	}
	return content;
}

for (const [path, json] of Object.entries(archive)) {
	if (!path.startsWith('docs/static/registry/styles/nova/')) continue;
	const item = JSON.parse(json);
	for (const file of item.files) {
		const filename = resolve(vendor, file.type === 'registry:hook' ? `hooks/${file.target}` : file.target);
		if (!filename.startsWith(vendor) || outputs.has(filename)) throw new Error(`Invalid or duplicate target ${filename}`);
		let content = file.content.replace(/(["'])(\$(?:UI|LIB|HOOKS)\$\/|\$UTILS\$)([^"']*)\1/g,
			(_match, quote, alias, tail) => {
				const prefix = { '$UI$/': '', '$LIB$/': '', '$HOOKS$/': 'hooks/', '$UTILS$': 'utils' }[alias];
				return quote + localImport(filename, prefix + tail) + quote;
			});
		if (filename.endsWith('.svelte')) content = transformComponent(content, filename);
		if (filename === resolve(vendor, 'input-otp/input-otp.svelte')) {
			// Bits PinInput sends data props to its input but class to its wrapper.
			// Scope the actual styled wrapper without changing its DOM or behavior.
			content = content.replace('"cn-input-otp flex items-center', '"viewstem-shadcn-root cn-input-otp flex items-center');
		}
		if (filename === resolve(vendor, 'marker/marker.svelte')) {
			// Marker spreads its styled root props instead of spelling class/data-slot
			// on the element. Keep the scope marker in both native and child branches.
			content = content.replace('"data-slot": "marker",', '"data-slot": "marker",\n\t\t"data-viewstem-shadcn": "",');
		}
		for (const family of ['calendar', 'range-calendar']) {
			if (filename === resolve(vendor, family, family + '.svelte')) {
				content = content.replace('<script lang="ts">', `<script lang="ts">
	import { setContext } from "svelte";
	import { calendarPlaceholderContext } from "../../adapters/types.js";`)
					.replace('placeholder = $bindable(),', 'placeholder = $bindable(),\n\t\tonPlaceholderChange,')
					.replace('\n\tbind:placeholder\n', '\n\tbind:placeholder\n\t{onPlaceholderChange}\n')
					.replace('</script>', '\tsetContext(calendarPlaceholderContext, (value: DateValue) => onPlaceholderChange?.(value));\n</script>');
			}
			if (filename === resolve(vendor, family, family + '-caption.svelte')) {
				// The caption handles monthIndex itself, so the primitive's change
				// handler never observes this write to the bound placeholder.
				content = content.replace('<script lang="ts">', `<script lang="ts">
	import { getContext } from "svelte";
	import { calendarPlaceholderContext } from "../../adapters/types.js";`)
					.replace('</script>', '\tconst onPlaceholderChange = getContext<((value: DateValue) => void) | undefined>(calendarPlaceholderContext);\n</script>')
					.replace('placeholder = newPlaceholder.subtract({ months: monthIndex });',
						'const adjusted = newPlaceholder.subtract({ months: monthIndex });\n\t\t\tif (adjusted.compare(placeholder) === 0) return;\n\t\t\tplaceholder = adjusted;\n\t\t\tonPlaceholderChange?.(adjusted);');
			}
		}
		if (filename === resolve(vendor, 'navigation-menu/navigation-menu.svelte')) {
			// The JSON root can supply its own viewport while keeping viewport styling enabled.
			content = content.replace('<script lang="ts">', `<script lang="ts">
	import { getContext } from "svelte";
	import { navigationViewportContext } from "../../adapters/types.js";`)
				.replace('</script>', `
	const hasExplicitViewport = getContext<(() => boolean) | undefined>(navigationViewportContext);
</script>`)
				.replace('{#if viewport}', '{#if viewport && !hasExplicitViewport?.()}');
		}
		if (filename === resolve(vendor, 'navigation-menu/navigation-menu-viewport.svelte')) {
			// The primitive measures the first child of the active content. Size the
			// viewport from the whole content and overlay outgoing and incoming panels.
			content = content.replace('relative mt-1.5 w-full overflow-hidden', 'relative mt-1.5 grid w-max max-w-[calc(100vw-2rem)] overflow-hidden')
				.replace('h-[calc(var(--bits-navigation-menu-viewport-height)_+_1rem)] md:w-[calc(var(--bits-navigation-menu-viewport-width)_+_1rem)]',
					'[&>[data-slot=navigation-menu-content]]:static [&>[data-slot=navigation-menu-content]]:[grid-area:1/1]');
		}
		if (filename === resolve(vendor, 'dropdown-menu/dropdown-menu-sub-content.svelte')) {
			// Floating UI can leave a horizontal submenu clipped when neither side
			// of a full-width trigger has room. Shift the positioned wrapper in that case.
			content = content.replace('</script>', `
	$effect(() => {
		const wrapper = ref?.parentElement;
		const win = wrapper?.ownerDocument.defaultView;
		if (!wrapper || !win || restProps.avoidCollisions === false) return;

		const keepInViewport = () => {
			const rect = wrapper.getBoundingClientRect();
			const left = rect.left - (Number.parseFloat(wrapper.style.translate) || 0);
			const maxLeft = Math.max(4, wrapper.ownerDocument.documentElement.clientWidth - rect.width - 4);
			const offset = Math.round(Math.max(4, Math.min(left, maxLeft)) - left);
			const translate = offset ? \`\${offset}px\` : "";
			if (wrapper.style.translate !== translate) wrapper.style.translate = translate;
		};
		const position = new MutationObserver(keepInViewport);
		position.observe(wrapper, { attributes: true, attributeFilter: ["style"] });
		const size = new ResizeObserver(keepInViewport);
		size.observe(wrapper);
		win.addEventListener("resize", keepInViewport);
		keepInViewport();
		return () => {
			position.disconnect();
			size.disconnect();
			win.removeEventListener("resize", keepInViewport);
			wrapper.style.removeProperty("translate");
		};
	});
</script>`);
		}
		if (filename === resolve(vendor, 'attachment/attachment-trigger.svelte')) {
			// The default trigger covers the card. Inside Actions it is an inline control.
			content = content.replace('absolute inset-0 z-10 outline-none',
				'absolute inset-0 z-10 outline-none [[data-slot=attachment-actions]>&]:static [[data-slot=attachment-actions]>&]:h-6 [[data-slot=attachment-actions]>&]:shrink-0 [[data-slot=attachment-actions]>&]:rounded-md [[data-slot=attachment-actions]>&]:px-2 [[data-slot=attachment-actions]>&]:whitespace-nowrap [[data-slot=attachment-actions]>&]:hover:bg-muted [[data-slot=attachment-actions]>&]:focus-visible:bg-muted')
				.replace('"data-slot": "attachment-trigger",', '"data-slot": "attachment-trigger",\n\t\t"data-viewstem-shadcn": "",');
		}
		if (filename === resolve(vendor, 'avatar/avatar.svelte')) {
			content = content.replace('<script lang="ts">', `<script lang="ts">
	import { setContext } from "svelte";
	import { avatarSourceContext } from "../../adapters/avatar-context.js";`)
				.replace('loadingStatus = $bindable("loading"),', 'loadingStatus = $bindable("loading"),\n\t\tonLoadingStatusChange,')
				.replace('</script>', `
	let automaticallyLoaded = false;
	setContext(avatarSourceContext, () => {
		if (automaticallyLoaded) {
			automaticallyLoaded = false;
			loadingStatus = "loading";
			onLoadingStatusChange?.("loading");
		}
	});
	function loadingChanged(status: NonNullable<AvatarPrimitive.RootProps["loadingStatus"]>) {
		automaticallyLoaded = status === "loaded";
		onLoadingStatusChange?.(status);
	}
</script>`)
				.replace('bind:loadingStatus', 'bind:loadingStatus\n\tonLoadingStatusChange={loadingChanged}');
		}
		if (filename === resolve(vendor, 'avatar/avatar-image.svelte')) {
			content = content.replace('<script lang="ts">', `<script lang="ts">
	import { getContext } from "svelte";
	import { avatarSourceContext } from "../../adapters/avatar-context.js";`)
				.replace('</script>', `
	const resetLoadedSource = getContext<(() => void) | undefined>(avatarSourceContext);
	let previous: readonly unknown[] | undefined;
	$effect.pre(() => {
		const next = [restProps.src, restProps.crossorigin];
		if (previous && next.some((value, index) => value !== previous![index])) resetLoadedSource?.();
		previous = next;
	});
</script>`);
		}
		if (filename === resolve(vendor, 'carousel/carousel.svelte')) {
			content = content.replace('\t// svelte-ignore state_referenced_locally\n', '')
				.replace('\t\torientation,', '\t\tget orientation() { return orientation; },')
				.replace('\t\toptions: opts,', '\t\tget options() { return opts; },')
				.replace('\t\tplugins,', '\t\tget plugins() { return plugins; },')
				.replace('carouselState.selectedIndex =', 'carouselState.scrollSnaps = carouselState.api.scrollSnapList();\n\t\tcarouselState.selectedIndex =')
				.replace('\t\tcarouselState.scrollSnaps = carouselState.api.scrollSnapList();\n\t\tcarouselState.api.on', '\t\tcarouselState.api.on')
				.replace('carouselState.api.on("select", onSelect);', 'carouselState.api.on("select", onSelect);\n\t\tcarouselState.api.on("reInit", onSelect);')
				.replace('carouselState.api?.off("select", onSelect);', 'carouselState.api?.off("select", onSelect);\n\t\t\tcarouselState.api?.off("reInit", onSelect);');
		}
		if (filename === resolve(vendor, 'button/button.svelte')) {
			// Native buttons suppress activation themselves; the anchor branch
			// needs the same behavior even for a physical or programmatic click.
			content = content.replace('\t\t{...restProps}\n\t>', `\t\t{...restProps}
		onclick={(event) => {
			if (disabled) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			(restProps.onclick as HTMLAnchorAttributes["onclick"])?.(event);
		}}
	>`);
		}
		if (filename === resolve(vendor, 'sonner/sonner.svelte')) {
			content = content.replace('from "svelte-sonner"', 'from "../sonner-runtime/index.js"')
				.replaceAll(/\bSonner\b/g, 'SonnerPrimitive');
		}
		// Default menu color and host typography, equivalent to removing unused CLI markers.
		content = content.replace(/\bcn-(?:menu-target|menu-translucent|font-heading)\b ?/g, '')
			.replaceAll('cn-rtl-flip', 'rtl:-scale-x-100')
			.replace(/\bcn-input-otp\b/g, 'gap-2')
			.replace(/\bcn-toast\b/g, 'rounded-2xl');
		if (/\$(?:lib\/|(?:UI|LIB|HOOKS|UTILS)\$)|\bIconPlaceholder\b|\bcn-[\w-]+/.test(content)) {
			throw new Error(`Unresolved upstream marker in ${filename}`);
		}
		outputs.set(filename, content);
	}
}

const check = process.argv.includes('--check');
const stale = [];
for (const [path, content] of outputs) {
	if (check) {
		if (!existsSync(path) || readFileSync(path, 'utf8') !== content) stale.push(path);
	} else {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	}
}
if (existsSync(vendor)) {
	for (const file of readdirSync(vendor, { recursive: true, withFileTypes: true })) {
		const path = resolve(file.parentPath, file.name);
		// The scoped Sonner runtime has its own source ingestion and verification.
		if (relative(vendor, path).split(/[\\/]/)[0] === 'sonner-runtime') continue;
		if (file.isFile() && !outputs.has(path)) stale.push(path);
	}
}
if (stale.length) throw new Error(`Unexpected or stale vendor files:\n${stale.join('\n')}`);
console.log(`${check ? 'Checked' : 'Generated'} ${outputs.size} files, ${provenance.families.length} Nova families, ${provenance.components} components`);
