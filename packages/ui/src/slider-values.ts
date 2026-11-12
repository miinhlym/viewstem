const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function sliderScale(inputs: Readonly<Record<string, unknown>>) {
  const candidates = Array.isArray(inputs.step)
    ? [...new Set(inputs.step.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)))].sort((a, b) => a - b)
    : [];
  const min = finite(inputs.min, candidates[0] ?? 0);
  const max = finite(inputs.max, candidates.at(-1) ?? 100);
  const steps = candidates.filter(value => min <= value && value <= max);
  const noStops = candidates.length > 0 && steps.length === 0;
  const step = finite(inputs.step, 1);
  return { min, max, step: step > 0 ? step : 1, steps, noStops };
}

export function snapSliderValue(value: number, steps: readonly number[]) {
  let closest = value;
  let distance = Infinity;
  for (const step of steps) {
    const next = Math.abs(value - step);
    if (next >= distance) continue;
    closest = step;
    distance = next;
  }
  return closest;
}

export function sliderKeyValue(event: KeyboardEvent, value: number, steps: readonly number[], rtl: boolean) {
  if (event.key === 'Home') return steps[0];
  if (event.key === 'End') return steps.at(-1);
  const increasing = ['ArrowUp', 'PageUp', rtl ? 'ArrowLeft' : 'ArrowRight'];
  const decreasing = ['ArrowDown', 'PageDown', rtl ? 'ArrowRight' : 'ArrowLeft'];
  if (increasing.includes(event.key)) return (event.metaKey ? steps.at(-1) : steps.find(step => step > value)) ?? value;
  if (decreasing.includes(event.key)) {
    if (event.metaKey) return steps[0];
    for (let index = steps.length - 1; index >= 0; index--) if (steps[index]! < value) return steps[index];
    return value;
  }
  return undefined;
}
