import { disposeRendererRuntime, prepareOwnedView, rendererView } from './api.mjs';
export { prepareOwnedView } from './api.mjs';
import { error, fail, safeError } from './errors.mjs';
import { createDiagnostic, notifyDiagnostic } from './diagnostics.mjs';
export { createDiagnostic, createPreparationError, createRenderError, notifyDiagnostic } from './diagnostics.mjs';

const targets = new WeakMap();
export function createRenderWaiter(view, render, {
  onError, getErrorListener, deliverDiagnostic, onClose, isOpen = () => true, onRenderFailure,
} = {}) {
  const engine = rendererView(view);
  const settled = new WeakMap();
  let alive = true;
  const waiting = new Set();
  const open = () => alive && engine.alive && isOpen();
  function whileConnected(value, watchApplication = false) {
    const result = Promise.resolve(value);
    if (!open()) { void result.catch(() => {}); return Promise.reject(error('CANCELLED')); }
    return new Promise((resolve, reject) => {
      const remove = () => { waiting.delete(cancel); engine.renderWaiters.delete(cancel); };
      const cancel = cause => { remove(); reject(cause); };
      waiting.add(cancel);
      if (watchApplication) engine.renderWaiters.add(cancel);
      result.then(value => { remove(); resolve(value); }, cause => { remove(); reject(cause); });
    });
  }
  const diagnosticListener = deliverDiagnostic ?? (getErrorListener || onError
    ? diagnostic => notifyDiagnostic(diagnostic, { listener: getErrorListener ? getErrorListener() : onError, isOpen: open })
    : undefined);
  const stopDiagnostic = diagnosticListener ? engine.onDiagnostic(diagnostic => {
    if (open()) diagnosticListener(diagnostic);
  }) : () => {};
  let stopClose = () => {};
  try {
    stopClose = engine.onClose(() => {
      dispose();
      onClose?.();
    });
  } catch (cause) {
    stopDiagnostic();
    throw cause;
  }
  if (diagnosticListener) {
    for (const diagnostic of [...engine.activeDiagnostics()]) {
      if (!open()) break;
      diagnosticListener(diagnostic);
    }
  }
  function dispose() {
    if (!alive) return;
    alive = false;
    for (const cancel of waiting) cancel(error('CANCELLED'));
    stopDiagnostic();
    stopClose();
  }
  async function wait(generation, sequence) {
    if (!open()) fail('CANCELLED');
    await whileConnected(engine.whenProjected(generation, sequence));
    if (!open() || engine.generation !== generation) fail('CANCELLED');
    try {
      const rendering = render();
      if (engine.generation !== generation) {
        void Promise.resolve(rendering).catch(() => {});
        fail('CANCELLED');
      }
      await whileConnected(rendering, true);
    }
    catch (cause) {
      if (!open() || engine.generation !== generation) fail('CANCELLED');
      onRenderFailure?.(cause);
      throw safeError(cause);
    }
    if (!open() || engine.generation !== generation) fail('CANCELLED');
  }
  return {
    async whenRendered() {
      const { generation, requested } = engine.projection();
      await wait(generation, requested);
    },
    async whenSettled(application) {
      if (!open()) fail('CANCELLED');
      const record = engine.applicationRecord(application);
      if (settled.has(application)) return settled.get(application);
      const report = await whileConnected(record.promise);
      await wait(record.generation, record.sequence);
      if (!open()) fail('CANCELLED');
      settled.set(application, report);
      return report;
    },
    dispose,
  };
}

