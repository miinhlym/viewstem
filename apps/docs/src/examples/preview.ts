import { createRuntime, type HttpResponse } from '@viewstem/core';
import { createRenderer } from '@viewstem/dom';
import { ui } from '@viewstem/ui';
import { projectsEndpoint, type ExampleDefinition, type Locale } from './definitions';

export function createExamplePreview(
  target: HTMLElement,
  definition: ExampleDefinition,
  locale: Locale,
  onError: NonNullable<Parameters<ReturnType<typeof createRenderer>['attach']>[2]>['onError'],
) {
  let requestCount = 0;
  const runtime = createRuntime({
    requestExecutor: ({ datasource, request }): HttpResponse => {
      const method = definition.fixture === 'project-write' ? 'POST' : projectsEndpoint.request.method;
      if (!definition.fixture) throw new Error('No example response is configured.');
      if ((request.baseUrl ?? datasource.baseUrl) !== projectsEndpoint.baseUrl
        || request.method !== method || request.path !== projectsEndpoint.request.path) {
        throw new Error('No sample response matches this request.');
      }
      if (definition.fixture === 'project-write') {
        const body = request.body;
        if (body === null || typeof body !== 'object' || !('title' in body) || typeof body.title !== 'string') {
          throw new Error('The sample POST expects a string title.');
        }
        return { status: 201, headers: {}, body: { title: body.title } };
      }
      const title = locale === 'ko' ? '프로젝트' : 'Projects';
      return { status: 200, headers: {}, body: { title: `${title} ${++requestCount}`, code: 'PRJ' } };
    },
  });
  runtime.registry.registerResourceSet(ui);
  if (definition.resources) runtime.registry.registerResources(definition.resources);
  target.setAttribute('data-viewstem-ui', '');
  const renderer = createRenderer({ runtime });

  return {
    async run() {
      const screen = renderer.mount({ target, source: definition.view, inputs: definition.inputs, onError });
      const view = await screen.ready;
      const report = await screen.whenSettled(view.initial);
      const failure = report.queryErrors[0]?.error ?? view.getSnapshot().errors[0];
      if (failure) throw new Error(failure.message);
    },
    async dispose() { await renderer.dispose(); runtime.dispose(); },
  };
}
