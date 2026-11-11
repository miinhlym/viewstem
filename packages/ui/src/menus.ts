import { connect, machine, type Props as MenuProps } from '@zag-js/menu';
import { normalizeProps, spreadProps, VanillaMachine, type Attrs } from '@zag-js/vanilla';
import { uniqueId, type Behavior, type Send } from './behaviors.js';
import { emitFrom, readInputs } from './component-context.js';
import type { Markup } from './dynamic-catalog.js';

type Family = 'DropdownMenu' | 'ContextMenu' | 'Menubar';
const families = ['DropdownMenu', 'ContextMenu', 'Menubar'] as const;
const container = '[data-vs-menu-node]';
const groupPart = /\.(?:RadioGroup|CheckboxGroup)$/;
const component = (element: HTMLElement) => element.dataset.vsComponent ?? '';
const valueOf = (element: HTMLElement) => String(readInputs(element).value ?? '');
type RuntimeProps = Omit<MenuProps, 'closeOnSelect' | 'typeahead' | 'composite' | 'positioning' | 'loopFocus'> & {
  positioning: NonNullable<MenuProps['positioning']>;
  loopFocus: boolean;
};
const machineFor = (props: () => RuntimeProps) => new VanillaMachine(machine, props);
const apiOf = (driver: Driver) => connect(driver.machine.service, normalizeProps);

const parts: Record<string, Markup> = {
  Root: ['div', 'vs-menu-root', { 'data-vs-menu-node': '' }],
  Trigger: ['button', 'vs-menu-trigger'],
  Content: ['div', 'vs-menu-panel'],
  Group: ['div', '', { role: 'group' }],
  GroupHeading: ['div', 'vs-menu-label'],
  Item: ['div', 'vs-menu-item', { role: 'menuitem' }],
  Label: ['div', 'vs-menu-label'],
  Portal: ['div', 'vs-ui-transparent'],
  CheckboxItem: ['div', 'vs-menu-item', { role: 'menuitemcheckbox' }],
  RadioGroup: ['div', '', { role: 'group' }],
  RadioItem: ['div', 'vs-menu-item', { role: 'menuitemradio' }],
  Separator: ['hr', 'vs-menu-separator'],
  Shortcut: ['span', 'vs-menu-shortcut'],
  Sub: ['div', 'vs-ui-transparent', { 'data-vs-menu-node': '' }],
  SubContent: ['div', 'vs-menu-panel vs-menu-sub-panel'],
  SubTrigger: ['div', 'vs-menu-item vs-menu-sub-trigger', { role: 'menuitem' }],
};
export const menuCatalog: Record<string, Markup> = Object.fromEntries(families.flatMap(family =>
  Object.entries(parts).map(([part, markup]) => [family + '.' + part, markup])));
Object.assign(menuCatalog, {
  'DropdownMenu.Root': ['div', 'vs-menu-root vs-dropdown-root', { 'data-vs-menu-node': '' }],
  'DropdownMenu.CheckboxGroup': ['div', '', { role: 'group' }],
  'ContextMenu.Trigger': ['div', 'vs-context-trigger', { tabindex: '0' }],
  'Menubar.Root': ['div', 'vs-menubar', { role: 'menubar' }],
  'Menubar.Menu': ['div', 'vs-ui-transparent', { 'data-vs-menu-node': '' }],
});

export const menuPorts: Record<string, string> = {};
export const menuEvents: Record<string, string> = {};
for (const family of families) {
  for (const part of ['Content', 'SubContent']) {
    menuPorts[family + '.' + part] = 'align alignOffset collisionPadding loop side sideOffset strategy avoidCollisions forceMount';
  }
  for (const part of ['Item', 'CheckboxItem', 'RadioItem', 'SubTrigger']) {
    menuPorts[family + '.' + part] = 'value checked indeterminate closeOnSelect textValue inset variant';
    menuEvents[family + '.' + part] = 'select checkedChange indeterminateChange';
  }
  for (const part of ['Root', 'Sub', 'Menu']) {
    menuPorts[family + '.' + part] = 'open loop value';
    menuEvents[family + '.' + part] = 'openChange openChangeComplete valueChange';
  }
  menuPorts[family + '.RadioGroup'] = 'value';
  menuEvents[family + '.RadioGroup'] = 'valueChange';
}
menuPorts['DropdownMenu.CheckboxGroup'] = 'value';
menuEvents['DropdownMenu.CheckboxGroup'] = 'valueChange';