export function createRendererHost(runtime, { ownsRuntime, onError, validateTarget, connect, disposeOwned }) {
  const entries = new Set();
  let disposed;
  let closing = false;

  function entry(target, options) {
    if (closing) fail('CANCELLED');
    const valid = validateTarget(target);
    if (closing) fail('CANCELLED');
    if (!valid) fail('INVALID_DEFINITION', { message: 'The render target must be a connected HTMLElement.' });
    if (targets.has(target)) fail('INVALID_DEFINITION', { message: 'The render target already has a Viewstem connection. Wait for its cleanup before reusing it.' });
    const token = {};
    targets.set(target, token);
    const controller = new AbortController();
    let adapter, waiter, closeView, stopped, preparing, connecting = false, explicitlyClosed = false;
    let initialRenderReported = false;
    let finishConnecting;
    const connected = new Promise(resolve => { finishConnecting = resolve; });
    const isOpen = () => !closing && !stopped && targets.get(target) === token;
    const diagnostics = (diagnostic, open = isOpen) => notifyDiagnostic(diagnostic,
      { listener: onError, isOpen: open }, { listener: options.onError, isOpen: open });
    // Key by the failure value that the adapter reports and later throws.
    const reportedRenderFailures = new WeakSet();
    const isObject = value => value !== null && (typeof value === 'object' || typeof value === 'function');
    const renderError = (cause, nodeId) => {
      const diagnostic = createDiagnostic('render', cause, { nodeId });
      if (isObject(cause)) reportedRenderFailures.add(cause);
      diagnostics(diagnostic);
    };
    function check() {
      if (!isOpen()) fail('CANCELLED');
      const valid = validateTarget(target);
      if (!isOpen()) fail('CANCELLED');
      if (!valid) fail('INVALID_DEFINITION', { message: 'The render target must be a connected HTMLElement.' });
    }
    function start(view) {
      check();
      connecting = true;
      try {
        waiter = createRenderWaiter(view, () => adapter.whenRendered(), {
          deliverDiagnostic: diagnostic => diagnostics(diagnostic),
          onRenderFailure(cause) { initialRenderReported = isObject(cause) && reportedRenderFailures.has(cause); },
          isOpen, onClose: () => { void stop().catch(() => {}); },
        });
        check();
        adapter = connect(view, target, options, renderError);
        check();
      } finally {
        connecting = false;
        finishConnecting();
      }
    }
    function close() {
      explicitlyClosed = true;
      return stop();
    }
    function stop() {
      if (stopped) return stopped;
      let resolve, reject;
      stopped = new Promise((yes, no) => { resolve = yes; reject = no; });
      waiter?.dispose();
      const viewCleanup = closeView?.();
      controller.abort();
      void (async () => {
        try {
          if (connecting) await connected;
          waiter?.dispose();
          const results = await Promise.allSettled([
            viewCleanup, preparing?.catch(() => {}), Promise.resolve().then(() => adapter?.dispose()),
          ]);
          const failed = results.find(result => result.status === 'rejected');
          if (failed) reject(safeError(failed.reason)); else resolve();
        } catch (cause) { reject(safeError(cause)); }
        finally {
          entries.delete(close);
          if (targets.get(target) === token) targets.delete(target);
        }
      })();
      return stopped;
    }
    entries.add(close);
    return {
      start, stop, close, isOpen,
      reportedRenderFailure: failure => initialRenderReported || (isObject(failure) && reportedRenderFailures.has(failure)),
      prepare(source, options) {
        // Publish the internal preparation before reading any host-provided data.
        let resolve, reject;
        preparing = new Promise((yes, no) => { resolve = yes; reject = no; });
        try {
          resolve(prepareOwnedView(runtime, source, options, check)(controller.signal, {
            isOpen, onCreate(close) { closeView = close; },
          }));
        } catch (cause) { reject(cause); }
        return preparing;
      },
      reportFailure(diagnostic) { diagnostics(diagnostic, () => !closing && !explicitlyClosed); },
      whenRendered: () => waiter.whenRendered(),
      whenSettled: application => waiter.whenSettled(application),
    };
  }

  return {
    runtime,
    mount({ target, source, inputs, url, ...options }) {
      const task = entry(target, options);
      let rendered = false;
      const ready = (async () => {
        let phase = 'prepare';
        try {
          const view = await task.prepare(source, { inputs, url });
          phase = 'render';
          task.start(view);
          await task.whenRendered();
          rendered = true;
          return view;
        } catch (cause) {
          const failure = task.isOpen() ? safeError(cause) : error('CANCELLED');
          await task.stop().catch(() => {});
          if (failure.code !== 'CANCELLED' && (phase === 'prepare' || !task.reportedRenderFailure(cause))) {
            task.reportFailure(createDiagnostic(phase, failure));
          }
          throw failure;
        }
      })();
      ready.catch(() => {});
      return {
        ready, unmount: task.close,
        async whenRendered() {
          if (rendered) await task.whenRendered();
          else await ready;
        },
        async whenSettled(application) { if (!rendered) await ready; return task.whenSettled(application); },
      };
    },
    attach(view, target, options = {}) {
      rendererView(view);
      const task = entry(target, options);
      try { task.start(view); }
      catch (cause) { void task.stop().catch(() => {}); throw safeError(cause); }
      return { detach: task.close, whenRendered: task.whenRendered, whenSettled: task.whenSettled };
    },
    dispose() {
      if (disposed) return disposed;
      closing = true;
      let resolve, reject;
      disposed = new Promise((yes, no) => { resolve = yes; reject = no; });
      const cleanup = [];
      if (ownsRuntime) {
        try { cleanup.push(disposeRendererRuntime(runtime)); }
        catch (cause) { cleanup.push(Promise.reject(safeError(cause))); }
      }
      for (const stop of entries) cleanup.push(stop());
      if (disposeOwned) {
        try { cleanup.push(disposeOwned()); }
        catch (cause) { cleanup.push(Promise.reject(safeError(cause))); }
      }
      void Promise.allSettled(cleanup).then(results => {
        const failure = results.find(result => result.status === 'rejected');
        if (failure) reject(failure.reason); else resolve();
      });
      return disposed;
    },
  };
}
