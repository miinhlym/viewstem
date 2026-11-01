// Disposable T4 fixture API, not a proposed public Viewstem SDK or core implementation.
export const kinds = ['LineChart', 'TimeSeries', 'BarChart'];
export class ChartInputError extends Error {
  constructor(path, reason) { super(`${path}: ${reason}`); this.name = 'ChartInputError'; this.path = path; }
}
const fail = (path, reason) => { throw new ChartInputError(path, reason); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const bool = value => typeof value === 'boolean';
const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const text = value => typeof value === 'string';
const axisType = value => ['value', 'time'].includes(value);

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'expected plain object');
  return value;
}
function check(value, schema, path) {
  object(value, path);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !Object.hasOwn(schema, key)) fail(`${path}.${String(key)}`, 'unsupported option');
    const rule = schema[key];
    if (typeof rule === 'function') { if (!rule(value[key])) fail(`${path}.${key}`, 'invalid value'); }
    else check(value[key], rule, `${path}.${key}`);
  }
}
function schemaFor(engine, kind) {
  const line = kind !== 'BarChart';
  const option = { xAxis: { type: axisType, min: finite, max: finite }, yAxis: { min: finite, max: finite } };
  const series = line ? { connectNulls: bool, lineStyle: { color, width: positive } } : { itemStyle: { color }, barWidth: positive };
  if (engine === 'echarts') {
    option.title = { text }; option.grid = { left: finite, right: finite, top: finite, bottom: finite };
    if (line) { series.smooth = bool; series.showSymbol = bool; series.symbolSize = positive; }
  }
  return { option, series };
}
export function validate({ engine, kind, rows, option = {}, series = {} }) {
  if (!['canvas', 'echarts'].includes(engine)) fail('engine', 'unknown engine');
  if (!kinds.includes(kind)) fail('kind', 'unknown chart kind');
  const schema = schemaFor(engine, kind);
  check(option, schema.option, 'option');
  check(series, { defaults: objectRule, overrides: objectRule }, 'series');
  if (Object.hasOwn(series, 'defaults')) check(series.defaults, schema.series, 'series.defaults');
  if (Object.hasOwn(series, 'overrides')) {
    object(series.overrides, 'series.overrides');
    for (const id of Reflect.ownKeys(series.overrides)) {
      if (typeof id !== 'string' || !id.length) fail('series.overrides', 'expected nonempty string IDs');
      check(series.overrides[id], schema.series, `series.overrides.${id}`);
    }
  }
  if (kind === 'TimeSeries' && option.xAxis?.type && option.xAxis.type !== 'time') fail('option.xAxis.type', 'TimeSeries probe requires time axis');
  for (const [axis, values] of Object.entries({ xAxis: option.xAxis, yAxis: option.yAxis })) {
    if (values?.min !== undefined && values?.max !== undefined && values.min >= values.max) fail(`option.${axis}`, 'min must be below max');
  }
  if (!Array.isArray(rows)) fail('rows', 'expected array');
  for (let i = 0; i < rows.length; i++) {
    if (!Object.hasOwn(rows, i)) fail(`rows[${i}]`, 'missing row');
    const row = object(rows[i], `rows[${i}]`);
    if (!Object.hasOwn(row, 'seriesId') || typeof row.seriesId !== 'string' || row.seriesId.length === 0) fail(`rows[${i}].seriesId`, 'expected stable nonempty data ID');
    if (!Object.hasOwn(row, 'x') || !finite(row.x)) fail(`rows[${i}].x`, 'probe accepts finite numeric x/epoch milliseconds only');
    if (!Object.hasOwn(row, 'y') || !(row.y === null || finite(row.y))) fail(`rows[${i}].y`, 'expected finite number or explicit null');
  }
}
const objectRule = value => !!value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

// Clone only validated primitive/nested option values; source input is neither frozen nor mutated.
function merge(base, override) {
  const output = structuredClone(base);
  for (const key of Object.keys(override)) {
    const value = override[key];
    Object.defineProperty(output, key, { enumerable: true, configurable: true, writable: true,
      value: value && typeof value === 'object' ? merge(output[key] ?? {}, value) : value });
  }
  return output;
}
export function compile(input) {
  validate(input);
  const { engine, kind, rows, option = {}, series = {} } = input;
  const grouped = new Map();
  for (const { seriesId, x, y } of rows) {
    if (!grouped.has(seriesId)) grouped.set(seriesId, []);
    grouped.get(seriesId).push([x, y]);
  }
  const runtimeSeries = [...grouped].map(([id, data]) => ({
    ...merge(series.defaults ?? {}, Object.hasOwn(series.overrides ?? {}, id) ? series.overrides[id] : {}),
    id, name: id, type: kind === 'BarChart' ? 'bar' : 'line', data,
  }));
  return { engine, kind, option: {
    ...structuredClone(option),
    animation: false,
    xAxis: { type: kind === 'TimeSeries' ? 'time' : 'value', ...option.xAxis },
    yAxis: { type: 'value', ...option.yAxis },
    series: runtimeSeries,
  } };
}

// Explicitly registered descriptors: no import-time registration, fallback, or shared-ID priority.
export function registry() {
  const entries = new Map();
  return {
    register(id, descriptor) {
      if (entries.has(id)) fail('registration.id', 'duplicate ID');
      if (!kinds.includes(descriptor.kind) || !['canvas', 'echarts'].includes(descriptor.engine)) fail('registration', 'invalid descriptor');
      entries.set(id, { ...descriptor });
    },
    get(id) { return entries.get(id); },
    get size() { return entries.size; },
  };
}
export function simpleWidget(input) { check(input, { label: text }, 'widget'); return input.label; }

export function renderCanvas(canvas, plan) {
  if (plan.engine !== 'canvas') fail('engine', 'wrong renderer');
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  const points = plan.option.series.flatMap(series => series.data);
  const xs = points.map(point => point[0]), ys = points.filter(point => point[1] !== null).map(point => point[1]);
  const extent = (values, axis) => {
    const min = axis.min ?? Math.min(0, ...values), max = axis.max ?? Math.max(1, ...values);
    return [min, max === min ? min + 1 : max];
  };
  const [xmin, xmax] = extent(xs, plan.option.xAxis), [ymin, ymax] = extent(ys, plan.option.yAxis);
  const pixel = ([x, y]) => [30 + (x - xmin) / (xmax - xmin) * (canvas.width - 60), canvas.height - 30 - (y - ymin) / (ymax - ymin) * (canvas.height - 60)];
  const trace = [];
  for (const series of plan.option.series) {
    const commands = []; context.beginPath();
    context.strokeStyle = series.lineStyle?.color ?? '#3366cc'; context.lineWidth = series.lineStyle?.width ?? 3;
    context.fillStyle = series.itemStyle?.color ?? '#3366cc';
    let active = false;
    for (const point of series.data) {
      if (point[1] === null) { if (!series.connectNulls) active = false; continue; }
      const [x, y] = pixel(point);
      if (series.type === 'bar') {
        const zero = pixel([point[0], 0])[1], width = series.barWidth ?? 10;
        context.fillRect(x - width / 2, Math.min(y, zero), width, Math.abs(zero - y)); commands.push(['rect', x, y]);
      } else {
        context[active ? 'lineTo' : 'moveTo'](x, y); commands.push([active ? 'L' : 'M', x, y]); active = true;
      }
    }
    context.stroke(); trace.push({ id: series.id, data: structuredClone(series.data), commands });
  }
  return { trace, pixel };
}
