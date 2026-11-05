export type JsonLine = { text: string; path: string[] };

// Keep the exact JSON.stringify layout, with paths attached to individual lines.
export function jsonLines(value: unknown): JsonLine[] {
  const lines: JsonLine[] = [];
  function visit(item: unknown, path: string[], depth: number, prefix = '', suffix = '') {
    const indent = '  '.repeat(depth);
    if (item !== null && typeof item === 'object' && Object.keys(item).length) {
      const array = Array.isArray(item);
      lines.push({ text: indent + prefix + (array ? '[' : '{'), path });
      const entries = Object.entries(item);
      entries.forEach(([key, child], index) => visit(child, [...path, key], depth + 1,
        array ? '' : JSON.stringify(key) + ': ', index < entries.length - 1 ? ',' : ''));
      lines.push({ text: indent + (array ? ']' : '}') + suffix, path: [] });
    } else lines.push({ text: indent + prefix + JSON.stringify(item) + suffix, path });
  }
  visit(value, [], 0);
  return lines;
}

export function renderDemoJson(code: HTMLElement, source: string, changed?: string[]) {
  const fragment = document.createDocumentFragment();
  const lines = jsonLines(JSON.parse(source));
  lines.forEach((line, index) => {
    const element = document.createElement('span');
    element.className = 'json-line';
    element.dataset.jsonPath = JSON.stringify(line.path);
    if (changed && JSON.stringify(changed) === element.dataset.jsonPath) element.classList.add('json-changed');
    const tokens = line.text.match(/"(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null|[^"\w\d-]+/gi) ?? [];
    for (const token of tokens) {
      const span = document.createElement('span');
      span.textContent = token;
      span.className = token.startsWith('"') ? (token.endsWith(':') ? 'json-key' : 'json-string')
        : /^(true|false|null|-?\d)/.test(token) ? 'json-value' : 'json-punctuation';
      element.append(span);
    }
    fragment.append(element);
    if (index < lines.length - 1) fragment.append('\n');
  });
  code.replaceChildren(fragment);
  code.parentElement?.classList.add('live-json');
}
