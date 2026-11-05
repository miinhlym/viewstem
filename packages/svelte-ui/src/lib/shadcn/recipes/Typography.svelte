<script lang="ts">
	import type { Snippet } from 'svelte';

	const variants = {
		h1: 'scroll-m-20 text-4xl font-extrabold tracking-tight text-balance',
		h2: 'mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0',
		h3: 'mt-8 scroll-m-20 text-2xl font-semibold tracking-tight',
		h4: 'scroll-m-20 text-xl font-semibold tracking-tight',
		p: 'leading-7 [&:not(:first-child)]:mt-6',
		blockquote: 'mt-6 border-s-2 ps-6 italic',
		code: 'relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold',
		lead: 'text-xl text-muted-foreground',
		large: 'text-lg font-semibold',
		small: 'text-sm font-medium leading-none',
		muted: 'text-sm text-muted-foreground',
	};
	const elements = {
		h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', p: 'p',
		blockquote: 'blockquote', code: 'code', lead: 'p', large: 'div', small: 'small', muted: 'p',
	} as const;

	let { as, variant = 'p', text, children }: {
		as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'blockquote' | 'code' | 'span' | 'small' | 'strong' | 'em' | 'div';
		variant?: keyof typeof variants;
		text?: string;
		children?: Snippet;
	} = $props();

	const element = $derived(as ?? elements[variant]);
</script>

<svelte:element this={element} data-viewstem-shadcn="" class={variants[variant]}>
	{#if children}{@render children()}{:else}{text ?? ''}{/if}
</svelte:element>
