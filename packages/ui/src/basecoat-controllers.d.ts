type Init = (element: HTMLElement) => void;
export interface Controller { init: Init; refresh?: Init }
export function registerControllers(
  window: Pick<Window, 'innerWidth' | 'setTimeout' | 'clearTimeout' | 'matchMedia'> & {
    basecoat: { register(name: string, options: string | Controller, init?: Init): void };
  },
  document: Document,
  CustomEvent: typeof globalThis.CustomEvent,
  getComputedStyle: Window['getComputedStyle'],
): void;
