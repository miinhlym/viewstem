import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const packageDir = fileURLToPath(new URL('../', import.meta.url));
const inventory = JSON.parse(readFileSync(new URL('../../../docs/handoff/shadcn-component-inventory.json', import.meta.url)));
const families = inventory.catalogItems.filter(({ category }) => category === 'direct-source');
const declarationDir = resolve(packageDir, '.type-cache/vendor');
const barrels = families.map(({ slug }) => resolve(declarationDir, slug, 'index.d.ts'));
const program = ts.createProgram(barrels, {
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	strict: true,
	skipLibCheck: true,
});
const checker = program.getTypeChecker();
const flags = ts.TypeFlags;
const pascal = (slug) => slug.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
const lowerInitial = (name) => name[0].toLowerCase() + name.slice(1);
const dateSchema = { type: 'string' };
const nullSchema = { type: 'null' };
const nullableDateSchema = { type: ['string', 'null'] };
const clearableDateCodecs = new Set(['date', 'dateArray', 'dateOrArray']);
const defined = (type) => (type.isUnion() ? type.types : [type]).filter((member) => !(member.flags & (flags.Undefined | flags.Void | flags.Never)));
const symbolName = (type) => type.aliasSymbol?.getName() ?? type.getSymbol()?.getName();
const localPropType = (owner, symbol) => checker.getTypeOfPropertyOfType(owner, symbol.getName())
	?? checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration ?? symbol.declarations?.[0]);
const sortedEntries = (object) => Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right, 'en')));

function combined(schemas) {
	const distinct = [...new Map(schemas.map((schema) => [JSON.stringify(schema), schema])).values()];
	if (distinct.includes(true)) return true;
	if (distinct.length <= 1) return distinct[0] ?? false;
	if (distinct.every((schema) => Object.hasOwn(schema, 'const'))) {
		return { enum: distinct.map((schema) => schema.const) };
	}
	return { anyOf: distinct };
}

function isDate(type) {
	return ['DateValue', 'CalendarDate', 'CalendarDateTime', 'ZonedDateTime'].includes(symbolName(type))
		&& (type.aliasSymbol ?? type.getSymbol())?.declarations?.some((declaration) =>
			declaration.getSourceFile().fileName.includes('/@internationalized/date/'));
}

