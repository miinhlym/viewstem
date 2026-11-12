import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRegistry, createRuntime } from '@viewstem/core';
import { createHttpExecutor } from '@viewstem/core/http';
import { registerShadcn } from '@viewstem/ui';

const content = new URL('../src/content/docs/', import.meta.url);
const badge = { id: 'badge', componentRef: 'shadcn.Badge' };
const render = { render: badge };

function createDocsRegistry(resources = []) {
  const registry = createRegistry();
  registerShadcn(registry);
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
  const { view, initialComplete } = await runtime.createView({ view: { ...render, queries: { project: { query } } } });
  assert.deepEqual((await initialComplete).queryErrors, []);
  const result = view.getQuery('project').getSnapshot();
  assert.equal(result.status, 'success');
  return result.data;
}

const checks = {
  'resources.json': async resources => withRuntime(resources, async runtime => {
    const { view } = await runtime.createView({ view: render });
    assert.equal(await runtime.invokeAction({ owner: view, actionRef: 'status' }), 'draft');
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
    const { view } = await runtime.createView({ view: viewSpec, inputs: { title: 'A', cost: 12 } });
    assert.equal(view.getSnapshot().roots[0].inputs.text, 'Project A costs $12');
  }),
  'repeated-view.json': async viewSpec => withRuntime([], async runtime => {
    const { view } = await runtime.createView({ view: viewSpec });
    const first = view.getSnapshot().roots[0].slots.default;
    assert.deepEqual(first.map(node => node.inputs.text), ['Open']);
    const template = viewSpec.render.slots.default[0];
    template.repeat.items.reverse();
    await view.update(viewSpec);
    const reordered = view.getSnapshot().roots[0].slots.default;
    assert.equal(reordered[0].generation, first[0].generation);
  }),
  'derived-view.json': async viewSpec => withRuntime([], async runtime => {
    const { view } = await runtime.createView({ view: viewSpec });
    assert.equal(view.getSnapshot().roots[0].inputs.text, 'Selected');
    view.getState('items').write([]);
    assert.deepEqual(view.getSnapshot().roots, []);
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
    const { view } = await runtime.createView({ view: render });
    const invoke = project => runtime.invokeAction({ owner: view, actionRef: action.id, inputs: { project } });
    assert.equal(await invoke('A'), 'Project A');
    await assert.rejects(invoke(''), { code: 'ASSERTION_FAILED', message: 'Project is required' });
  }),
  'project-type.json': async type => withRuntime([type], async runtime => {
    const viewSpec = { ...render, ports: { project: { kind: 'Value', required: true, typeRef: type.id } } };
    const apply = project => runtime.createView({ view: viewSpec, inputs: { project } });
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
        await checks[title](JSON.parse(json));
      } catch (cause) {
        throw new Error(`${locale}/dsl/${file}: ${title}`, { cause });
      }
      checked.push(title);
      console.log(`${locale}/dsl/${file}: ${title} passed`);
    }
  }
  assert.deepEqual(checked.sort(), Object.keys(checks).sort(), locale);
}
