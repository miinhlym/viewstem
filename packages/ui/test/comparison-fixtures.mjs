import { samples } from '../../svelte-ui/test/fixtures/samples.mjs';
import support from '../dist/support.json' with { type: 'json' };

const byId = new Map(support.map(entry => [entry.id, entry]));
const families = new Set(support.map(entry => entry.family));

function sharedNode(node) {
  const supported = byId.get(node.componentRef);
  if (!supported) return [];
  const slots = Object.fromEntries(Object.entries(node.slots ?? {})
    .filter(([name]) => Object.hasOwn(supported.slots, name))
    .map(([name, children]) => [name, children.flatMap(sharedNode)]));
  const inputs = Object.fromEntries(Object.entries(node.inputs ?? {}).filter(([name]) => Object.hasOwn(supported.ports, name)));
  const on = Object.fromEntries(Object.entries(node.on ?? {}).filter(([name]) => Object.hasOwn(supported.events, name)));
  if (node.componentRef === 'shadcn.Skeleton' && !inputs.class) inputs.class = 'h-5 w-24';
  return [{ ...node, inputs, slots, on }];
}

export const expandedExamples = new Set([
  'aspect-ratio', 'attachment', 'bubble', 'carousel', 'code-block', 'context-menu',
  'dropdown-menu', 'hover-card', 'input-otp', 'marker', 'menubar', 'message',
  'message-scroller', 'navigation-menu', 'questionnaire', 'resizable', 'scroll-area',
  'select', 'sheet', 'toggle', 'toggle-group', 'trace', 'typography',
]);
const unchanged = new Set(['calendar', 'range-calendar', 'date-picker', 'data-table', 'chart', ...expandedExamples]);
export const examples = samples.filter(sample => families.has(sample.slug)).map(({ slug, title, view }) => {
  if (unchanged.has(slug)) return { slug, title, view };
  const [render] = sharedNode(view.render);
  if (!render) throw new Error(`Missing shared renderer for ${slug}`);
  return { slug, title, view: { ...view, render } };
});
if (new Set(examples.map(example => example.slug)).size !== families.size) {
  throw new Error('Each registered family requires one comparison fixture');
}
