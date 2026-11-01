import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TitleComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { compile, renderCanvas, kinds, registry } from './probe.mjs';
import { assert, equal, fixture } from './scenarios.mjs';
import { StateProbe } from '../t3-state/state-probe.mjs';
import { stateValue } from '../t3-state/ports-probe.mjs';
import { rowsSchema, registerChartComponent, connectChart } from './state-chart-probe.mjs';
echarts.use([LineChart, BarChart, GridComponent, TitleComponent, SVGRenderer]);

function panel(label) {
  const section = document.createElement('section'), title = document.createElement('h2'), element = document.createElement('div');
  title.textContent = label; element.style.cssText = 'width:420px;height:240px;position:relative';
  section.append(title, element); document.querySelector('#gallery').append(section); return element;
}
function createRenderer(engine, label) {
  const element = panel(label);
  if (engine === 'echarts') {
    const chart = echarts.init(element, null, { renderer: 'svg', width: 420, height: 240 });
    return { element, chart, update(plan) { chart.setOption(plan.option, { notMerge: true }); return { data: chart.getOption().series.map(s => s.data) }; } };
  }
  const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 240; element.append(canvas);
  return { element, canvas, update(plan) { return renderCanvas(canvas, plan); } };
}
function linePath(renderer, color = '#ff0000') {
  const paths = [...renderer.element.querySelectorAll('svg path')].filter(p => p.getAttribute('stroke')?.toLowerCase() === color);
  assert(paths.length === 1, `expected one ${color} line path, found ${paths.length}`); return paths[0];
}
async function raster(renderer) {
  if (renderer.canvas) return renderer.canvas;
  const svg = renderer.element.querySelector('svg'); assert(svg, 'missing SVG');
  const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  await img.decode(); const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 240;
  canvas.getContext('2d').drawImage(img, 0, 0); return canvas;
}
function redNear(canvas, [x, y], radius = 2) {
  const image = canvas.getContext('2d').getImageData(Math.max(0, Math.round(x) - radius), Math.max(0, Math.round(y) - radius), radius * 2 + 1, radius * 2 + 1);
  let red = 0; for (let i = 0; i < image.data.length; i += 4) if (image.data[i] > 150 && image.data[i + 1] < 80 && image.data[i + 2] < 80 && image.data[i + 3] > 100) red++;
  return red;
}
function paintedPixels(canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let count = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++; return count;
}

