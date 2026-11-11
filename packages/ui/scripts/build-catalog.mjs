import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { components, portNames, eventNames, slotNames } from '../dist/catalog-meta.js';

const upstream = JSON.parse(await readFile(new URL('../../svelte-ui/src/lib/shadcn/support.json', import.meta.url), 'utf8'));
const known = new Map(upstream.components.map(entry => [entry.id, entry]));
const support = [];
for (const [name] of components) {
  const id = 'shadcn.' + name;
  const entry = known.get(id);
  if (entry?.mode !== 'json') throw new Error(`Missing JSON component ${id}`);
  const ports = Object.fromEntries(Object.entries(upstream.properties[entry.propertiesRef] ?? {})
    .filter(([key]) => portNames(name).has(key))
    .map(([key, { schema, required }]) => [key, { kind: 'Value', schema, ...(required && { required }) }]));
  // The UI notifications recipe also exposes the container and dismissal labels.
  if (name === 'Notifications') {
    ports.closeButtonAriaLabel = { kind: 'Value', schema: { type: 'string' } };
    ports.containerAriaLabel = { kind: 'Value', schema: { type: 'string' } };
  }
  const callbacks = Object.values(upstream.callbacks[entry.callbacksRef] ?? {});
  const events = Object.fromEntries(callbacks.filter(callback => eventNames(name).has(callback.event)).map(callback => [
    callback.event,
    { schema: callback.codec === 'dom' ? callback.schema : {
      type: 'object', properties: { value: callback.schema }, required: ['value'], additionalProperties: false,
    } },
  ]));
  const slots = Object.fromEntries(entry.slots.filter(key => slotNames(name).has(key)).map(key => [key, {}]));
  support.push({ id, family: entry.family, ports, slots, events });
}
await writeFile('dist/support.json', JSON.stringify(support) + '\n');
const sharedValues = new Map();
function shared(value) {
  const json = JSON.stringify(value);
  if (!sharedValues.has(json)) sharedValues.set(json, sharedValues.size);
  return `v[${sharedValues.get(json)}]`;
}
function record(value) {
  return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}:${shared(item)}`).join(',')}}`;
}
const entries = support.map(({ id, family, ports, slots, events }) =>
  `{id:${JSON.stringify(id)},family:${JSON.stringify(family)},ports:${record(ports)},slots:${record(slots)},events:${record(events)}}`);
await writeFile('dist/basecoat-contracts.js',
  `const v=[${Array.from(sharedValues.keys()).join(',')}];\nexport const support=[${entries.join(',\n')}];\n`);

const require = createRequire(import.meta.url);
const basecoat = dirname(require.resolve('basecoat-css/package.json'));
const names = ['accordion', 'combobox', 'command', 'drawer', 'popover', 'range', 'select', 'sidebar', 'tabs'];
const scripts = await Promise.all(names.map(async name => {
  const source = await readFile(join(basecoat, 'dist/js', name + '.js'), 'utf8');
  if (name === 'combobox') {
    // In a button-triggered combobox, the search field does not edit the selection.
    const clearOnInput = "filterOptions(state);\n      if (!state.isMultiple) {\n        state.hiddenInput.value = '';";
    if (!source.includes(clearOnInput)) throw new Error('Unexpected Basecoat combobox input handler');
    return source.replace(clearOnInput, clearOnInput.replace('!state.isMultiple', '!state.isMultiple && !state.trigger'));
  }
  if (name === 'select') {
    // Preserve the keyboard/pointer highlight across View projections and
    // keep it until another item is highlighted or the listbox closes.
    const replacements = [
      [
        'const previousValue = elements.input.value;',
        `const previousValue = elements.input.value;
    const previousActive = state.options[state.activeIndex];
    previousActive?.classList.remove('active');
    state.activeIndex = -1;`,
      ],
      [
        "setActiveOption(state, selectedOption ? state.options.indexOf(selectedOption) : -1);\n  };",
        `if (state.trigger.getAttribute('aria-expanded') === 'true') {
      const active = state.options.includes(previousActive) ? previousActive : selectedOption ?? state.options[0];
      setActiveOption(state, state.options.indexOf(active));
    }
  };`,
      ],
      [
        "if (!['ArrowDown', 'ArrowUp', 'Enter', 'Home', 'End', 'Escape'].includes(event.key)) return;",
        `if (event.key === 'Tab' && isPopoverOpen) {
      root.close(false);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Home', 'End', 'Escape'].includes(event.key)) return;`,
      ],
      ['root.open();\n      }', 'root.open(event.key);\n      }'],
      ['root.open = () => {', 'root.open = (key) => {'],
      [
        `if (selectedOption) {
        setActiveOption(state, state.options.indexOf(selectedOption));
        scrollOptionIntoListbox(state, selectedOption);
      }`,
        `const active = selectedOption ?? (key === 'ArrowUp' ? state.options.at(-1) : state.options[0]);
      if (active) {
        setActiveOption(state, state.options.indexOf(active));
        scrollOptionIntoListbox(state, active);
      }`,
      ],
      [
        `    const handleListboxMouseleave = () => {
      const selectedOption = state.listbox.querySelector('[role="option"][aria-selected="true"]');
      setActiveOption(state, selectedOption ? state.options.indexOf(selectedOption) : -1);
    };
`,
        '',
      ],
      ["    state.listbox.addEventListener('mouseleave', handleListboxMouseleave);\n", ''],
      ["      state.listbox.removeEventListener('mouseleave', handleListboxMouseleave);\n", ''],
    ];
    return replacements.reduce((script, [before, after]) => {
      if (!script.includes(before)) throw new Error('Unexpected Basecoat select controller');
      return script.replace(before, after);
    }, source);
  }
  if (name === 'command') {
    const refresh = 'container.refresh = () => refreshCommand(container);';
    if (!source.includes(refresh)) throw new Error('Unexpected Basecoat command controller');
    return source.replace(refresh, refresh + `
    container.select = (item) => {
      if (!state.visibleItems.includes(item)) return;
      setActiveItem(state, state.items.indexOf(item));
    };`).replace('delete container.refresh;\n    };', 'delete container.refresh;\n      delete container.select;\n    };');
  }
  return source;
}));
// Upstream controllers capture a local registration object. Viewstem starts and stops
// each controller for its own elements instead of installing the document observer.
await writeFile('dist/basecoat-controllers.js', `// Basecoat MIT. See BASECOAT-LICENSE.md.\nexport function registerControllers(window, document, CustomEvent, getComputedStyle) {\n${scripts.join('\n')}\n}\n`);
