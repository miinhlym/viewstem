import { mount, unmount } from 'svelte';
import Host from './Host.svelte';

const host = mount(Host, { target: document.querySelector('#host') });
window.fixture.unmount = () => unmount(host);