export async function runBrowserScenarios(test) {
  for (const engine of ['canvas', 'echarts']) {
    for (const kind of kinds) await test(`DOM.X01.${engine}.${kind}.actual-render`, async () => {
      equal(echarts.version, '6.1.0');
      const renderer = createRenderer(engine, `${engine} · ${kind}`);
      const plan = compile(fixture(engine, kind)); renderer.update(plan);
      const painted = paintedPixels(await raster(renderer)); assert(painted > 10, 'empty drawing');
      return { kind: plan.kind, xAxis: plan.option.xAxis.type, paintedPixels: painted, echartsVersion: echarts.version,
        dataTransferred: engine === 'echarts' ? renderer.chart.getOption().series.map(s => s.data) : plan.option.series.map(s => s.data) };
    });
    for (const axis of ['value', 'time']) await test(`DOM.X03.${engine}.${axis}.ordered-path`, () => {
      const renderer = createRenderer(engine, `${engine} · LineChart ${axis} order 3→1→1→2`);
      const input = fixture(engine, 'LineChart', { option: { xAxis: { type: axis, min: 0, max: 4 }, yAxis: { min: 0, max: 5 } },
        rows: [ [3, 4], [1, 1], [1, 3], [2, 2] ].map(([x,y]) => ({ seriesId: 'a', x, y })),
        series: { defaults: { lineStyle: { color: '#ff0000', width: 4 }, ...(engine === 'echarts' ? { showSymbol: false } : {}) } } });
      const plan = compile(input), rendered = renderer.update(plan);
      const data = input.rows.map(({ x, y }) => [x,y]); let path, expected;
      if (engine === 'canvas') {
        equal(rendered.trace[0].data, data); path = rendered.trace[0].commands; expected = data.map(rendered.pixel);
        equal(path.map(command => command.slice(1)), expected);
      } else {
        equal(renderer.chart.getOption().series[0].data, data);
        path = linePath(renderer).getAttribute('d');
        expected = data.map(p => renderer.chart.convertToPixel({ seriesIndex: 0 }, p));
        const actual = [...path.matchAll(/[ML]([\d.e+-]+)[ ,]([\d.e+-]+)/gi)].map(match => [Number(match[1]), Number(match[2])]);
        equal(actual.length, expected.length);
        actual.forEach((point, i) => point.forEach((v, j) => assert(Math.abs(v - expected[i][j]) <= 0.2, 'path order/geometry mismatch')));
      }
      return { input: data, path, expectedPixels: expected };
    });
    for (const kind of kinds) await test(`DOM.X04.${engine}.${kind}.live-reorder-id-style`, () => {
      const renderer = createRenderer(engine, `${engine} · ${kind} live stable IDs`), bar = kind === 'BarChart';
      const snapshots = [];
      for (const ids of [['a','b'], ['b','c','a'], ['a'], ['c','a','b']]) {
        const plan = compile(fixture(engine, kind, {
          rows: ids.flatMap((seriesId, i) => [{ seriesId, x: 0, y: i + 1 }, { seriesId, x: 4, y: i + 2 }]),
          series: bar ? { defaults: { itemStyle: { color: '#112233' }, barWidth: 8 }, overrides: { b: { itemStyle: { color: '#ff0000' } } } }
            : { defaults: { lineStyle: { width: 3, color: '#112233' } }, overrides: { b: { lineStyle: { color: '#ff0000' } } } },
        }));
        const out = renderer.update(plan);
        const s = engine === 'echarts' ? renderer.chart.getOption().series : plan.option.series;
        equal(s.map(row => row.id), ids);
        for (const row of s) { equal(row[bar ? 'itemStyle' : 'lineStyle'].color, row.id === 'b' ? '#ff0000' : '#112233'); if (!bar) equal(row.lineStyle.width, 3); }
        if (engine === 'canvas') equal(out.trace.map(row => row.id), ids);
        else if (ids.includes('b')) {
          if (bar) assert([...renderer.element.querySelectorAll('path')].some(p => p.getAttribute('fill') === '#ff0000'));
          else assert(linePath(renderer).getAttribute('stroke-width') === '3');
        }
        snapshots.push(s.map(row => ({ id: row.id, style: row[bar ? 'itemStyle' : 'lineStyle'] })));
      }
      return { snapshots };
    });
    for (const kind of ['LineChart', 'TimeSeries']) for (const connectNulls of [false, true]) await test(`DOM.X07.${engine}.${kind}.${connectNulls}.pixel-gap-zero`, async () => {
      const renderer = createRenderer(engine, `${engine} · ${kind} null ${connectNulls ? 'connected' : 'gap'}`);
      const data = [[0,4],[1,2],[2,null],[3,2],[4,4],[5,0]];
      const input = fixture(engine, kind, { rows: data.map(([x,y]) => ({ seriesId: 'a', x, y })),
        option: { xAxis: { min: 0, max: 5 }, yAxis: { min: -1, max: 5 } },
        series: { defaults: { connectNulls, lineStyle: { color: '#ff0000', width: 4 }, ...(engine === 'echarts' ? { showSymbol: false } : {}) } } });
      const plan = compile(input), rendered = renderer.update(plan);
      const actual = engine === 'echarts' ? renderer.chart.getOption().series[0].data : rendered.trace[0].data;
      equal(actual, data);
      const toPixel = engine === 'echarts' ? point => renderer.chart.convertToPixel({ seriesIndex: 0 }, point) : rendered.pixel;
      const canvas = await raster(renderer), gap = redNear(canvas, toPixel([2,2]));
      assert(connectNulls ? gap > 0 : gap === 0, 'null segment pixel mismatch');
      const zero = redNear(canvas, toPixel([5,0])); assert(zero > 0, 'numeric zero endpoint is missing');
      // Connecting must not add a point at the null position with zero Y.
      equal(redNear(canvas, toPixel([2,0])), 0);
      let path;
      if (engine === 'echarts') {
        path = linePath(renderer).getAttribute('d'); equal((path.match(/M/g) ?? []).length, connectNulls ? 1 : 2);
      } else { path = rendered.trace[0].commands; equal(path.filter(command => command[0] === 'M').length, connectNulls ? 1 : 2); }
      return { dataTransferred: actual, connectNulls, gapPixels: gap, zeroPixels: zero, path };
    });
  }
  await test('DOM.X02.echarts.exercised-option-leaves', async () => {
    const renderer = createRenderer('echarts', 'echarts · title, grid, smooth, symbols');
    const plan = compile(fixture('echarts', 'LineChart', {
      rows: [[0,1],[1,4],[2,1]].map(([x,y]) => ({ seriesId: 'a', x, y })),
      option: { title: { text: 'Supported ECharts subset' }, grid: { left: 45, right: 30, top: 50, bottom: 40 }, xAxis: { type: 'value', min: 0, max: 2 }, yAxis: { min: 0, max: 5 } },
      series: { defaults: { smooth: true, showSymbol: true, symbolSize: 10, connectNulls: false, lineStyle: { color: '#ff0000', width: 5 } } },
    }));
    renderer.update(plan); const option = renderer.chart.getOption(), path = linePath(renderer);
    equal(option.title[0].text, plan.option.title.text); assert(renderer.element.textContent.includes('Supported ECharts subset'));
    for (const key of ['left','right','top','bottom']) equal(option.grid[0][key], plan.option.grid[key]);
    equal(renderer.chart.convertToPixel({ seriesIndex: 0 }, [0,0]).map(Math.round), [45,200]);
    assert(/C/.test(path.getAttribute('d')), 'smooth curve not rendered'); equal(path.getAttribute('stroke-width'), '5');
    equal(option.series[0].symbolSize, 10); equal(option.series[0].showSymbol, true);
    const symbols = [...renderer.element.querySelectorAll('svg path')].filter(p => {
      const bounds = p.getBoundingClientRect(); return Math.abs(bounds.width - 10) <= 0.5 && Math.abs(bounds.height - 10) <= 0.5;
    });
    equal(symbols.length, 3);
    assert(symbols.every(p => Math.abs(p.getBoundingClientRect().width - 10) <= 0.5), 'symbol size not rendered');
    return { title: option.title[0].text, grid: plan.option.grid, path: path.getAttribute('d'), symbols: symbols.length, symbolSize: 10 };
  });
  for (const engine of ['canvas','echarts']) await test(`DOM.X02.${engine}.bar-width-color`, async () => {
    const renderer = createRenderer(engine, `${engine} · BarChart style`);
    const plan = compile(fixture(engine, 'BarChart', { rows: [{ seriesId: 'a', x: 1, y: 2 }, { seriesId: 'a', x: 3, y: 4 }],
      option: { xAxis: { min: 0, max: 4 }, yAxis: { min: 0, max: 5 } }, series: { defaults: { barWidth: 16, itemStyle: { color: '#ff0000' } } } }));
    const rendered = renderer.update(plan), canvas = await raster(renderer);
    const toPixel = engine === 'echarts' ? point => renderer.chart.convertToPixel({ seriesIndex: 0 }, point) : rendered.pixel;
    assert(redNear(canvas, toPixel([1,1])) > 0, 'bar color/body absent');
    if (engine === 'echarts') {
      const bars = [...renderer.element.querySelectorAll('path')].filter(p => p.getAttribute('fill') === '#ff0000');
      equal(bars.length, 2); for (const bar of bars) assert(Math.abs(bar.getBoundingClientRect().width - 16) < 0.2);
    } else {
      const center = toPixel([1,1]); assert(redNear(canvas, [center[0]+7,center[1]], 0) > 0); equal(redNear(canvas, [center[0]+9,center[1]], 0), 0);
    }
    return { barWidth: 16, color: '#ff0000', dataTransferred: plan.option.series[0].data };
  });
  for (const engine of ['canvas','echarts']) for (const kind of kinds) await test(`DOM.X01.state.${engine}.${kind}.store-write-render-dispose`, async () => {
    const store = new StateProbe(), service = store.scope(), registration = registry();
    const source = [[0,1],[1,null],[2,0],[3,1]].map(([x,y]) => ({ seriesId: 'a', x, y }));
    const data = service.register('rows', { schema: rowsSchema, initial: source });
    const descriptor = registerChartComponent(registration, `${engine}.${kind}`, { engine, kind, store });
    const renderer = createRenderer(engine, `${engine} · ${kind} State write → render`), bar = kind === 'BarChart';
    const series = bar ? { defaults: { barWidth: 12, itemStyle: { color: '#ff0000' } } }
      : { defaults: { connectNulls: false, lineStyle: { color: '#ff0000', width: 4 }, ...(engine === 'echarts' ? { showSymbol: false } : {}) } };
    let rendered;
    const binding = connectChart({ descriptor, store, watch: [data],
      inputs: { rows: stateValue(data), sharedData: data, series, option: { xAxis: { min: 0, max: 4 }, yAxis: { min: -1, max: 5 } } },
      render(plan) { rendered = renderer.update(plan); } });
    equal(binding.renders, 1);
    const pixel = p => engine === 'echarts' ? renderer.chart.convertToPixel({ seriesIndex: 0 }, p) : rendered.pixel(p);
    const before = redNear(await raster(renderer), pixel([1,4])); equal(before, 0);
    const firstSnapshot = data.read(), update = source.map(row => ({ ...row, y: row.x === 1 ? 4 : row.y }));
    data.write(update); equal(binding.renders, 2); equal(binding.error, undefined);
    const finalFrame = await raster(renderer), after = redNear(finalFrame, pixel([1,4])); assert(after > 0, 'Store write did not change chart pixels');
    const actualData = engine === 'echarts' ? renderer.chart.getOption().series[0].data : rendered.trace[0].data;
    equal(actualData, [[0,1],[1,4],[2,0],[3,1]]); equal(firstSnapshot[1].y, null); equal(source[1].y, null);
    assert(binding.snapshot().ports.sharedData.address === data.address);
    const snapshotBeforeDispose = JSON.stringify(actualData), image = document.createElement('img');
    image.src = finalFrame.toDataURL(); image.width = 420; image.height = 240;
    binding.dispose();
    // Simulate renderer removal while preserving the service-owned Store cell.
    if (renderer.chart) renderer.chart.dispose(); else renderer.canvas.remove();
    renderer.element.append(image); renderer.element.previousElementSibling.textContent += ' · captured before dispose';
    data.write(source); equal(binding.renders, 2); equal(data.read(), source); equal(store.diagnostics(), []);
    return { sameStateAddress: data.address, renders: binding.renders, beforePixels: before, afterPixels: after,
      dataBeforeDispose: JSON.parse(snapshotBeforeDispose), externalStateAfterDispose: data.read() };
  });
}