function jsonType(type, seen = new Set()) {
	if (isDate(type)) return { schema: dateSchema, codec: 'date' };
	if (symbolName(type) === 'DateRange' && type.aliasSymbol?.declarations?.some((declaration) =>
		declaration.getSourceFile().fileName.includes('/bits-ui/'))) {
		return { schema: { type: 'object', properties: { start: nullableDateSchema, end: nullableDateSchema }, additionalProperties: false }, codec: 'dateRange' };
	}
	if (type.isUnion()) {
		const results = defined(type).map((member) => jsonType(member, seen));
		if (!results.length) return { reason: 'no JSON values' };
		const supported = results.filter(({ reason }) => !reason);
		if (!supported.length) return results[0];
		const codecs = new Set(supported.map(({ codec }) => codec));
		if (codecs.size > 1 && !supported.every(({ schema, codec }) => ['date', 'dateArray'].includes(codec) || schema.type === 'null')) {
			return { reason: 'union requires incompatible JSON conversions' };
		}
		return {
			schema: combined(supported.map(({ schema }) => schema)),
			...((supported.some(({ codec }) => codec) && {
				codec: codecs.has('date') && codecs.has('dateArray') ? 'dateOrArray' : supported.find(({ codec }) => codec).codec,
			})),
			...(supported.length !== results.length && { limitation: 'JSON members only' }),
			...(supported.some(({ uncertain }) => uncertain) && { uncertain: true }),
		};
	}
	if (type.flags & flags.TypeParameter) {
		const constraint = checker.getBaseConstraintOfType(type);
		return constraint ? jsonType(constraint, seen) : { schema: true, uncertain: true };
	}
	if (type.flags & (flags.Any | flags.Unknown)) return { schema: true, uncertain: true };
	if (type.flags & flags.Null) return { schema: { type: 'null' } };
	if (type.flags & flags.StringLiteral) return { schema: { const: type.value } };
	if (type.flags & flags.NumberLiteral) return { schema: { const: type.value } };
	if (type.flags & flags.BooleanLiteral) return { schema: { const: type.intrinsicName === 'true' } };
	if (type.flags & (flags.String | flags.TemplateLiteral | flags.StringMapping)) {
		return { schema: { type: 'string' }, ...(type.flags & (flags.TemplateLiteral | flags.StringMapping) && { limitation: 'template pattern not validated' }) };
	}
	if (type.isIntersection() && type.types.some((member) => member.flags & flags.String)) return { schema: { type: 'string' }, limitation: 'string brand not validated' };
	if (type.flags & flags.Number) return { schema: { type: 'number' } };
	if (type.flags & flags.Boolean) return { schema: { type: 'boolean' } };
	if (!(type.flags & (flags.Object | flags.Intersection))) return { reason: 'non-JSON primitive' };
	if (type.getCallSignatures().length || type.getConstructSignatures().length) return { reason: 'requires host code' };
	if (seen.has(type) || seen.size >= 10) return { reason: 'recursive or deeply nested type' };
	const next = new Set(seen).add(type);
	if (checker.isTupleType(type)) {
		const results = checker.getTypeArguments(type).map((member) => jsonType(member, next));
		if (results.some(({ reason, codec }) => reason || codec)) return { reason: 'tuple requires non-JSON values or nested conversions' };
		if (type.target.elementFlags.some((flag) => flag & (ts.ElementFlags.Rest | ts.ElementFlags.Variadic))) return { reason: 'variadic tuple' };
		return { schema: { type: 'array', ...(results.length && { prefixItems: results.map(({ schema }) => schema) }), minItems: type.target.minLength, maxItems: results.length } };
	}
	if (checker.isArrayType(type)) {
		const items = jsonType(checker.getTypeArguments(type)[0], next);
		if (items.codec === 'date') return { schema: { type: 'array', items: items.schema }, codec: 'dateArray' };
		if (items.reason || items.codec) return { reason: 'array requires non-JSON values or nested conversions' };
		return { schema: { type: 'array', items: items.schema }, ...(items.uncertain && { uncertain: true }) };
	}
	const native = type.getSymbol()?.declarations?.some((declaration) =>
		ts.isClassDeclaration(declaration) || /\/lib\.(?:dom|es\d+.*)\.d\.ts$/.test(declaration.getSourceFile().fileName));
	if (native) return { reason: 'native or class instance' };
	const properties = {};
	const required = [];
	let uncertain = false;
	for (const property of type.getProperties()) {
		const name = property.getName();
		if (name.startsWith('__@')) return { reason: 'symbol-keyed object' };
		const result = jsonType(localPropType(type, property), next);
		if (result.reason || result.codec || result.limitation) return { reason: `object member ${name} requires non-JSON values or a conversion` };
		properties[name] = result.schema;
		if (!(property.flags & ts.SymbolFlags.Optional)) required.push(name);
		uncertain ||= Boolean(result.uncertain);
	}
	let additionalProperties = false;
	for (const index of checker.getIndexInfosOfType(type)) {
		if (!(index.keyType.flags & flags.String)) return { reason: 'non-string record index' };
		const result = jsonType(index.type, next);
		if (result.reason || result.codec || result.limitation) return { reason: 'record values require non-JSON values or a conversion' };
		additionalProperties = result.schema;
		uncertain ||= Boolean(result.uncertain);
	}
	return { schema: { type: 'object', properties: sortedEntries(properties), ...(required.length && { required: required.sort() }), additionalProperties }, ...(uncertain && { uncertain: true }) };
}

const domNames = new Map(Object.entries({
	keydown: 'keyDown', keyup: 'keyUp', keypress: 'keyPress', dblclick: 'doubleClick',
	focusin: 'focusIn', focusout: 'focusOut', beforeinput: 'beforeInput', contextmenu: 'contextMenu',
}));
for (const prefix of ['mouse', 'pointer', 'touch', 'composition', 'drag', 'animation', 'transition']) {
	for (const suffix of ['down', 'up', 'enter', 'leave', 'over', 'out', 'move', 'start', 'end', 'cancel', 'update']) {
		domNames.set(prefix + suffix, prefix + pascal(suffix));
	}
}
const domEvents = new Set([
	'click', 'dblclick', 'contextmenu', 'focus', 'blur', 'focusin', 'focusout', 'keydown', 'keyup',
	'input', 'beforeinput', 'change', 'submit', 'reset', 'pointerdown', 'pointerup', 'pointerenter',
	'pointerleave', 'pointermove', 'pointercancel', 'mouseenter', 'mouseleave', 'mouseover', 'mouseout',
	'mousedown', 'mouseup', 'mousemove', 'scroll', 'wheel', 'load', 'error', 'select', 'paste',
	'compositionstart', 'compositionupdate', 'compositionend', 'touchstart', 'touchmove', 'touchend', 'touchcancel',
]);
const omittedProps = new Set(['ref', 'this', '$$slots', '$$events', '$$legacy']);
const snippets = (type) => defined(type).filter((member) => symbolName(member) === 'Snippet');
const scopedSnippet = (type) => {
	const args = checker.getTypeArguments(type)[0];
	return Boolean(args && (!checker.isTupleType(args) || checker.getTypeArguments(args).length));
};
const domPayload = {
	type: 'object',
	properties: {
		type: { type: 'string' },
		value: { type: 'string' },
		checked: { type: 'boolean' },
		key: { type: 'string' },
		code: { type: 'string' },
		button: { type: 'number' },
		buttons: { type: 'number' },
		altKey: { type: 'boolean' },
		ctrlKey: { type: 'boolean' },
		metaKey: { type: 'boolean' },
		shiftKey: { type: 'boolean' },
	},
	additionalProperties: false,
};
const eventType = (type) => /(?:^|[A-Za-z])Event$/.test(symbolName(type) ?? '')
	&& type.getProperty('preventDefault') && type.getProperty('currentTarget');

