// Node test-runner reporter: retain exact executed names for acceptance evidence.
export default async function* report(events) {
  const tests=[],failures=[];
  for await(const event of events) {
    if(event.type==='test:pass')tests.push({file:event.data.file,name:event.data.name});
    if(event.type==='test:fail')failures.push({file:event.data.file,name:event.data.name,message:event.data.details?.error?.message});
  }
  yield JSON.stringify({nodeVersion:process.version,passed:tests.length,failed:failures.length,tests,failures},null,2)+'\n';
}
