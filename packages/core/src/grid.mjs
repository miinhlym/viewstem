import { fail } from './errors.mjs';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object,key) => Object.hasOwn(object,key);
const lastRow = box => {
  if (box.row > Number.MAX_SAFE_INTEGER - (box.rowSpan - 1)) fail('INVALID_DEFINITION', {message:'GRID_RANGE'});
  return box.row + (box.rowSpan - 1);
};
const lastColumn = box => box.column + (box.columnSpan - 1);
export function computeGridLayout(declarations, expanded, layout = {}) {
  const declared = new Map(declarations.map(node => [node.id, node]));
  const plans = new Map();
  for (const key of Object.keys(layout)) if (!declared.has(key)) fail('INVALID_DEFINITION', {message:'GRID_UNKNOWN_ID'});
  for (const [id, declaration] of declared) {
    const config = own(layout, id) ? layout[id] ?? {} : {};
    if (!object(config)) fail('INVALID_DEFINITION', {message:'GRID_LAYOUT'});
    if (Object.keys(config).some(key => !['row', 'column', 'rowSpan', 'columnSpan'].includes(key))) fail('INVALID_DEFINITION', {message:'GRID_LAYOUT'});
    for (const key of Object.keys(config)) if (!Number.isSafeInteger(config[key]) || config[key] < 1) fail('INVALID_DEFINITION', {message:'GRID_INTEGER'});
    if (own(config, 'row') !== own(config, 'column')) fail('INVALID_DEFINITION', {message:'GRID_PARTIAL'});
    const plan = { rowSpan: 1, columnSpan: 12, ...config };
    if (plan.columnSpan > 12 || (plan.column && lastColumn(plan) > 12)) fail('INVALID_DEFINITION', {message:'GRID_RANGE'});
    if (plan.row) lastRow(plan);
    if (declaration.repeat && plan.row) fail('INVALID_DEFINITION', {message:'GRID_REPEAT_FIXED'});
    plans.set(id, plan);
  }
  const occupied = [], placements = new Map();
  const overlaps = (left, right) => left.row <= lastRow(right) && right.row <= lastRow(left)
    && left.column <= lastColumn(right) && right.column <= lastColumn(left);
  const reserve = (item, box) => {
    if (occupied.some(other => overlaps(box, other))) fail('INVALID_DEFINITION', {message:'GRID_OVERLAP'});
    occupied.push(box); placements.set(item.address, box);
  };
  for (const item of expanded) {
    const plan = plans.get(item.id) ?? fail('INVALID_DEFINITION', {message:'GRID_UNKNOWN_ID'});
    if (plan.row) reserve(item, { ...plan });
  }
  let row = 1, column = 1;
  for (const item of expanded) {
    const plan = plans.get(item.id);
    if (plan.row) continue;
    for (;;) {
      lastRow({ ...plan, row });
      const firstColumn = column;
      let placed = false;
      let blockerEnd = Number.MAX_SAFE_INTEGER;
      for (; column + (plan.columnSpan - 1) <= 12;) {
        const box = { ...plan, row, column };
        const blocker = occupied.find(other => overlaps(box, other));
        if (!blocker) { reserve(item, box); column += plan.columnSpan; placed = true; break; }
        blockerEnd = Math.min(blockerEnd, lastRow(blocker));
        column = lastColumn(blocker) + 1;
      }
      if (placed) break;
      // Only skip rows after searching every column: no blocking rectangle
      // disappears before this boundary, and new rectangles cannot open space.
      const nextRow = firstColumn === 1 ? blockerEnd : row;
      if (nextRow === Number.MAX_SAFE_INTEGER) fail('INVALID_DEFINITION', {message:'GRID_RANGE'});
      row = nextRow + 1; column = 1;
    }
  }
  return placements;
}
