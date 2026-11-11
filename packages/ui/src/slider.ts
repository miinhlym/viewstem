import { connect, machine } from '@zag-js/slider';
import { normalizeProps, spreadProps, VanillaMachine } from '@zag-js/vanilla';
import { uniqueId, type Behavior, type Send } from './behaviors.js';

function finite(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function multiSlider(element: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  const doc = element.ownerDocument;
  const root = doc.createElement('div');
  const control = doc.createElement('div');
  const track = doc.createElement('div');
  const range = doc.createElement('div');
  const id = uniqueId();
  track.append(range);
  control.append(track);
  root.append(control);
  element.append(root);

  const thumbs: HTMLElement[] = [];
  const cleanups = new Map<HTMLElement, () => void>();
  let values: number[] = [];
  let external: string | undefined;
  let labels: string[] = [];
  let description: string | undefined;
  let changed = false;

  const service = new VanillaMachine(machine, {
    id,
    getRootNode: () => element.getRootNode() as Document | ShadowRoot,
    thumbAlignment: 'center',
    onValueChange({ value }) {
      if (signal.aborted) return;
      values = [...value];
      changed = true;
      service.updateProps({ value: values });
      send('valueChange', { value: [...values] });
    },
    onValueChangeEnd({ value }) {
      if (signal.aborted || !changed) return;
      changed = false;
      send('valueCommit', { value: [...value] });
    },
  });

  const apply = (node: HTMLElement, props: Parameters<typeof spreadProps>[1]) =>
    cleanups.set(node, spreadProps(node, props, id));
  function render() {
    if (signal.aborted) return;
    const api = connect(service.service, normalizeProps);
    apply(root, api.getRootProps());
    apply(control, api.getControlProps());
    apply(track, api.getTrackProps());
    apply(range, api.getRangeProps());
    while (thumbs.length > api.value.length) {
      const thumb = thumbs.pop()!;
      cleanups.get(thumb)?.();
      cleanups.delete(thumb);
      thumb.remove();
    }
    api.value.forEach((_, index) => {
      let thumb = thumbs[index];
      if (!thumb) {
        thumb = doc.createElement('div');
        thumbs.push(thumb);
        control.append(thumb);
      }
      apply(thumb, {
        ...api.getThumbProps({ index }),
        'aria-label': labels[index],
        'aria-labelledby': undefined,
        'aria-describedby': description,
      });
    });
  }
  let unsubscribe: (() => void) | undefined;
  return {
    sync(inputs) {
      const min = finite(inputs.min, 0);
      const configuredMax = finite(inputs.max, 100);
      const locked = configuredMax <= min;
      const max = locked ? min + 1 : configuredMax;
      const step = finite(inputs.step, 1);
      const signature = JSON.stringify(inputs.value);
      if (!values.length || signature !== external) {
        const initial = Array.isArray(inputs.value) ? inputs.value : [inputs.value];
        values = initial.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
        if (!values.length) values = [min, locked ? min : max];
        external = signature;
      }
      values = values.map(value => Math.min(locked ? min : max, Math.max(min, value))).sort((a, b) => a - b);
      const label = typeof inputs['aria-label'] === 'string' ? inputs['aria-label'] : '';
      const thumbLabels = Array.isArray(inputs.thumbLabels) ? inputs.thumbLabels : [];
      labels = values.map((_, index) => {
        const name = thumbLabels[index];
        return typeof name === 'string' && name.trim() ? name : label ? `${label} ${index + 1}` : String(index + 1);
      });
      description = typeof inputs['aria-describedby'] === 'string' ? inputs['aria-describedby'] : undefined;
      const dir = inputs.dir === 'rtl' || (inputs.dir !== 'ltr' && element.matches(':dir(rtl)')) ? 'rtl' : 'ltr';
      service.updateProps({ min, max, step: step > 0 ? step : 1, value: values, disabled: locked || inputs.disabled === true, dir });
      if (!unsubscribe) {
        render();
        unsubscribe = service.subscribe(render);
        service.start();
      }
    },
    dispose() {
      unsubscribe?.();
      service.stop();
      for (const cleanup of cleanups.values()) cleanup();
      cleanups.clear();
    },
  };
}
