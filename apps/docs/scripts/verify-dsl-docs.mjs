import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRegistry, createRuntime } from '@viewstem/core';
import { createHttpExecutor } from '@viewstem/core/http';
import { ui } from '@viewstem/ui';
import Ajv2020 from 'ajv/dist/2020.js';
import { resourceKinds, resourceSchema } from '../src/lib/resource-schemas.mjs';

const content = new URL('../src/content/docs/', import.meta.url);
const badge = { id: 'badge', componentRef: 'shadcn.Badge' };
const render = { render: badge };
const ajv = new Ajv2020({ strict: false });
const schemas = new Map(resourceKinds.map(kind => [kind, ajv.compile(resourceSchema(kind))]));
const resource = (kind, spec) => ({ kind, id: 'example', spec });

function assertSchema(value) {
  const validate = schemas.get(value.kind);
  assert.ok(validate?.(value), `${value.kind}: ${ajv.errorsText(validate?.errors)}`);
}

// Exercise nested and mutually exclusive forms independently of the Markdown.
const childQuery = { sources: {}, transform: { input: [] } };
const wholeInputs = { '@path': '/ports/notice' };
for (const supported of [
  resource('View', { render: { ...badge, inputs: wholeInputs } }),
  resource('View', { render: { ...badge, inputs: { '@call': 'makeNotice', args: ['Trail open'] } } }),
  resource('Query', { sources: { external: { queryRef: 'registered', inputs: wholeInputs }, internal: { query: childQuery } },
    transform: { input: { '@path': '/sources/external' } } }),
  resource('Component', { slots: { content: { required: true } } }),
  resource('Action', { ports: { count: { kind: 'Value', schema: { type: 'integer' } } }, output: { schema: true } }),
  resource('Type', { schema: { 'x-viewstem-type': 'map', keys: { type: 'string' }, values: { type: 'number' } } }),
  resource('Type', { schema: { enum: [] } }),
]) assertSchema(supported);
createRegistry({ resources: [resource('Type', { schema: { enum: [] } })] });

for (const invalid of [
  resource('View', { render: { ...badge, repeat: { items: [], as: 'item', key: 'item' } } }),
  resource('View', { render: { ...badge, inputs: { '@path': '/ports/notice', text: 'Extra' } } }),
  resource('View', { ports: { input: { kind: 'Value', schema: true, required: true, default: '' } }, render: badge }),
  resource('Query', { ...childQuery, sources: { conflict: { queryRef: 'q', query: childQuery } } }),
  resource('Query', { ...childQuery, sources: { http: { datasourceRef: 'api', request: { method: 'GET', path: '/items', body: {} } } } }),
  resource('Action', { steps: [{ kind: 'If', condition: true }] }),
  resource('Action', { steps: [{ kind: 'Assert', condition: 'true' }] }),
  resource('Type', { schema: { 'x-viewstem-type': 'map', keys: true } }),
]) {
  assert.equal(schemas.get(invalid.kind)(invalid), false, JSON.stringify(invalid));
}
console.log(`Compiled and checked all ${schemas.size} resource JSON Schemas.`);

function createDocsRegistry(resources = []) {
  const registry = createRegistry();
  registry.registerResourceSet(ui);
  return registry.registerResources(resources);
}

async function withRuntime(resources, run, options = {}) {
  const runtime = createRuntime({ registry: createDocsRegistry(resources), ...options });
  try {
    await run(runtime);
  } finally {
    runtime.dispose();
  }
}

async function readQuery(query, runtime) {
  const view = await runtime.createView({ ...render, queries: { project: { query } } });
  assert.deepEqual((await view.whenSettled(view.initial)).queryErrors, []);
  const result = view.getQuery('project').getSnapshot();
  assert.equal(result.status, 'success');
  return result.data;
}

