import { connect, machine } from '@zag-js/slider';
import { normalizeProps, spreadProps, VanillaMachine } from '@zag-js/vanilla';
import { uniqueId, type Behavior, type Send } from './behaviors.js';
import { sliderKeyValue, sliderScale, snapSliderValue } from './slider-values.js';

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
  let steps: readonly number[] = [];
  let rtl = false;
  let disabled = false;
  let changed = false;

  const service = new VanillaMachine(machine, {
    id,
    getRootNode: () => {
      const scope = element.getRootNode();
      return scope instanceof doc.defaultView!.ShadowRoot ? scope : doc;
    },
    thumbAlignment: 'center',
    onValueChange({ value }) {
      if (signal.aborted || disabled) return;
      const next = value.map(item => snapSliderValue(item, steps));
      if (next.length === values.length && next.every((item, index) => item === values[index])) return;
      values = next;
      changed = true;
      service.updateProps({ value: values });
      send('valueChange', { value: [...values] });
    },
    onValueChangeEnd() {
      if (signal.aborted || disabled || !changed) return;
      changed = false;
      send('valueCommit', { value: [...values] });
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
    range.hidden = api.value.length === 0;
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
      const props = api.getThumbProps({ index });
      apply(thumb, {
        ...props,
        'aria-label': labels[index],
        'aria-labelledby': undefined,
        'aria-describedby': description,
        ...(steps.length && {
          'aria-valuenow': values[index],
          'aria-valuemin': values[index - 1] ?? steps[0],
          'aria-valuemax': values[index + 1] ?? steps.at(-1),
          onkeydown(event: KeyboardEvent) {
            if (event.defaultPrevented || disabled) return;
            const allowed = steps.filter(step => step >= (values[index - 1] ?? -Infinity) && step <= (values[index + 1] ?? Infinity));
            const next = sliderKeyValue(event, values[index]!, allowed, rtl);
            if (next === undefined) return;
            event.preventDefault();
            if (next === values[index]) return;
            values = values.map((value, at) => index === at ? next : value);
            service.updateProps({ value: values });
            send('valueChange', { value: [...values] });
            send('valueCommit', { value: [...values] });
          },
        }),
      });
    });
  }
  let unsubscribe: (() => void) | undefined;
  return {
    sync(inputs) {
      const { min, max: configuredMax, step, steps: nextSteps, noStops } = sliderScale(inputs);
      steps = nextSteps;
      const locked = configuredMax <= min;
      const max = locked ? min + 1 : configuredMax;
      const signature = JSON.stringify(inputs.value);
      if (!unsubscribe || signature !== external) {
        const initial = Array.isArray(inputs.value) ? inputs.value : [inputs.value];
        values = initial.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
        if (inputs.value === undefined) values = [min, locked ? min : max];
        external = signature;
      }
      values = values.map(value => snapSliderValue(Math.min(locked ? min : max, Math.max(min, value)), steps)).sort((a, b) => a - b);
      const label = typeof inputs['aria-label'] === 'string' ? inputs['aria-label'] : '';
      const thumbLabels = Array.isArray(inputs.thumbLabels) ? inputs.thumbLabels : [];
      labels = values.map((_, index) => {
        const name = thumbLabels[index];
        return typeof name === 'string' && name.trim() ? name : label ? `${label} ${index + 1}` : String(index + 1);
      });
      description = typeof inputs['aria-describedby'] === 'string' ? inputs['aria-describedby'] : undefined;
      rtl = inputs.dir === 'rtl' || (inputs.dir !== 'ltr' && element.matches(':dir(rtl)'));
      disabled = locked || inputs.disabled === true || !values.length || noStops;
      if (disabled) changed = false;
      // Zag handles the drag on a fine linear scale. Only the published values snap to the discrete stops.
      const machineStep = steps.length ? (max - min) / 1e9 : step;
      service.updateProps({ min, max, step: machineStep, value: values, disabled, dir: rtl ? 'rtl' : 'ltr' });
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
