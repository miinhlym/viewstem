import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../../../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const supportPath = 'packages/svelte-ui/src/lib/shadcn/support.json';
const supportText = await readFile(new URL(supportPath, root), 'utf8');
const support = JSON.parse(supportText);
const inventory = await read('docs/handoff/shadcn-component-inventory.json');
const rows = [];
for (const group of ['controls', 'overlays', 'display']) {
  for (const row of await read(`packages/svelte-ui/test/fixtures/audit-${group}.json`)) {
    assert.ok(row.testNames.length && row.testNames.every(name => name.startsWith(`audit/${row.family}:`)), row.family);
    for (const key of ['inputs', 'events', 'stateTransitions', 'nesting', 'keyboard', 'notApplicable', 'limitations']) assert.ok(Array.isArray(row[key]), `${row.family}.${key}`);
    assert.ok(row.stateTransitions.length || row.notApplicable.length, `${row.family}: missing State coverage or reason`);
    assert.ok(row.keyboard.length || row.notApplicable.length, `${row.family}: missing keyboard coverage or reason`);
    rows.push({ ...row, testFile: `packages/svelte-ui/test/audit-${group}.browser.mjs`,
      supportEntries: support.components.filter(component => component.family === row.family),
    });
  }
}
assert.equal(new Set(rows.map(row => row.family)).size, rows.length, 'duplicate family');
assert.deepEqual(rows.map(row => row.family).sort(), inventory.catalogItems.map(row => row.slug).sort(), 'all catalog families need audit rows');
rows.sort((a, b) => a.family.localeCompare(b.family, 'en'));
const matrix = {
  formatVersion: 1,
  upstreamCommit: support.upstreamCommit,
  supportFile: supportPath,
  supportSha256: createHash('sha256').update(supportText).digest('hex'),
  scope: 'Per-family observable behavior cases plus complete support-entry inventory; not an exhaustive cross-product of every HTML attribute, optional prop, and browser.',
  counts: { families: rows.length, nativeParts: support.upstreamComponents, jsonAdapters: support.components.filter(entry => entry.mode === 'json' && !entry.recipe).length, recipes: support.recipes, nativeContextParts: support.components.filter(entry => entry.mode === 'native-context').length, behaviorCases: rows.reduce((count, row) => count + row.testNames.length, 0) },
  sharedEvidence: { testFile: 'packages/svelte-ui/test/audit-shared.browser.mjs', commonDOMEventNames: Object.keys(support.callbacks[support.components.find(entry => entry.id === 'shadcn.Input').callbacksRef]), notes: ['40 common event names use synthetic dispatch to verify JSON transport; each family separately exercises actual native interactions.', 'Common attributes verify update/removal and DOM identity on Input, not all inherited HTML attributes on every part.', '35 native-context-only parts retain their existing RawComposition browser test; they are not claimed as JSON adapters.'] },
  rows,
};
const join = values => values.length ? values.map(value => value.replaceAll('|', '\\|')).join('<br>') : '—';
const lines = [
  '# shadcn 66개 컴포넌트 동작 검증표', '',
  '`packages/svelte-ui/scripts/audit-matrix.mjs`로 생성한다. 테스트 이름·범위는 `test/fixtures/audit-*.json`, 전체 입력 schema·이벤트·slot·native 전용 사유는 [공개 지원표](../../packages/svelte-ui/src/lib/shadcn/support.json)가 소유한다.', '',
  '아래는 실행할 사례와 그 정확한 주장이다. 실제 통과 결과·환경·수정 내용은 [감사 인계](svelte-ui-audit-2026-11-03.md), [실행 기록](svelte-ui-audit-verification-results.json)을 따른다. 입력 열은 실제로 관찰한 값이며 지원표 전체의 모든 값 조합을 시험했다는 뜻이 아니다.', '',
  '| 컴포넌트군 | 입력·이벤트 | State 전환 | 중첩 조합 | 키보드 | 해당 없음·검증 경계 |',
  '|---|---|---|---|---|---|',
];
for (const row of rows) {
  const count = row.supportEntries.filter(entry => entry.mode === 'json').length;
  lines.push(`| [${row.family}](../../${row.testFile}) (${count} JSON) | ${join(row.inputs)}<br>이벤트: ${join(row.events)} | ${join(row.stateTransitions)} | ${join(row.nesting)} | ${join(row.keyboard)} | ${join([...row.notApplicable.map(value => '해당 없음: ' + value), ...row.limitations.map(value => '범위 밖: ' + value)])} |`);
}
lines.push('', '공통 이벤트 40종의 전송 검사는 [audit-shared.browser.mjs](../../packages/svelte-ui/test/audit-shared.browser.mjs)를 사용한다. 합성 dispatch는 실제 사용자 키보드·마우스 동작 검사를 대신하지 않는다. 위 각 행의 별도 테스트가 실제 상호작용을 검증한다.', '', '부품별 공개 지원 참조와 정확한 테스트 이름은 [기계 판독 행렬](svelte-ui-audit-matrix.json)에 있다. 기존 66개 mount 검사·351개 JSON 부품 참조·35개 native 문맥 조합과 이번 동작 검사를 구분한다.', '');
for (const [path, contents] of [
  ['docs/handoff/svelte-ui-audit-matrix.json', JSON.stringify(matrix, null, 2) + '\n'],
  ['docs/handoff/svelte-ui-audit-matrix.md', lines.join('\n')],
]) {
  if (process.argv.includes('--check')) assert.equal(await readFile(new URL(path, root), 'utf8'), contents, `stale audit matrix: ${path}`);
  else await writeFile(new URL(path, root), contents);
}
console.log(JSON.stringify(matrix.counts));
