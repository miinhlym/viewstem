<script lang="ts">
  import { getContext, onDestroy, untrack } from 'svelte';
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  import { childContext, type ChildBridge, type Definition, type NativeComponent } from './types.js';
  import { committedText, decode, domPayload, encode, mergeChild, sameInputValue, validateInputs } from './values.js';
  import Child from './Child.svelte';

  let { inputs, node, emit, renderSlot, component: Native, definition }: ComponentAdapterProps & {
    component: NativeComponent; definition: Definition;
  } = $props();
  const inherited = getContext<ChildBridge | undefined>(childContext);
  let alive = true;
  let composing = false;
  let draft: string | undefined;
  let compositionInput: unknown;
  let domainDraft: { name: string; value: unknown } | undefined;
  let committedDomain: unknown;
  let committedComplete: string | undefined;
  let compositionValue: string | undefined;
  let acceptedInputs: Record<string, unknown> | undefined;
  let accepted: Record<string, unknown> | undefined;
  let shownText = $state.raw<unknown>(undefined);
  let hasAccepted = $state(false);

  // The cell keeps decoded dates, arrays, and objects outside Svelte's deep proxies.
  class NativeValue {
    readonly value: unknown;
    constructor(value: unknown) { this.value = value; }
  }
  const cells = $state<Record<PropertyKey, NativeValue>>({});
  const nativeProps = new Proxy(Object.create(null) as Record<PropertyKey, unknown>, {
    get: (_, key) => cells[key]?.value,
    has: (_, key) => Object.hasOwn(cells, key),
    ownKeys: () => Reflect.ownKeys(cells),
    getOwnPropertyDescriptor: (_, key) => {
      if (Object.hasOwn(cells, key)) return { enumerable: true, configurable: true, value: cells[key].value };
    },
  });
  onDestroy(() => { alive = false; });

  function send(name: string, value: unknown) {
    // Native callbacks can run while Bits UI is constructing an effect scope.
    // Publish into core after that stack so a projection cannot orphan its cleanup.
    queueMicrotask(() => {
      if (alive && node.status === 'ready') void emit(name, value).catch(() => {});
    });
  }
  function createCallbacks(): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    for (const [name, callback] of Object.entries(definition.callbacks)) {
      props[name] = (event: any) => {
        if (callback.codec === 'dom') {
          if (callback.event === 'submit') event?.preventDefault?.();
          if (callback.event === 'input') {
            if (composing || event?.isComposing) { draft = domPayload(event).value as string | undefined; return; }
            const value = domPayload(event).value;
            if (compositionValue !== undefined && value === compositionValue) { compositionValue = undefined; return; }
            compositionValue = undefined;
          }
          send(callback.event, domPayload(event));
        } else {
          if (definition.id === 'shadcn.InputOtp.Root' && name === 'onComplete') {
            if (composing) return;
            if (committedComplete === event) return;
            committedComplete = event;
          }
          if (name === 'onValueChange' && typeof event === 'string') {
            if (composing) { domainDraft = { name: callback.event, value: event }; return; }
            if (event !== committedComplete) committedComplete = undefined;
            if (committedDomain === event) { committedDomain = undefined; return; }
            committedDomain = undefined;
          }
          send(callback.event, { value: encode(event, callback.codec) });
        }
      };
    }
    // Keep composition local to the native input; only the committed value enters core.
    if (definition.callbacks.oninput?.codec === 'dom') {
      props.oncompositionstart = (event: CompositionEvent) => {
        composing = true; compositionValue = undefined;
        compositionInput = inputs.value; draft = domPayload(event).value as string | undefined;
        domainDraft = undefined; committedDomain = undefined; committedComplete = undefined;
        if (definition.callbacks.oncompositionstart) send(definition.callbacks.oncompositionstart.event, domPayload(event));
      };
      props.oncompositionend = (event: CompositionEvent) => {
        composing = false;
        const payload = domPayload(event);
        compositionValue = typeof payload.value === 'string' ? payload.value : undefined;
        send(definition.callbacks.oninput.event, { ...payload, type: 'input' });
        const domainEvent = domainDraft?.name ?? (definition.id === 'shadcn.InputOtp.Root' ? definition.callbacks.onValueChange.event : undefined);
        if (domainEvent) {
          const value = committedText(definition, inputs, String(payload.value ?? domainDraft?.value ?? ''));
          if (value !== undefined && (domainDraft || value !== String(inputs.value ?? ''))) { committedDomain = value; send(domainEvent, { value }); }
          domainDraft = undefined;
        }
        if (definition.id === 'shadcn.InputOtp.Root') {
          const value = committedText(definition, inputs, String(payload.value ?? ''));
          if (value !== undefined && value.length === inputs.maxlength && String(compositionInput ?? '').length < value.length) {
            committedComplete = value;
            send(definition.callbacks.onComplete.event, { value });
          }
        }
        if (definition.callbacks.oncompositionend) send(definition.callbacks.oncompositionend.event, payload);
      };
    }
    return props;
  }
  const callbacks = createCallbacks();
  const hasDefault = $derived(Boolean(node.slots.default?.length));
  const childTarget = $derived.by(() => {
    if (!node.slots.child?.length) return undefined;
    if (node.slots.child.length !== 1 || !node.slots.child[0].address) throw new Error('The child slot requires exactly one concrete component.');
    return node.slots.child[0].address;
  });

  $effect.pre(() => {
    const current = node;
    const nextInputs = inputs;
    if (current.status === 'ready' && !sameInputValue(acceptedInputs, nextInputs)) {
      validateInputs(definition, nextInputs);
      const previous = acceptedInputs;
      const decoded = Object.fromEntries(Object.entries(definition.props)
        .filter(([name]) => name !== 'text' && Object.hasOwn(nextInputs, name))
        .map(([name, property]) => [
          name,
          previous && Object.hasOwn(previous, name) && sameInputValue(previous[name], nextInputs[name])
            ? accepted?.[name] : decode(nextInputs[name], property.codec),
        ]));
      if (definition.id === 'shadcn.Typography') decoded.text = nextInputs.text;
      acceptedInputs = nextInputs;
      accepted = decoded;
    }
    if (!accepted) return;

    const text = acceptedInputs?.text;
    const props: Record<PropertyKey, unknown> = { ...accepted, ...callbacks };
    if (composing && nextInputs.value === compositionInput && draft !== undefined && definition.props.value) props.value = draft;
    if (current.status !== 'ready' && definition.props.disabled) props.disabled = true;
    if (definition.slots.includes('default') && (hasDefault || text !== undefined)) props.children = content;
    if (childTarget) props.child = child;
    for (const [name, snippet] of Object.entries({ closeIcon, errorIcon, infoIcon, loadingIcon, successIcon, warningIcon, tooltipContent })) {
      if (current.slots[name]?.length) props[name] = snippet;
    }
    const next = mergeChild(inherited && inherited.target === current.address ? inherited.props : undefined, props);
    // A fresh View snapshot can preserve every prop of this component. Publish
    // only changed keys so native effects such as a Portal's target watch stay put.
    untrack(() => {
      for (const key of Reflect.ownKeys(cells)) if (!Object.hasOwn(next, key)) delete cells[key];
      for (const key of Reflect.ownKeys(next)) {
        if (!Object.hasOwn(cells, key) || !Object.is(cells[key].value, next[key])) cells[key] = new NativeValue(next[key]);
      }
      shownText = text;
      hasAccepted = true;
    });
  });
</script>

{#snippet content()}{#if hasDefault}{@render renderSlot('default')}{:else}{shownText ?? ''}{/if}{/snippet}
{#snippet child({ props }: { props: Record<PropertyKey, unknown> })}
  {#if childTarget}<Child target={childTarget} {props}>{@render renderSlot('child')}</Child>{/if}
{/snippet}
{#snippet closeIcon()}{@render renderSlot('closeIcon')}{/snippet}
{#snippet errorIcon()}{@render renderSlot('errorIcon')}{/snippet}
{#snippet infoIcon()}{@render renderSlot('infoIcon')}{/snippet}
{#snippet loadingIcon()}{@render renderSlot('loadingIcon')}{/snippet}
{#snippet successIcon()}{@render renderSlot('successIcon')}{/snippet}
{#snippet warningIcon()}{@render renderSlot('warningIcon')}{/snippet}
{#snippet tooltipContent()}{@render renderSlot('tooltipContent')}{/snippet}

{#if hasAccepted}
  <Native {...nativeProps} />
{/if}
