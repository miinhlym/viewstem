import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url),read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const original=await read('experiments/verification/coverage.json'),evidence=new Map();
const add=(id,entries)=>evidence.set(id,[...(evidence.get(id)??[]),...entries]);
for(const file of ['packages/core/test/fixtures/state/core-acceptance-coverage.json','packages/core/test/coverage-query-http.json','packages/core/test/coverage-action.json']) {
 const source=await read(file);
 for(const row of source.records)add(row.id,row.evidence.map(item=>({file:item.file,tests:item.testNames??item.caseIds??[item.test]})));
}
for(const row of (await read('packages/core/test/coverage-management-ui.json')).entries)add(row.id,row.tests.map(item=>({file:item.file,tests:[item.name]})));
for(const row of (await read('packages/core/test/coverage-runtime.json')).records)add(row.id,row.evidence);
const records=original.records.map(row=>({id:row.id,contract:row.contractRow,status:row.id.startsWith('X')?'deferred-optional-chart':evidence.has(row.id)?'verified-core':'unverified',evidence:evidence.get(row.id)??[],remaining:row.id.startsWith('X')?'선택 차트 제품 패키지는 후속 범위. 원래 독립 실험 증거는 보존한다.':evidence.has(row.id)?'':'실제 core 검사 연결 필요'}));
if(records.filter(row=>row.status==='verified-core').length!==216||records.filter(row=>row.status==='deferred-optional-chart').length!==8)throw Error('COVERAGE_INCOMPLETE');
const result={schemaVersion:1,baselineCommit:'10a326b9c623aaf2763375b8628635dd70ba65d8',date:'2026-11-02',scope:'JS/TS core, including headless UI lifetime and test-only real browser adapters. No Svelte/Dart/optional-chart product implementation claim.',summary:{core:216,verifiedCore:216,optionalChartsDeferred:8},originalCoverageSha256:createHash('sha256').update(await readFile(new URL('experiments/verification/coverage.json',root))).digest('hex'),records};
await writeFile(new URL('docs/handoff/core-acceptance-coverage.json',root),JSON.stringify(result,null,2)+'\n');
console.log('core acceptance: 216 mapped; optional charts: 8 deferred');