const checks = {
  'view-resource.json': async resource => withRuntime([resource], async runtime => {
    const view = await runtime.createView({ ref: resource.id });
    assert.equal(view.getSnapshot().roots[0].inputs.text, 'Hello');
  }),
  'component-resource.json': async resource => withRuntime([resource], async runtime => {
    const view = await runtime.createView({ render: { id: 'root', componentRef: resource.id } });
    assert.equal(view.getSnapshot().roots[0].children[0].inputs.text, 'Hello');
  }),
  'variable-resource.json': async resource => withRuntime([resource], async runtime => {
    const view = await runtime.createView({ ...render, states: {
      hasItems: { kind: 'Derived', schema: { type: 'boolean' }, variableRef: resource.id, inputs: { items: ['A'] } },
    } });
    assert.equal(view.getState('hasItems').read(), true);
  }),
  'query-resource.json': async resource => withRuntime([resource], async runtime => {
    const view = await runtime.createView({ ...render, queries: { project: { queryRef: resource.id } } });
    assert.deepEqual((await view.whenSettled(view.initial)).queryErrors, []);
    assert.equal(JSON.stringify(view.getQuery('project').getSnapshot().data), '[{"name":"Plan"}]');
  }),
  'datasource-forms.json': async query => {
    const datasource = { kind: 'Datasource', id: 'projects-api', spec: { kind: 'Http', baseUrl: 'https://example.test/api' } };
    const calls = [];
    const requestExecutor = createHttpExecutor({ transport: async (url, init) => {
      calls.push([url.href, init.method]);
      return Response.json([{ name: 'Plan' }]);
    } });
    await withRuntime([datasource, query], async runtime => {
      const view = await runtime.createView({ ...render, queries: { project: { queryRef: query.id } } });
      assert.deepEqual((await view.whenSettled(view.initial)).queryErrors, []);
      assert.equal(JSON.stringify(view.getQuery('project').getSnapshot().data), '{"referenced":[{"name":"Plan"}],"inline":[{"name":"Plan"}]}');
    }, { requestExecutor });
    assert.equal(calls.length, 2);
    assert.ok(calls.every(([url, method]) => url === 'https://example.test/api/projects' && method === 'GET'));
  },
  'datasource-resource.json': async resource => withRuntime([resource], async runtime => {
    assert.equal(runtime.registry.get('Datasource', resource.id).spec.baseUrl, 'https://example.test/api');
  }),
  'action-resource.json': async resource => withRuntime([resource], async runtime => {
    const view = await runtime.createView(render);
    assert.equal(await view.invokeAction({ actionRef: resource.id }), 'draft');
  }),
  'type-resource.json': async resource => withRuntime([resource], async runtime => {
    const view = { ...render, ports: { name: { kind: 'Value', required: true, typeRef: resource.id } } };
    await runtime.createView(view, { inputs: { name: 'Plan' } });
    await assert.rejects(runtime.createView(view, { inputs: { name: '' } }), { code: 'TYPE_MISMATCH' });
  }),
  'resources.json': async resources => withRuntime(resources, async runtime => {
    const view = await runtime.createView(render);
    assert.equal(await view.invokeAction({ actionRef: 'status' }), 'draft');
    assert.equal(runtime.registry.get('Type', 'status').kind, 'Type');
  }),
  'format-title.json': async value => withRuntime([], async runtime => {
    const viewSpec = {
      ports: {
        title: { kind: 'Value', required: true, schema: { type: 'string' } },
        cost: { kind: 'Value', required: true, schema: { type: 'number' } },
      },
      render: { ...badge, inputs: { text: value } },
    };
    const view = await runtime.createView(viewSpec, { inputs: { title: 'A', cost: 12 } });
    assert.equal(view.getSnapshot().roots[0].inputs.text, 'Project A costs $12');
  }),
  'repeated-view.json': async viewSpec => withRuntime([], async runtime => {
    const view = await runtime.createView(viewSpec);
    const first = view.getSnapshot().roots[0].slots.default;
    assert.deepEqual(first.map(node => node.inputs.text), ['Open']);
    const template = viewSpec.render.slots.default[0];
    template.repeat.items.reverse();
    await view.updateDefinition(viewSpec);
    const reordered = view.getSnapshot().roots[0].slots.default;
    assert.equal(reordered[0].generation, first[0].generation);
  }),
  'derived-view.json': async viewSpec => withRuntime([], async runtime => {
    const view = await runtime.createView(viewSpec);
    assert.equal(view.getSnapshot().roots[0].inputs.text, 'Selected');
    view.getState('items').write([]);
    assert.deepEqual(view.getSnapshot().roots, []);
  }),
  'join-modes.json': async query => withRuntime([], async runtime => {
    const step = query.transform.steps[0];
    const expected = {
      inner: '[{"id":"a","projectId":"a","status":"open"}]',
      left: '[{"id":"a","projectId":"a","status":"open"},{"id":"b"}]',
      right: '[{"id":"a","projectId":"a","status":"open"},{"projectId":"c","status":"closed"}]',
    };
    for (const mode of ['inner', 'left', 'right']) {
      step.mode = mode;
      assert.equal(JSON.stringify(await readQuery(query, runtime)), expected[mode]);
    }
    delete step.mode;
    assert.equal(JSON.stringify(await readQuery(query, runtime)), expected.left);
  }),
  'join-query.json': async query => withRuntime([], async runtime => {
    const result = await readQuery(query, runtime);
    assert.equal(JSON.stringify(result), '[{"id":"a","projectId":"a","open":true},{"id":"b"}]');
  }),
  'login-query.json': async query => {
    const expected = [
      ['POST', 'https://example.test/api/login', 'fixture-key'],
      ['GET', 'https://example.test/api/projects?tag=open&tag=active', 'Bearer fixture-token'],
    ];
    const calls = [];
    const requestExecutor = createHttpExecutor({
      authorize: ({ destination }) => new URL(destination).origin === 'https://example.test',
      resolveSecret: reference => {
        assert.equal(reference, 'projects/service-key');
        return 'fixture-key';
      },
      transport: async (url, init) => {
        calls.push([init.method, url.href, init.headers['x-api-key'] ?? init.headers.authorization]);
        return Response.json(init.method === 'POST' ? { accessToken: 'fixture-token' } : [{ id: 'a' }]);
      },
    });
    await withRuntime([], async runtime => {
      const result = await readQuery(query, runtime);
      assert.equal(JSON.stringify(result), '[{"id":"a"}]');
    }, { requestExecutor });
    assert.deepEqual(calls, expected);
  },
  'label-action.json': async action => withRuntime([action], async runtime => {
    const view = await runtime.createView(render);
    const invoke = project => view.invokeAction({ actionRef: action.id, inputs: { project } });
    assert.equal(await invoke('A'), 'Project A');
    await assert.rejects(invoke(''), { code: 'ASSERTION_FAILED', message: 'Project is required' });
  }),
  'project-type.json': async type => withRuntime([type], async runtime => {
    const viewSpec = { ...render, ports: { project: { kind: 'Value', required: true, typeRef: type.id } } };
    const apply = project => runtime.createView(viewSpec, { inputs: { project } });
    await apply({ name: 'Plan', due: '2026-11-05' });
    await assert.rejects(apply({ name: 'Plan', due: '2026-02-30' }), { code: 'TYPE_MISMATCH' });
  }),
};

