import { createRenderer } from '@viewstem/svelte';
import { registerComponents, type ComponentSet } from '@viewstem/svelte-ui';
import { shadcn } from '@viewstem/svelte-ui/shadcn';
import { button, components as buttonComponents } from '@viewstem/svelte-ui/shadcn/button';
import { dialog } from '@viewstem/svelte-ui/shadcn/dialog';
import type { ComponentProps } from 'svelte';

const renderer = createRenderer();
const families: readonly ComponentSet[] = shadcn;
const selection: readonly ComponentSet[] = [button, dialog];
registerComponents(renderer, selection);
registerComponents(createRenderer(), families);

const buttonProps: ComponentProps<typeof buttonComponents.Button> = { variant: 'outline', size: 'sm' };
void buttonProps;

// @ts-expect-error The API registers a list of component sets.
registerComponents(renderer, button);
// @ts-expect-error Raw widget exports are Svelte components, not component sets.
registerComponents(renderer, [buttonComponents.Button]);
// @ts-expect-error Arbitrary variants are rejected by the raw component type.
const invalid: ComponentProps<typeof buttonComponents.Button> = { variant: 'missing' };
void invalid;
