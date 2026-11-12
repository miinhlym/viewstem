import { createElement, useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { start } from './shared.mjs';

function Host() {
  const target = useRef(null);
  useLayoutEffect(() => start(target.current), []);
  return createElement('div', { ref: target });
}

const root = createRoot(document.querySelector('#host'));
root.render(createElement(Host));
window.fixture.unmount = () => root.unmount();
