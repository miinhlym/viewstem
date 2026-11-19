import { createRuntime } from '@viewstem/core';
import { createRenderer } from '@viewstem/dom';
import { forms } from '@acme/forms';
import { mount, tick, unmount } from 'svelte';
import SvelteHost from './SvelteHost.svelte';
import '@viewstem/ui/styles.css';
import '@acme/forms/styles.css';

const runtime = createRuntime();
runtime.registry.registerResourceSet(forms);
const errors = [];
const onError = ({ error }) => errors.push(error.message);
const renderer = createRenderer({ runtime, onError });
let screen;
let mirror;
let svelteScreen;

const source = {
  render: { id: 'card', componentRef: 'shadcn.Card.Root', slots: { default: [
    { id: 'official-button', componentRef: 'shadcn.Button', inputs: { text: 'Official button' } },
    { id: 'official-header', componentRef: 'shadcn.Card.Header' },
    { id: 'acme-button', componentRef: 'acme.Button' },
    { id: 'acme-header', componentRef: 'acme.Header' },
    { id: 'acme-input', componentRef: 'acme.Input' },
    { id: 'acme-section', componentRef: 'acme.Section', slots: { default: [
      { id: 'nested-acme-header', componentRef: 'acme.Header' },
      { id: 'nested-official-header', componentRef: 'shadcn.Card.Header' },
      { id: 'nested-official-button', componentRef: 'shadcn.Button', inputs: { text: 'Nested official button' } },
    ] } },
  ] } },
};

window.styleFixture = {
  errors,
  async mountForeignOnly() {
    const foreign = renderer.mount({ target: document.querySelector('#foreign'), source: {
      render: { id: 'button', componentRef: 'acme.Button' },
    } });
    await foreign.whenRendered();
  },
  async mount() {
    screen = renderer.mount({ target: document.querySelector('#mount'), source });
    await screen.whenRendered();
  },
  async mountSvelte() {
    svelteScreen = mount(SvelteHost, { target: document.querySelector('#svelte'), props: {
      source, resourceSets: [forms], onError,
    } });
    await tick();
    await svelteScreen.whenRendered();
  },
  async attachMirror() {
    const target = document.querySelector('#legacy');
    target.setAttribute('data-viewstem-ui', '');
    target.setAttribute('data-theme', 'dark');
    target.style.setProperty('--viewstem-primary', 'rgb(24 79 146)');
    mirror = renderer.attach(await screen.ready, document.querySelector('#mirror'));
    await mirror.whenRendered();
  },
  async detachMirror() { await mirror.detach(); },
  async dispose() {
    await unmount(svelteScreen);
    await renderer.dispose();
    runtime.dispose();
  },
};
