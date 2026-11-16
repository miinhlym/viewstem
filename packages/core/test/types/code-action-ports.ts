import { createRegistry } from '@viewstem/core';
import type { CodeActionDefinition, QueryHandle, StateHandle, ValuePort } from '@viewstem/core';

const registry = createRegistry();
const action = { kind: 'Action', id: 'save' } as const;
const title = { kind: 'Value', schema: { type: 'string' } } as const;
const saved = { kind: 'State', schema: { type: 'boolean' } } as const;
const list = { kind: 'Query' } as const;
type Inputs = { title: string; saved: StateHandle<boolean>; list: QueryHandle<string[]>; note?: string };
const ports = {
  title: { ...title, required: true },
  saved: { ...saved, required: true },
  list: { ...list, required: true },
} as const;
const definition = { ...action, spec: { ports } } satisfies CodeActionDefinition<Inputs>;
registry.registerAction<Inputs>(definition, ({ inputs }) => {
  inputs.saved.write(inputs.title.length > 0);
  void inputs.list.getSnapshot().data?.[0]?.toUpperCase();
  void inputs.note?.trim();
});
registry.registerAction(definition, ({ inputs }) => {
  inputs.saved.write(inputs.title.length > 0);
  void inputs.list.getSnapshot();
});
registry.registerAction<{ note?: string }>({ ...action, spec: {} }, () => {});
registry.registerAction<{ title: string | undefined }>({ ...action, spec: { ports: { title: ports.title } } }, () => {});
registry.registerAction<{ title: string }>({
  ...action, spec: { ports: { title: { kind: 'Value', typeRef: 'title', required: true } } },
}, ({ inputs }) => { void inputs.title.trim(); });

// @ts-expect-error required keys require the ports map.
registry.registerAction<Inputs>({ ...action, spec: {} }, () => {});
// @ts-expect-error the map must declare every required key.
registry.registerAction<Inputs>({ ...action, spec: { ports: { title: ports.title, saved: ports.saved } } }, () => {});
// @ts-expect-error a Value default does not guarantee presence.
registry.registerAction<Inputs>({ ...action, spec: { ports: { ...ports, title: { ...title, default: '' } } } }, () => {});
// @ts-expect-error required State must set required: true.
registry.registerAction<Inputs>({ ...action, spec: { ports: { ...ports, saved } } }, () => {});
// @ts-expect-error required Query must set required: true.
registry.registerAction<Inputs>({ ...action, spec: { ports: { ...ports, list } } }, () => {});
// @ts-expect-error a State handle requires a State port.
registry.registerAction<Inputs>({ ...action, spec: { ports: { ...ports, saved: ports.title } } }, () => {});
// @ts-expect-error allowing undefined as a value does not make the key optional.
registry.registerAction<{ title: string | undefined }>({ ...action, spec: {} }, () => {});
// @ts-expect-error a port-map type cannot be used to bypass registration checks.
registry.registerAction<{ title: ValuePort }>({ ...action, spec: {} }, () => {});
// @ts-expect-error open keys cannot all be guaranteed.
registry.registerAction<Record<string, string>>({ ...action, spec: { ports: {} } }, () => {});
// @ts-expect-error a pattern index is open too.
registry.registerAction<{ [key: `title-${string}`]: string }>({ ...action, spec: { ports: {} } }, () => {});
// @ts-expect-error this union has no single required port list.
registry.registerAction<{ title: string } | { id: number }>({ ...action, spec: {} }, () => {});
// @ts-expect-error handler annotations do not declare ports.
registry.registerAction({ ...action, spec: {} }, ({ inputs }: { inputs: { title: string } }) => { void inputs.title; });
// @ts-expect-error unknown Action fields still fail the inferred overload.
registry.registerAction({ ...action, spec: { typo: true } }, () => {});
// @ts-expect-error the inferred output is boolean even without an as const assertion.
registry.registerAction({ ...action, spec: { output: { schema: { type: 'boolean' } } } }, () => 1);

declare const maybePorts: typeof action & { spec: { ports?: { title: typeof ports.title } } };
registry.registerAction(maybePorts, ({ inputs }) => {
  void inputs.title?.trim();
  // @ts-expect-error the port map could have been omitted.
  void inputs.title.trim();
});
declare const maybeEntry: typeof action & { spec: { ports: { title?: typeof ports.title } } };
registry.registerAction(maybeEntry, ({ inputs }) => {
  void inputs.title?.trim();
  // @ts-expect-error the port itself could have been omitted.
  void inputs.title.trim();
});
declare const openPorts: typeof action & { spec: { ports: Record<string, typeof ports.title> } };
registry.registerAction(openPorts, ({ inputs }) => {
  void inputs.missing?.trim();
  // @ts-expect-error an open port map does not guarantee arbitrary keys.
  void inputs.missing.trim();
});
