// Keep existing scenario fixtures focused on engine assertions while exercising
// the shipped Runtime and View. Public contract tests use the new API directly.
import { createRuntime as createPublicRuntime } from '@viewstem/core';

export const createRuntime = runtimeFixture(createPublicRuntime);

export function runtimeFixture(factory) {
  return function createRuntime({ authorize, registry, functions, ...options } = {}) {
    const handles = new WeakMap();
    const originals = new WeakMap();
    const runtime = factory({
      ...(registry ? { registry } : { functions }),
      ...options,
      ...(authorize && { authorize: context => authorize(context.operation === 'update'
        ? { ...context, owner: handles.get(context.owner) ?? context.owner } : context) }),
    });

    function adapt(view) {
      if (handles.has(view)) return handles.get(view);
      const result = {
        ...view,
        async update(spec, options) {
          return { initialComplete: view.whenSettled(await view.updateDefinition(spec, options)) };
        },
        async replace({ view: spec, viewRef, ...options }) {
          return { initialComplete: view.whenSettled(await view.replace(spec ?? { ref: viewRef }, options)) };
        },
      };
      handles.set(view, result);
      originals.set(result, view);
      return result;
    }

    return {
      ...runtime,
      async createView({ view: spec, viewRef, ...options }) {
        const view = await runtime.createView(spec ?? { ref: viewRef }, options);
        return { view: adapt(view), initialComplete: view.whenSettled(view.initial) };
      },
      invokeAction({ owner, ...request }) {
        const view = originals.get(owner);
        if (!view) return Promise.reject({ code: 'CANCELLED' });
        return view.invokeAction(request);
      },
      listResources: kind => runtime.registry.list(kind),
      exportResource: (kind, id) => runtime.registry.exportResource(kind, id),
    };
  };
}