function callback(name, signatures) {
	const dom = signatures.every((signature) => {
		const first = signature.parameters[0];
		if (!first) return false;
		const type = checker.getTypeOfSymbolAtLocation(first, signature.declaration);
		return (type.isIntersection() ? type.types : [type]).some(eventType);
	});
	if (dom) {
		if (name.startsWith('on:') || name.endsWith('capture')) return { reason: 'legacy/capture listener' };
		const base = name.slice(2);
		if (base === base.toLowerCase() && !domEvents.has(base)) return { reason: 'DOM event outside policy' };
		return { event: domNames.get(base) ?? lowerInitial(base), schema: domPayload, codec: 'dom' };
	}
	if (signatures.some((signature) => signature.parameters.length > 1)) {
		return { reason: 'callback supplies multiple arguments' };
	}
	const results = signatures.map((signature) => {
		const first = signature.parameters[0];
		if (!first) return { schema: { type: 'null' } };
		const type = checker.getTypeOfSymbolAtLocation(first, signature.declaration);
		const result = jsonType(type);
		const absent = first.flags & ts.SymbolFlags.Optional || (type.isUnion() ? type.types : [type]).some((member) => member.flags & (flags.Undefined | flags.Void));
		if (absent && !result.reason) return { ...result, schema: combined([result.schema, { type: 'null' }]) };
		return result;
	});
	if (results.some(({ reason, limitation }) => reason || limitation)) return { reason: 'callback payload includes non-JSON values' };
	const codecs = new Set(results.map(({ codec }) => codec));
	const dateOrArray = codecs.size === 2 && codecs.has('date') && codecs.has('dateArray');
	if (codecs.size > 1 && !dateOrArray) return { reason: 'callback payload requires incompatible conversions' };
	return {
		event: lowerInitial(name.slice(2)),
		schema: combined(results.map(({ schema }) => schema)),
		...(results[0].codec && { codec: dateOrArray ? 'dateOrArray' : results[0].codec }),
		...(results.some(({ uncertain }) => uncertain) && { uncertain: true }),
	};
}

