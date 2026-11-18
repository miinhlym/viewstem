import { createRuntime, defineResourceSet } from '@viewstem/core';
import { createRenderer, DOM_CONNECTOR_ID, type ComponentConnector, type DomComponent, type MountedComponent } from '@viewstem/dom';

const label: DomComponent = { mount({ parent, anchor, node }) {
  const span = parent.ownerDocument.createElement('span');
  span.textContent = String(node.inputs.value);
  parent.insertBefore(span, anchor);
  return { update(next) { span.textContent = String(next.inputs.value); }, setPending(pending) { span.toggleAttribute('aria-busy', pending); },
    dispose() { span.remove(); } };
} };
// @ts-expect-error Mounted components must accept input updates.
const withoutUpdate: MountedComponent = { setPending() {}, dispose() {} };
// @ts-expect-error Mounted components must show pending input state.
const withoutPending: MountedComponent = { update() {}, dispose() {} };
// @ts-expect-error Mounted components must implement cleanup.
const withoutDispose: MountedComponent = { update() {}, setPending() {} };
const external: ComponentConnector = { id: 'external', accepts: value => value === label, mount: (_value, context) => label.mount(context) };
const runtime = createRuntime();
runtime.registry.registerResourceSet(defineResourceSet({ id: 'consumer', version: '1', components: [
  { contract: { kind: 'Component', id: 'Label', spec: { ports: { value: { kind: 'Value', schema: true } } } }, connectorId: DOM_CONNECTOR_ID, implementation: label },
] }));
const renderer = createRenderer({ runtime, connectors: [external] });
const display = renderer.mount({ target: document.body, source: { render: { id: 'title', componentRef: 'Label' } } });
await display.ready;
await display.whenRendered();
