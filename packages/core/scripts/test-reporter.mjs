// Node test-runner reporter: retain exact executed names for acceptance evidence.
export default async function* report(events) {
  const tests=[],failures=[],skippedTests=[],todoTests=[];
  for await(const event of events) {
    if(!['test:pass','test:fail'].includes(event.type))continue;
    const entry={file:event.data.file,name:event.data.name};
    if(event.data.skip){skippedTests.push(entry);continue;}
    if(event.data.todo){todoTests.push(entry);continue;}
    if(event.type==='test:pass')tests.push({file:event.data.file,name:event.data.name});
    if(event.type==='test:fail')failures.push({file:event.data.file,name:event.data.name,message:event.data.details?.error?.message});
  }
  yield JSON.stringify({nodeVersion:process.version,passed:tests.length,failed:failures.length,skipped:skippedTests.length,todo:todoTests.length,tests,failures,skippedTests,todoTests},null,2)+'\n';
}