function componentMetadata(family, item, barrel) {
	const exportName = item.runtimeExports[0];
	const familyName = pascal(family.slug);
	const binding = item.binding.startsWith(familyName) && item.binding !== familyName
		? item.binding.slice(familyName.length)
		: item.binding;
	const id = 'shadcn.' + familyName + (family.componentExports.length === 1 ? '' : '.' + binding);
	const exported = checker.getExportsOfModule(barrel).find((symbol) => symbol.name === exportName);
	if (!exported) throw new Error(`Missing binding ${exportName} for ${id}`);
	const location = exported.declarations?.[0];
	const component = checker.getTypeOfSymbolAtLocation(exported, location);
	const signature = component.getCallSignatures()[0];
	if (!signature || signature.parameters.length < 2) throw new Error(`Missing Svelte component signature for ${id}`);
	const raw = checker.getTypeOfSymbolAtLocation(signature.parameters[1], signature.declaration ?? location);
	const type = checker.getBaseConstraintOfType(raw) ?? raw;
	if (type.flags & (flags.Any | flags.Unknown | flags.TypeParameter)) throw new Error(`Unresolved props type for ${id}`);
	const branches = type.isUnion() ? type.types : [type];
	const props = {};
	const callbacks = {};
	const slots = [];
	const unsupported = {};
	const chartConfig = {
		schema: {
			type: 'object',
			additionalProperties: {
				type: 'object',
				properties: {
					label: { type: 'string' },
					color: { type: 'string' },
					theme: {
						type: 'object',
						properties: { light: { type: 'string' }, dark: { type: 'string' } },
						required: ['light', 'dark'],
						additionalProperties: false,
					},
				},
				not: { required: ['color', 'theme'] },
				additionalProperties: false,
			},
		},
		required: true,
		limitation: 'host icon component omitted',
	};
	const names = new Set(branches.flatMap((branch) => branch.getProperties().map((property) => property.name)));
	for (const name of [...names].sort()) {
		const variants = branches.flatMap((branch) => {
			const property = branch.getProperty(name);
			return property ? [{ property, type: localPropType(branch, property) }] : [];
		});
		if (omittedProps.has(name) || name.startsWith('__@')) {
			unsupported[name] = 'host reference';
		} else if (variants.some(({ type }) => snippets(type).length)) {
			const slot = name === 'children' ? 'default' : name;
			slots.push(slot);
			if (slot !== 'child' && variants.some(({ type }) => snippets(type).some(scopedSnippet))) {
				unsupported[name] = 'scoped snippet arguments require host code';
			}
		} else if (id === 'shadcn.Chart.Container' && name === 'config') {
			props[name] = chartConfig;
		} else if (id === 'shadcn.InputOtp.Root' && name === 'onComplete') {
			// bits-ui 2.20.0 declares (...args: any[]), but PinInput calls it with its string value.
			callbacks[name] = { event: 'complete', schema: { type: 'string' } };
		} else {
			const signatures = variants.flatMap(({ type }) => defined(type).flatMap((member) => member.getCallSignatures()));
			if (/^on[:A-Za-z]/.test(name) && signatures.length) {
				const result = callback(name, signatures);
				if (result.reason) unsupported[name] = result.reason;
				else callbacks[name] = result;
				continue;
			}
			const results = ['class', 'style', 'role', 'autocomplete'].includes(name)
				? [{ schema: { type: 'string' } }]
				: variants.map(({ type }) => jsonType(type));
			const codecs = new Set(results.map(({ codec }) => codec));
			const dateOrArray = codecs.size === 2 && codecs.has('date') && codecs.has('dateArray');
			if (results.some(({ reason }) => reason) || (codecs.size > 1 && !dateOrArray)) {
				unsupported[name] = results.find(({ reason }) => reason)?.reason ?? 'prop requires incompatible conversions';
			} else {
				const required = variants.length === branches.length && variants.every(({ property }) => !(property.flags & ts.SymbolFlags.Optional));
				const codec = dateOrArray ? 'dateOrArray' : results[0].codec;
				const schemas = results.map(({ schema }) => schema);
				if (clearableDateCodecs.has(codec)) schemas.push(nullSchema);
				props[name] = {
					schema: combined(schemas),
					...(required && { required: true }),
					...(codec && { codec }),
					...(results.some(({ uncertain }) => uncertain) && { uncertain: true }),
					...(results.some(({ limitation }) => limitation) && { limitation: 'JSON members only' }),
				};
			}
		}
	}
	const eventNames = new Map();
	for (const name of Object.keys(callbacks)) {
		const event = callbacks[name].event;
		const existing = eventNames.get(event);
		if (!existing) {
			eventNames.set(event, name);
			continue;
		}
		// Prefer the widget callback to the identically named inherited DOM listener.
		const selected = /^on[A-Z]/.test(name) ? name : existing;
		const duplicate = selected === name ? existing : name;
		delete callbacks[duplicate];
		unsupported[duplicate] = `event supplied by ${selected}`;
		eventNames.set(event, selected);
	}
	return { id, family: family.slug, exportName, source: `../vendor/${family.slug}/index.js`, props, callbacks, slots, unsupported };
}

const components = families.flatMap((family, index) => {
	const file = program.getSourceFile(barrels[index]);
	const barrel = file && checker.getSymbolAtLocation(file);
	if (!barrel) throw new Error(`Missing type-cache barrel ${barrels[index]}`);
	return family.componentExports.map((item) => componentMetadata(family, item, barrel));
});
if (components.length !== inventory.counts.directSourceFamilyUniqueComponentExports
	|| new Set(components.map(({ id }) => id)).size !== components.length) {
	throw new Error('Generated catalog does not match the unique component inventory');
}
const path = resolve(packageDir, '.type-cache/catalog.json');
const content = '{\n  "components": [\n' + components.map((component) => '    ' + JSON.stringify(component)).join(',\n') + '\n  ]\n}\n';
if (process.argv.includes('--check')) {
	if (readFileSync(path, 'utf8') !== content) throw new Error('Generated shadcn catalog differs');
} else {
	writeFileSync(path, content);
}
console.log(`Catalog: ${components.length} components`);
