export function renderResults(registry,document,container){
 if(registry?.schemaVersion!=='results-registry-0.1'||!Array.isArray(registry.entries))throw new Error('Unsupported results registry');
 if(!registry.entries.length)return;
 const fragment=document.createDocumentFragment();
 for(const entry of registry.entries){
  if(entry.ranked!==false||entry.cohort?.transport==='fake')throw new Error('Unsupported ranking record');
  const card=document.createElement('article');card.className='result-card';
  const title=document.createElement('h3');title.textContent=entry.system.name;card.append(title);
  for(const value of [
   `${entry.evidenceLevel} · Unranked research result`,
   `${entry.cohort.profile} · ${entry.cohort.transport} · ${entry.cohort.language}`,
   `${entry.counts.pass} passed / ${entry.counts.scheduled} scheduled; ${entry.counts.fail} failed; ${entry.counts.inconclusive} inconclusive; ${entry.counts.infra_error} infrastructure errors; ${entry.counts.unsupported} unsupported.`,
   `${entry.criticalViolations} critical violations observed. Evidence coverage: ${(100*entry.evidenceCoverage).toFixed(0)}%.`,
   `Version: ${entry.system.version}. ${entry.relationship}`,
   `Operator: ${entry.operator}. Reviewer: ${entry.reviewer}. Date: ${entry.date.slice(0,10)}.`,
   `Known provider cost: ${entry.costs.knownCents===null?'unavailable':`$${(entry.costs.knownCents/100).toFixed(2)}`}${entry.costs.uncertain?'; final costs uncertain.':'.'}`,
   `Cohort digest: ${entry.cohortDigest}`,
   `Report digest: ${entry.reportDigest}`
  ]){const p=document.createElement('p');p.textContent=value;card.append(p);}
  for(const scenario of entry.scenarioResults??[]){const p=document.createElement('p');p.textContent=`${scenario.id}: ${scenario.counts.pass}/${scenario.counts.scheduled} passed; 95% per-scenario interval ${(100*scenario.wilson95[0]).toFixed(1)}–${(100*scenario.wilson95[1]).toFixed(1)}%.`;card.append(p);}
  for(const artifact of entry.artifacts){
   if(artifact.access==='public'){
    const url=new URL(artifact.url);if(url.protocol!=='https:'||url.username||url.password||url.search)throw new Error('Unsafe artifact link');
    const link=document.createElement('a');link.href=url.href;link.className='text-link';link.textContent='Inspect public artifact ↗';card.append(link);
   }else{const p=document.createElement('p');p.textContent=`Restricted evidence: ${artifact.instructions}`;card.append(p);}
  }
  fragment.append(card);
 }
 container.replaceChildren(fragment);
}
if(typeof document!=='undefined'){
 fetch('results.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(registry=>renderResults(registry,document,document.querySelector('#results'))).catch(()=>{
  document.querySelector('#registry-status').textContent='The results registry could not be loaded. No rankings are shown; view the maintained registry on GitHub.';
 });
}
