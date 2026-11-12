import { createRegistry, createRuntime, type HttpResponse } from '@viewstem/core';
import { attach, registerShadcn, type Attachment, type AttachOptions } from '@viewstem/ui';
import { projectsEndpoint, type ExampleDefinition, type Locale } from './definitions';

export function createExamplePreview(
  target: HTMLElement,
  definition: ExampleDefinition,
  locale: Locale,
  onError: NonNullable<AttachOptions['onError']>,
) {
  let requestCount = 0;
  const registry = createRegistry();
  registerShadcn(registry);
  if (definition.resources) registry.registerResources(definition.resources);
  const runtime = createRuntime({
    registry,
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

  let attachment: Attachment | undefined;
  return {
    async run() {
      const mounted = await runtime.createView({ view: definition.view, inputs: definition.inputs });
      attachment = attach(mounted.view, target, { onError });
      const report = await mounted.initialComplete;
      const failure = report.queryErrors[0]?.error ?? mounted.view.getSnapshot().errors[0];
      if (failure) throw new Error(failure.message);
    },
    async dispose() { attachment?.dispose(); runtime.dispose(); },
  };
}