type Driver = {
  id: string;
  host: HTMLElement;
  trigger: HTMLElement;
  panel: HTMLElement;
  parent: Driver | undefined;
  machine: ReturnType<typeof machineFor>;
  unsubscribe: () => void;
  bindings: Map<HTMLElement, () => void>;
  localSelection: Map<HTMLElement, string | boolean>;
  externalSelection: WeakMap<HTMLElement, string | undefined>;
  items: Map<string, HTMLElement>;
  opened?: boolean;
  openTimer?: number;
};

export function menus(root: HTMLElement, family: Family, send: Send, signal: AbortSignal): Behavior {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const menubar = family === 'Menubar';
  const drivers = new Map<HTMLElement, Driver>();
  const generatedValues = new WeakMap<HTMLElement, string>();
  let activeTop: Driver | undefined;
  let rovingTop: Driver | undefined;
  let queued = false;
  let disposed = false;

  function getValue(item: HTMLElement) {
    const explicit = readInputs(item).value;
    if (typeof explicit === 'string') return explicit;
    let id = generatedValues.get(item);
    if (!id) { id = uniqueId(); generatedValues.set(item, id); }
    return id;
  }

  function owned(owner: HTMLElement, part: string) {
    return Array.from(owner.querySelectorAll<HTMLElement>(`[data-vs-component="${family}.${part}"]`))
      .find(item => item.closest(container) === owner);
  }

  function groupOwner(item: HTMLElement, driver: Driver) {
    const group = item.closest<HTMLElement>('[data-vs-component$=".RadioGroup"], [data-vs-component$=".CheckboxGroup"]');
    return group && group.closest(container) === driver.host ? group : undefined;
  }

  function changed(driver: Driver, open: boolean) {
    if (menubar && !driver.parent) {
      if (open) {
        const before = activeTop;
        activeTop = driver;
        if (before && before !== driver) apiOf(before).setOpen(false);
        send('valueChange', { value: valueOf(driver.host) });
      } else if (activeTop === driver) {
        activeTop = undefined;
        send('valueChange', { value: '' });
      }
    }
    const emit = () => emitFrom(driver.host, 'openChange', { value: open });
    if (driver.parent && !open) queueMicrotask(emit);
    else emit();
  }

  function propsFor(driver: Pick<Driver, 'id' | 'host' | 'panel' | 'parent' | 'items'>): RuntimeProps {
    const inputs = readInputs(driver.host);
    const panel = readInputs(driver.panel);
    const side = String(panel.side ?? (driver.parent || family === 'ContextMenu' ? 'right' : 'bottom'));
    const align = String(panel.align ?? 'start');
    const placement = (align === 'center' ? side : side + '-' + align) as NonNullable<MenuProps['positioning']>['placement'];
    return {
      id: driver.id,
      getRootNode: () => root.getRootNode() as Document | ShadowRoot,
      open: typeof inputs.open === 'boolean' ? inputs.open : undefined,
      dir: (inputs.dir ?? readInputs(root).dir) === 'rtl' ? 'rtl' : 'ltr',
      loopFocus: panel.loop === true,
      positioning: {
        placement,
        strategy: panel.strategy === 'absolute' ? 'absolute' : 'fixed',
        gutter: typeof panel.sideOffset === 'number' ? panel.sideOffset : driver.parent ? 0 : menubar ? 8 : 4,
        shift: typeof panel.alignOffset === 'number' ? panel.alignOffset : driver.parent ? -3 : menubar ? -4 : undefined,
        overflowPadding: typeof panel.collisionPadding === 'number' ? panel.collisionPadding : undefined,
        flip: panel.avoidCollisions !== false,
      },
      onOpenChange: ({ open }) => {
        const current = drivers.get(driver.host);
        if (current) changed(current, open);
      },
      onSelect: ({ value }) => {
        const item = driver.items.get(value);
        if (item) emitFrom(item, 'select', { type: 'menuitemselect' });
      },
    };
  }

  function disposeDriver(driver: Driver) {
    driver.unsubscribe();
    driver.machine.stop();
    win.clearTimeout(driver.openTimer);
    const positioner = driver.panel.parentElement;
    if (positioner?.matches(':popover-open')) positioner.hidePopover();
    for (const cleanup of driver.bindings.values()) cleanup();
    driver.bindings.clear();
  }

  function queuePaint() {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!disposed) paint();
    });
  }

  function checked(driver: Driver, item: HTMLElement, option: 'checkbox' | 'radio') {
    const inputs = readInputs(item);
    const group = groupOwner(item, driver);
    const value = getValue(item);
    const fromGroup = group && readInputs(group).value;
    const owner = option === 'radio' && group ? group : item;
    const external = JSON.stringify(fromGroup ?? inputs.checked);
    if (driver.externalSelection.get(owner) !== external) {
      driver.externalSelection.set(owner, external);
      driver.localSelection.delete(owner);
    }
    const local = driver.localSelection.get(owner);
    if (local !== undefined) return option === 'radio' && group ? local === value : local === true;
    if (Array.isArray(fromGroup)) return fromGroup.includes(value);
    if (typeof fromGroup === 'string') return fromGroup === value;
    if (typeof inputs.checked === 'boolean') return inputs.checked;
    return false;
  }

  function selectOption(driver: Driver, item: HTMLElement, type: 'checkbox' | 'radio', next: boolean) {
    const value = getValue(item);
    const group = groupOwner(item, driver);
    if (type === 'radio' && group) {
      driver.localSelection.set(group, value);
      emitFrom(group, 'valueChange', { value });
    } else {
      driver.localSelection.set(item, next);
      emitFrom(item, 'checkedChange', { value: next });
      if (group) {
        const before = Array.from(driver.items, ([key, child]) => [key, child] as const)
          .filter(([, child]) => groupOwner(child, driver) === group && child.getAttribute('aria-checked') === 'true')
          .map(([key]) => key);
        const after = next ? [...new Set([...before, value])] : before.filter(v => v !== value);
        emitFrom(group, 'valueChange', { value: after });
      }
    }
    queuePaint();
  }

  function paint() {
    for (const driver of drivers.values()) {
      const api = apiOf(driver);
      const bound = new Set<HTMLElement>();
      const bind = (element: HTMLElement, attrs: Attrs) => {
        bound.add(element);
        driver.bindings.set(element, spreadProps(element, attrs, driver.id));
      };
      const trigger = driver.parent
        ? apiOf(driver.parent).getTriggerItemProps(api)
        : family === 'ContextMenu' ? api.getContextTriggerProps() : api.getTriggerProps();
      const disabled = readInputs(driver.trigger).disabled === true;
      bind(driver.trigger, {
        ...trigger,
        'aria-disabled': disabled ? 'true' : undefined,
        ...(family === 'ContextMenu' && !driver.parent ? {
          'aria-haspopup': 'menu',
          'aria-expanded': api.open,
          'aria-controls': api.getContentProps().id,
          onkeydown(event: KeyboardEvent) {
            if (disabled || (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))) return;
            event.preventDefault();
            const rect = driver.trigger.getBoundingClientRect();
            driver.machine.send({ type: 'CONTEXT_MENU', point: { x: rect.left, y: rect.bottom } });
          },
          ...(disabled ? { oncontextmenu: undefined, onpointerdown: undefined } : {}),
        } : {}),
        ...(menubar && !driver.parent ? {
          role: 'menuitem',
          tabIndex: (rovingTop ?? activeTop ?? Array.from(drivers.values()).find(item => !item.parent)) === driver ? 0 : -1,
        } : {}),
      });

      const positioner = driver.panel.parentElement!;
      const content = api.getContentProps();
      bind(positioner, api.getPositionerProps());
      positioner.dataset.vsMenuPositioner = '';
      if (driver.parent && typeof positioner.showPopover === 'function') {
        positioner.setAttribute('popover', 'manual');
        if (api.open && !positioner.matches(':popover-open')) positioner.showPopover();
      }
      bind(driver.panel, {
        ...content,
        hidden: undefined,
        inert: !api.open,
        'aria-hidden': !api.open,
        tabIndex: -1,
      });
      if (driver.opened !== undefined && driver.opened !== api.open) {
        win.clearTimeout(driver.openTimer);
        const parentClosed = driver.parent && !apiOf(driver.parent).open;
        driver.openTimer = win.setTimeout(() => {
          if (!api.open && positioner.matches(':popover-open')) positioner.hidePopover();
          // Closing the parent removes the submenu's presence before its exit completes.
          if (!api.open && (parentClosed || (driver.parent && !apiOf(driver.parent).open))) return;
          emitFrom(driver.host, 'openChangeComplete', { value: api.open });
        }, win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 100);
      }
      driver.opened = api.open;
      driver.items.clear();

      for (const item of driver.panel.querySelectorAll<HTMLElement>('[data-vs-component]')) {
        if (item.closest(container) !== driver.host) continue;
        const name = component(item);
        if (name.endsWith('.Separator')) { bind(item, api.getSeparatorProps()); continue; }
        if (!/\.(?:Item|CheckboxItem|RadioItem)$/.test(name)) continue;
        const inputs = readInputs(item);
        const value = getValue(item);
        driver.items.set(value, item);
        const option = name.endsWith('.CheckboxItem') ? 'checkbox' : name.endsWith('.RadioItem') ? 'radio' : undefined;
        const itemProps = {
          value,
          disabled: inputs.disabled === true,
          valueText: typeof inputs.textValue === 'string' ? inputs.textValue : item.textContent?.trim(),
          closeOnSelect: typeof inputs.closeOnSelect === 'boolean' ? inputs.closeOnSelect : !option,
        };
        const props = option ? api.getOptionItemProps({
          ...itemProps, type: option, checked: checked(driver, item, option),
          onCheckedChange: next => selectOption(driver, item, option, next),
        }) : api.getItemProps(itemProps);
        bind(item, { ...props, tabIndex: -1 });
      }
      for (const [element, cleanup] of driver.bindings) {
        if (bound.has(element)) continue;
        cleanup();
        driver.bindings.delete(element);
      }
    }
    positionSubmenus();
  }

  function positionSubmenus() {
    for (const driver of drivers.values()) {
      const positioner = driver.panel.parentElement;
      if (!driver.parent || !positioner?.matches(':popover-open') || !driver.opened) continue;
      const trigger = driver.trigger.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = driver.panel;
      const availableLeft = trigger.left;
      const availableRight = win.innerWidth - trigger.right;
      const inputs = readInputs(driver.panel);
      const preferLeft = inputs.side === 'left' || (inputs.side !== 'right' && getComputedStyle(root).direction === 'rtl');
      const openLeft = inputs.avoidCollisions === false ? preferLeft :
        preferLeft ? availableLeft >= width || availableRight < width : availableRight < width && availableLeft >= width;
      const offset = Number(inputs.sideOffset ?? 0);
      const align = Number(inputs.alignOffset ?? -3);
      const x = openLeft ? trigger.left - width - offset : trigger.right + offset;
      positioner.style.setProperty('--vs-sub-left', Math.max(4, Math.min(x, win.innerWidth - width - 4)) + 'px');
      positioner.style.setProperty('--vs-sub-top', Math.max(4, Math.min(trigger.top + align, win.innerHeight - height - 4)) + 'px');
      driver.panel.dataset.vsSubSide = openLeft ? 'left' : 'right';
      driver.trigger.dataset.vsSubSide = driver.panel.dataset.vsSubSide;
    }
  }
  win.addEventListener('resize', positionSubmenus, { signal });
  doc.addEventListener('scroll', positionSubmenus, { signal, capture: true });

  root.addEventListener('keydown', event => {
    if (!menubar) return;
    const top = Array.from(drivers.values()).filter(driver => !driver.parent);
    const origin = top.find(driver => driver.trigger.contains(event.target as Node) || driver.panel.contains(event.target as Node));
    if (!origin || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    // Within a submenu, Zag owns horizontal navigation.
    const item = event.target as HTMLElement;
    if (item.closest(container) !== origin.host || event.defaultPrevented) return;
    const index = top.indexOf(origin);
    const rtl = readInputs(root).dir === 'rtl';
    const insidePanel = origin.panel.contains(item);
    if (insidePanel) {
      if (event.key === 'Home' || event.key === 'End') return;
      const focusedId = origin.panel.getAttribute('aria-activedescendant');
      const opensSubmenu = event.key === (rtl ? 'ArrowLeft' : 'ArrowRight') &&
        Array.from(drivers.values()).some(driver => driver.parent === origin && driver.trigger.id === focusedId);
      if (opensSubmenu) return;
    }
    const direction = (event.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1);
    const loop = readInputs(root).loop !== false;
    const offset = loop ? (index + direction + top.length) % top.length : index + direction;
    const next = top[event.key === 'Home' ? 0 : event.key === 'End' ? top.length - 1 : offset];
    if (!next || next === origin) return;
    event.preventDefault();
    rovingTop = next;
    next.trigger.focus({ preventScroll: true });
    if (apiOf(origin).open) apiOf(next).setOpen(true);
    queuePaint();
  }, { signal, capture: true });

  return {
    sync(inputs) {
      const hosts = [...(menubar ? [] : [root]), ...root.querySelectorAll<HTMLElement>(container)];
      for (const [host, driver] of drivers) {
        const isSub = component(host).endsWith('.Sub');
        if (hosts.includes(host) && owned(host, isSub ? 'SubTrigger' : 'Trigger') === driver.trigger &&
          owned(host, isSub ? 'SubContent' : 'Content') === driver.panel) continue;
        if (activeTop === driver) activeTop = undefined;
        if (rovingTop === driver) rovingTop = undefined;
        disposeDriver(driver);
        drivers.delete(host);
      }
      for (const host of hosts) {
        const isSub = component(host).endsWith('.Sub');
        const trigger = owned(host, isSub ? 'SubTrigger' : 'Trigger');
        const panel = owned(host, isSub ? 'SubContent' : 'Content');
        if (!trigger || !panel) continue;
        const driver = drivers.get(host);
        if (driver) {
          driver.machine.updateProps(() => propsFor(driver));
          continue;
        }
        const parent = isSub ? drivers.get(host.parentElement?.closest<HTMLElement>(container) ?? root) : undefined;
        if (isSub && !parent) continue;
        const binding = { id: uniqueId(), host, trigger, panel, parent, items: new Map<string, HTMLElement>() };
        const service = machineFor(() => propsFor(binding));
        const next: Driver = { ...binding, machine: service, unsubscribe: () => {},
          bindings: new Map(), localSelection: new Map(), externalSelection: new WeakMap() };
        drivers.set(host, next);
        service.start();
        next.unsubscribe = service.subscribe(queuePaint);
        if (parent) {
          apiOf(next).setParent(parent.machine.service);
          apiOf(parent).setChild(next.machine.service);
        }
      }
      if (menubar && typeof inputs.value === 'string') {
        const next = Array.from(drivers.values()).find(driver => !driver.parent && valueOf(driver.host) === inputs.value);
        if (activeTop && activeTop !== next) apiOf(activeTop).setOpen(false);
        if (next && !apiOf(next).open) apiOf(next).setOpen(true);
      }
      paint();
    },
    dispose() {
      disposed = true;
      for (const driver of drivers.values()) disposeDriver(driver);
      drivers.clear();
    },
  };
}
