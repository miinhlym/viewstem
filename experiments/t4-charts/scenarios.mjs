import { compile, kinds, registry, simpleWidget, ChartInputError } from './probe.mjs';
import { runStateScenarios } from './state-scenarios.mjs';

export function assert(value, message = 'assertion failed') { if (!value) throw new Error(message); }
export function equal(actual, expected) { assert(JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
export function rejects(run, path) {
  let error; try { run(); } catch (caught) { error = caught; }
  assert(error instanceof ChartInputError && error.path === path, `expected ChartInputError at ${path}, got ${error}`);
}
export const fixture = (engine = 'canvas', kind = 'LineChart', extra = {}) => ({ engine, kind,
  rows: [{ seriesId: 'a', x: 3, y: 4 }, { seriesId: 'a', x: 1, y: 0 }, { seriesId: 'a', x: 1, y: null }, { seriesId: 'a', x: 2, y: -2 }], ...extra });

export async function runScenarios(test) {
  await test('X01.explicit-distinct-registrations', () => {
    const r = registry(); equal(r.size, 0);
    for (const engine of ['canvas', 'echarts']) for (const kind of kinds) r.register(`${engine}.${kind}`, { kind, engine });
    equal(r.size, 6); equal(r.get('canvas.LineChart').kind, 'LineChart'); equal(r.get('canvas.TimeSeries').kind, 'TimeSeries');
    rejects(() => r.register('canvas.LineChart', { engine: 'echarts', kind: 'LineChart' }), 'registration.id');
    equal(compile(fixture('canvas', 'TimeSeries')).option.xAxis.type, 'time');
    rejects(() => compile(fixture('canvas', 'TimeSeries', { option: { xAxis: { type: 'value' } } })), 'option.xAxis.type');
  });
  for (const engine of ['canvas', 'echarts']) {
    for (const [name, config, path] of [
      ['unknown-root', { option: { notAnOption: true } }, 'option.notAnOption'],
      ['unknown-nested', { option: { xAxis: { invisible: true } } }, 'option.xAxis.invisible'],
      ['dataset-injection', { option: { dataset: { source: [] } } }, 'option.dataset'],
      ['axis-data-injection', { option: { xAxis: { data: [] } } }, 'option.xAxis.data'],
      ['transform', { series: { defaults: { transform: {} } } }, 'series.defaults.transform'],
      ['bad-type', { series: { defaults: { connectNulls: 'true' } } }, 'series.defaults.connectNulls'],
      ['bad-color', { series: { defaults: { lineStyle: { color: 'unvalidated-css' } } } }, 'series.defaults.lineStyle.color'],
      ['zero-width', { series: { defaults: { lineStyle: { width: 0 } } } }, 'series.defaults.lineStyle.width'],
      ['line-bar-option', { series: { defaults: { barWidth: 4 } } }, 'series.defaults.barWidth'],
      ['crossed-extent', { option: { xAxis: { min: 3, max: 2 } } }, 'option.xAxis'],
    ]) await test(`X02.${engine}.reject-${name}`, () => rejects(() => compile(fixture(engine, 'LineChart', config)), path));
    for (const axis of ['value', 'time']) await test(`X03.${engine}.${axis}.order-duplicates`, () => {
      const input = fixture(engine, 'LineChart', { option: { xAxis: { type: axis } } });
      equal(compile(input).option.series[0].data, [[3, 4], [1, 0], [1, null], [2, -2]]);
      equal(input.rows.map(row => row.x), [3, 1, 1, 2]);
    });
    for (const kind of kinds) await test(`X04.${engine}.${kind}.stable-id-override-reorder-add-remove`, () => {
      const a = { seriesId: 'a', x: 1, y: 2 }, b = { seriesId: 'b', x: 2, y: 3 }, c = { seriesId: 'c', x: 3, y: 4 };
      const bar = kind === 'BarChart', style = bar ? 'itemStyle' : 'lineStyle';
      const series = bar ? { defaults: { itemStyle: { color: '#112233' }, barWidth: 12 }, overrides: { b: { itemStyle: { color: '#ff0000' } } } }
        : { defaults: { connectNulls: false, lineStyle: { color: '#112233', width: 2 } }, overrides: { b: { connectNulls: true, lineStyle: { color: '#ff0000' } } } };
      for (const rows of [[a, b], [b, c, a], [a, c], [c, a, b]]) {
        const plan = compile(fixture(engine, kind, { rows, series }));
        equal(plan.option.series.map(s => s.id), rows.map(row => row.seriesId));
        for (const s of plan.option.series) {
          equal(s[style].color, s.id === 'b' ? '#ff0000' : '#112233');
          if (bar) equal(s.barWidth, 12); else { equal(s.lineStyle.width, 2); equal(s.connectNulls, s.id === 'b'); }
        }
      }
      const special = JSON.parse(`{"__proto__":{"${style}":{"color":"#00ff00"}}}`);
      equal(compile(fixture(engine, kind, { rows: [{ ...a, seriesId: '__proto__' }], series: { overrides: special } })).option.series[0][style].color, '#00ff00');
    });
    for (const [name, config, path] of [
      ['option-series', { option: { series: [] } }, 'option.series'],
      ['option-series-null', { option: { series: null } }, 'option.series'],
      ['series-data', { series: { data: [] } }, 'series.data'],
      ['defaults-data', { series: { defaults: { data: [] } } }, 'series.defaults.data'],
      ['override-data', { series: { overrides: { a: { data: [] } } } }, 'series.overrides.a.data'],
      ['defaults-id', { series: { defaults: { id: 'replacement' } } }, 'series.defaults.id'],
      ['override-type', { series: { overrides: { a: { type: 'bar' } } } }, 'series.overrides.a.type'],
    ]) await test(`X05.${engine}.reject-${name}`, () => rejects(() => compile(fixture(engine, 'LineChart', config)), path));
    for (const kind of kinds) {
      await test(`X06.${engine}.${kind}.finite-null-zero`, () => {
        const rows = [0, -0, 1.2, -2, Number.MAX_VALUE, Number.MIN_VALUE, null].map((y, x) => ({ seriesId: 'a', x, y }));
        const out = compile(fixture(engine, kind, { rows })).option.series[0].data;
        out.forEach(([, y], i) => assert(Object.is(y, rows[i].y)));
      });
      for (const [name, value] of [['nan', NaN], ['positive-infinity', Infinity], ['negative-infinity', -Infinity], ['numeric-string', '12'], ['boolean', false], ['undefined', undefined], ['object', {}]]) {
        await test(`X06.${engine}.${kind}.reject-${name}`, () => rejects(() => compile(fixture(engine, kind, { rows: [{ seriesId: 'a', x: 0, y: value }] })), 'rows[0].y'));
      }
      await test(`X06.${engine}.${kind}.reject-missing`, () => rejects(() => compile(fixture(engine, kind, { rows: [{ seriesId: 'a', x: 0 }] })), 'rows[0].y'));
      await test(`X06.${engine}.${kind}.reject-inherited-y`, () => rejects(() => compile(fixture(engine, kind, { rows: [Object.create({ y: 1 })] })), 'rows[0]'));
    }
    for (const kind of ['LineChart', 'TimeSeries']) for (const connectNulls of [false, true]) await test(`X07.${engine}.${kind}.${connectNulls}.retains-data`, () => {
      const output = compile(fixture(engine, kind, { series: { defaults: { connectNulls } } }));
      equal(output.option.series[0].data, [[3, 4], [1, 0], [1, null], [2, -2]]);
      equal(output.option.series[0].connectNulls, connectNulls);
      rejects(() => compile(fixture(engine, kind, { rows: [{ seriesId: 'a', x: 1 }], series: { defaults: { connectNulls } } })), 'rows[0].y');
    });
    await test(`X08.${engine}.source-isolation-and-no-global-series-requirement`, () => {
      const input = fixture(engine, 'LineChart', { series: { defaults: { lineStyle: { width: 2 } } } });
      const original = structuredClone(input), output = compile(input);
      output.option.series[0].data[0][1] = 99; output.option.series[0].lineStyle.width = 50;
      equal(input, original); equal(simpleWidget({ label: 'plain widget' }), 'plain widget');
      rejects(() => simpleWidget({ label: 'plain', series: {} }), 'widget.series');
    });
  }
  for (const [name, config, path] of [
    ['title', { option: { title: { text: 'ECharts only' } } }, 'option.title'],
    ['smooth', { series: { defaults: { smooth: true } } }, 'series.defaults.smooth'],
    ['showSymbol', { series: { defaults: { showSymbol: true } } }, 'series.defaults.showSymbol'],
    ['symbolSize', { series: { defaults: { symbolSize: 8 } } }, 'series.defaults.symbolSize'],
    ['grid', { option: { grid: { left: 10 } } }, 'option.grid'],
  ]) await test(`X02.canvas.reject-echarts-${name}-without-fallback`, () => {
    let fallbackCalls = 0;
    const pretendFallback = () => { fallbackCalls++; };
    rejects(() => { const plan = compile(fixture('canvas', 'LineChart', config)); if (plan.engine === 'echarts') pretendFallback(); }, path);
    equal(fallbackCalls, 0);
  });
  for (const engine of ['canvas', 'echarts']) for (const [name, row, path] of [
    ['missing-id', { x: 1, y: 1 }, 'rows[0].seriesId'], ['empty-id', { seriesId: '', x: 1, y: 1 }, 'rows[0].seriesId'],
    ['bad-x', { seriesId: 'a', x: 'date', y: 1 }, 'rows[0].x'],
  ]) await test(`INPUT.${engine}.${name}`, () => rejects(() => compile(fixture(engine, 'LineChart', { rows: [row] })), path));
  await test('ORACLE.mutation-detection', () => {
    const valid = compile(fixture('canvas'));
    const cases = [
      ['sort-input', p => p.option.series[0].data.sort((a, b) => a[0] - b[0]), p => equal(p.option.series[0].data, [[3, 4], [1, 0], [1, null], [2, -2]])],
      ['deduplicate-x', p => { p.option.series[0].data = [...new Map(p.option.series[0].data.map(p => [p[0], p])).values()]; }, p => equal(p.option.series[0].data.length, 4)],
      ['null-to-zero', p => { p.option.series[0].data[2][1] = 0; }, p => equal(p.option.series[0].data[2][1], null)],
      ['runtime-data-replaced', p => { p.option.series[0].data = []; }, p => equal(p.option.series[0].data.length, 4)],
      ['hidden-fallback', p => { p.engine = 'echarts'; }, p => equal(p.engine, 'canvas')],
    ];
    const detected = [];
    for (const [name, mutate, oracle] of cases) {
      const plan = structuredClone(valid); mutate(plan); let failed = false;
      try { oracle(plan); } catch { failed = true; } assert(failed, `${name} not detected`); detected.push(name);
    }
    return { detected };
  });
  await runStateScenarios(test);
}
