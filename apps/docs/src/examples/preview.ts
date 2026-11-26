import { createRuntime } from '@viewstem/core';
import { createHttpExecutor } from '@viewstem/core/http';
import { createRenderer } from '@viewstem/dom';
import { ui } from '@viewstem/ui';
import { libraryEndpoint, type ExampleDefinition, type Locale } from './definitions';

export function createExamplePreview(
  target: HTMLElement,
  definition: ExampleDefinition,
  locale: Locale,
  onError: NonNullable<Parameters<ReturnType<typeof createRenderer>['attach']>[2]>['onError'],
) {
  let requestCount = 0;
  const runtime = createRuntime({
    requestExecutor: createHttpExecutor({ transport: async (url, request) => {
      if (!definition.fixture) throw new Error('No example response is configured.');
      const endpoint = libraryEndpoint[definition.fixture];
      if (String(url) !== libraryEndpoint.baseUrl + endpoint.path || request?.method !== endpoint.method) {
        throw new Error('No sample response matches this request.');
      }
      if (definition.fixture === 'reservation') {
        const body: unknown = typeof request.body === 'string' ? JSON.parse(request.body) : null;
        if (body === null || typeof body !== 'object'
          || !('name' in body) || typeof body.name !== 'string'
          || !('slot' in body) || typeof body.slot !== 'string') {
          throw new Error('The sample POST expects a name and a slot.');
        }
        return Response.json({ code: 'LIB-014', name: body.name, slot: body.slot }, { status: 201 });
      }
      const free = 8 - (requestCount++ % 4);
      return Response.json({
        availability: { room: locale === 'ko' ? '열람실' : 'Reading room', free, total: 12 },
        mediaRoom: { room: locale === 'ko' ? '미디어실' : 'Media room', free: 4, total: 6 },
      });
    } }),
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