for (const locale of ['docs', 'ko/docs']) {
  const section = new URL(`${locale}/dsl/`, content);
  const checked = [];
  for (const file of (await readdir(section)).filter(name => name.endsWith('.md'))) {
    const markdown = await readFile(new URL(file, section), 'utf8');
    for (const match of markdown.matchAll(/^\x60{3}json(?: title="([^"]+)")?\n([\s\S]*?)^\x60{3}$/gm)) {
      const [, title, json] = match;
      assert.ok(Object.hasOwn(checks, title), `${locale}/dsl/${file} has an unmapped JSON example: ${title}`);
      try {
        const value = JSON.parse(json);
        if (Array.isArray(value)) value.forEach(assertSchema);
        else if (Object.hasOwn(value, 'spec')) assertSchema(value);
        const inlineKind = { 'repeated-view.json': 'View', 'derived-view.json': 'View', 'join-query.json': 'Query',
          'join-modes.json': 'Query', 'login-query.json': 'Query' }[title];
        if (inlineKind) assertSchema(resource(inlineKind, value));
        await checks[title](value);
      } catch (cause) {
        throw new Error(`${locale}/dsl/${file}: ${title}`, { cause });
      }
      checked.push(title);
      console.log(`${locale}/dsl/${file}: ${title} passed`);
    }
  }
  assert.deepEqual(checked.sort(), Object.keys(checks).sort(), locale);
}
