/**
 * Serializes renderer ownership. A newer request supersedes an in-flight mount,
 * but its disposal always completes before the next renderer can start.
 * @param {{mount: (source: string, version: number) => Promise<{dispose: () => Promise<void>}>, pending: (version:number) => void, ready: (version:number) => void, error: (error:unknown, version:number) => void}} hooks
 */
export function createDemoSession(hooks) {
  let version = 0;
  let paused = false;
  let running = false;
  /** @type {{source:string, version:number}|undefined} */
  let pending;
  /** @type {{dispose: () => Promise<void>}|undefined} */
  let active;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (paused || (pending && !timer)) {
        const previous = active;
        active = undefined;
        await previous?.dispose();
        if (paused || timer || !pending) break;
        const request = pending;
        pending = undefined;
        try {
          const next = await hooks.mount(request.source, request.version);
          if (paused || request.version !== version) await next.dispose();
          else { active = next; hooks.ready(request.version); }
        } catch (error) {
          if (!paused && request.version === version) hooks.error(error, request.version);
        }
        if (!pending) break;
      }
    } catch (error) {
      if (!paused) { pending = undefined; hooks.error(error, version); }
    } finally {
      running = false;
    }
  }
  return {
    /** @param {string} source @param {number} [delay] */
    request(source, delay = 0) {
      paused = false;
      pending = { source, version: ++version };
      hooks.pending(version);
      clearTimeout(timer);
      timer = undefined;
      if (delay) timer = setTimeout(() => { timer = undefined; void drain(); }, delay);
      else void drain();
    },
    pause() {
      paused = true;
      version++;
      pending = undefined;
      clearTimeout(timer);
      timer = undefined;
      void drain();
    },
    /** @param {number} candidate */
    isCurrent(candidate) { return !paused && candidate === version; },
  };
}
