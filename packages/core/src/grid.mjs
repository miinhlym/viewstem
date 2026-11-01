import { fail } from './errors.mjs';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object,key) => Object.hasOwn(object,key);
export function gridLayout(declarations, expanded, layout = {}) {
  const declared = new Map(declarations.map(node => [node.id, node]));
  const plans = new Map();
  for (const key of Object.keys(layout)) if (!declared.has(key)) fail('INVALID_DEFINITION', {message:'GRID_UNKNOWN_ID'});
  for (const [id, declaration] of declared) {
    const config = layout[id] ?? {};
    if (!object(config)) fail('INVALID_DEFINITION', {message:'GRID_LAYOUT'});
    if (Object.keys(config).some(key => !['row', 'column', 'rowSpan', 'columnSpan'].includes(key))) fail('INVALID_DEFINITION', {message:'GRID_LAYOUT'});
    for (const key of Object.keys(config)) if (!Number.isSafeInteger(config[key]) || config[key] < 1) fail('INVALID_DEFINITION', {message:'GRID_INTEGER'});
    if (own(config, 'row') !== own(config, 'column')) fail('INVALID_DEFINITION', {message:'GRID_PARTIAL'});
    const plan = { rowSpan: 1, columnSpan: 12, ...config };
    if (plan.columnSpan > 12 || (plan.column && plan.column + plan.columnSpan - 1 > 12)) fail('INVALID_DEFINITION', {message:'GRID_RANGE'});
    if (declaration.repeat && plan.row) fail('INVALID_DEFINITION', {message:'GRID_REPEAT_FIXED'});
    plans.set(id, plan);
  }
  const occupied = new Set(), placements = new Map();
  const cells = box => {
    const output = [];
    for (let row = box.row; row < box.row + box.rowSpan; ++row)
      for (let column = box.column; column < box.column + box.columnSpan; ++column) output.push(`${row}:${column}`);
    return output;
  };
  const reserve = (item, box) => {
    const area = cells(box);
    if (area.some(cell => occupied.has(cell))) fail('INVALID_DEFINITION', {message:'GRID_OVERLAP'});
    area.forEach(cell => occupied.add(cell)); placements.set(item.address, box);
  };
  for (const item of expanded) {
    const plan = plans.get(item.id) ?? fail('INVALID_DEFINITION', {message:'GRID_UNKNOWN_ID'});
    if (plan.row) reserve(item, { ...plan });
  }
  let cursor = 0;
  for (const item of expanded) {
    const plan = plans.get(item.id);
    if (plan.row) continue;
    for (;;) {
      const row = Math.floor(cursor / 12) + 1, column = cursor % 12 + 1;
      const box = { ...plan, row, column };
      if (column + plan.columnSpan - 1 <= 12 && cells(box).every(cell => !occupied.has(cell))) {
        reserve(item, box); cursor += plan.columnSpan; break;
      }
      ++cursor;
    }
  }
  return placements;
}
