import { defineResourceSet } from '@viewstem/core';
import { DOM_CONNECTOR_ID } from '@viewstem/dom';
import { createStyleScope } from '@viewstem/dom/styles';
import { ui } from '@viewstem/ui';

const scope = createStyleScope('acme-forms');

function component(id, tag, className, slots) {
  return {
    contract: { kind: 'Component', id, spec: slots ? { slots: { default: {} } } : {} },
    connectorId: DOM_CONNECTOR_ID,
    implementation: {
      mount({ parent, anchor, provideSlot }) {
        const element = tag === 'input'
          ? scope.createElement(parent.ownerDocument, tag)
          : parent.ownerDocument.createElement(tag);
        if (tag !== 'input') scope.mark(element);
        element.dataset.acme = tag;
        if (className) element.className = className;
        if (tag === 'button') element.textContent = 'Acme button';
        parent.insertBefore(element, anchor);
        const withdraw = slots ? provideSlot('default', element) : undefined;
        return { update() {}, setPending() {}, dispose() { withdraw?.(); element.remove(); } };
      },
    },
  };
}

export const forms = defineResourceSet({
  id: 'acme-forms',
  version: '1',
  dependencies: [ui],
  components: [
    component('acme.Button', 'button', 'btn'),
    component('acme.Input', 'input', 'input'),
    component('acme.Header', 'header'),
    component('acme.Section', 'section', 'acme-section', true),
  ],
});
