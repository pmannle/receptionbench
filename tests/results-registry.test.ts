import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {hash} from '../src/hash.js';
import {validateResultsRegistry} from '../src/results-registry.js';
const cohort={suiteDigest:'a'.repeat(64),evaluatorVersion:'pilot-evaluator-0.1',profile:'booking-link-pstn-smoke',transport:'pstn',language:'en-US',callerPolicy:'twiml-bounded-v0.1',observationMode:'black-box',track:'deterministic'};
const entry=()=>({id:'example-result',system:{name:'Example system',version:'opaque'},date:'2026-10-15T18:00:00.000Z',cohort,cohortDigest:hash(cohort),ranked:false,evidenceLevel:'benchmark-operated',operator:'Example operator',reviewer:'Example reviewer',relationship:'Operator is also a developer of this system; internal research.',publication:{approved:true,approvedAt:'2026-10-15T18:00:00.000Z',reference:'https://github.com/pmannle/receptionbench/issues/1'},counts:{scheduled:1,pass:1,fail:0,inconclusive:0,infra_error:0,unsupported:0},scenarioResults:[{id:'booking-link',counts:{scheduled:1,pass:1,fail:0,inconclusive:0,infra_error:0,unsupported:0},wilson95:[0.20654931437723745,1]}],criticalViolations:0,evidenceCoverage:1,costs:{currency:'USD',knownCents:2,uncertain:true},reportDigest:'b'.repeat(64),artifacts:[{access:'restricted',digest:'c'.repeat(64),instructions:'Available to the agreed reviewer.'}]});
const registry=(value:unknown=entry())=>({schemaVersion:'results-registry-0.1',entries:[value]});
test('maintained public registry starts empty and accepts only reviewed publication records',()=>{
 assert.equal(validateResultsRegistry(JSON.parse(readFileSync('website/results.json','utf8'))).entries.length,0);
 assert.equal(validateResultsRegistry(registry()).entries.length,1);
 const missing=entry();delete (missing as Partial<typeof missing>).publication;
 assert.throws(()=>validateResultsRegistry(registry(missing)),/./);
});
test('simulations, unsupported rankings and cohort/count mismatches cannot enter the registry',()=>{
 for(const changes of [{ranked:true},{cohort:{...cohort,transport:'fake'}},{cohortDigest:'d'.repeat(64)},{counts:{...entry().counts,scheduled:2}}]){
  assert.throws(()=>validateResultsRegistry({schemaVersion:'results-registry-0.1',entries:[{...entry(),...changes}]}),/./);
 }
});
test('registry rejects private fields, unsafe artifact links and active markup',()=>{
 for(const changes of [{phoneNumber:'+15555550101'},{authToken:'secret'},{system:{name:'<img src=x onerror=alert(1)>',version:'opaque'}},{artifacts:[{access:'public',digest:'c'.repeat(64),url:'javascript:alert(1)'}]},{artifacts:[{access:'public',digest:'c'.repeat(64),url:'https://example.com/report?token=secret'}]}]){
  assert.throws(()=>validateResultsRegistry({schemaVersion:'results-registry-0.1',entries:[{...entry(),...changes}]}),/./);
 }
});
test('browser result renderer treats submitted names as text and rejects unsafe links',async()=>{
 const {renderResults}=await import(pathToFileURL(`${process.cwd()}/website/results.mjs`).href);
 class Element {
  children:Element[]=[];textContent='';className='';href='';
  set innerHTML(_value:string){throw new Error('Unsafe HTML parsing');}
  append(child:Element){this.children.push(child);}
  replaceChildren(...nodes:Element[]){this.children=nodes;}
 }
 const document={createElement:()=>new Element(),createDocumentFragment:()=>new Element()},container=new Element();
 const hostile={...entry(),system:{name:'<script>alert(1)</script>',version:'opaque'}};
 renderResults(registry(hostile),document,container);
 assert.match(JSON.stringify(container),/<script>alert\(1\)<\/script>/);
 assert.throws(()=>renderResults(registry({...entry(),artifacts:[{access:'public',digest:'c'.repeat(64),url:'javascript:alert(1)'}]}),document,container),/Unsafe/);
});
