import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../../../',import.meta.url),read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const coverage=await read('docs/handoff/core-acceptance-coverage.json'),seen=new Set(),reports=[];
for(const path of process.argv.slice(2))reports.push(await read(path));
const problems=[];
for(const row of coverage.records){
 if(seen.has(row.id))problems.push(`duplicate ${row.id}`);seen.add(row.id);
 if(row.status==='deferred-optional-chart'){if(!row.id.startsWith('X'))problems.push(`invalid deferred ${row.id}`);continue;}
 if(row.status!=='verified-core'||!row.evidence.length)problems.push(`unverified ${row.id}`);
 for(const evidence of row.evidence){
  await access(new URL(evidence.file,root));
  for(const name of evidence.tests){
   if(typeof name!=='string'||!name)problems.push(`missing name ${row.id}`);
   for(const report of reports)if(!report.tests.some(test=>test.name===name&&test.file===fileURLToPath(new URL(evidence.file,root))))problems.push(`${report.nodeVersion}: ${row.id}: ${evidence.file}: ${name}`);
  }
 }
}
if(seen.size!==224||coverage.records.filter(row=>row.status==='verified-core').length!==216)problems.push('unexpected inventory');
for(const report of reports)if(report.failed)problems.push(`${report.nodeVersion} failed tests ${report.failed}`);
if(problems.length){console.error(JSON.stringify(problems,null,2));process.exitCode=1;}else console.log(JSON.stringify({core:216,optionalCharts:8,verifiedReports:reports.map(report=>({node:report.nodeVersion,passed:report.passed}))}));
