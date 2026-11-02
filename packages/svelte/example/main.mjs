import { mount } from 'svelte';
import { transformError } from '@viewstem/svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app'), transformError: transformError });
