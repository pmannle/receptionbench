import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../src/hash.js';
import {admitPilot,freezePilotPlan,initialPilotState,markDispatchIntent,bindCall} from '../src/pilot/state.js';
import {reconcilePilotEvidence,evaluatePilot} from '../src/pilot/evaluate.js';
import {createPilotBundle,replayPilot} from '../src/pilot/replay.js';
const now=1800000000000,callId='CA'+'1'.repeat(32),messageId='SM'+'2'.repeat(32);
const config={accountSid:'AC'+'3'.repeat(32),callerNumber:'+15555550101',targetNumber:'+15555550102',expectedSender:'+15555550102'};
const plan=()=>freezePilotPlan({id:'pilot-one',kind:'scored',authorizedUntil:now+3600000,configDigest:hash(config),caller:{recipientName:'Example'},oracle:{bookingUrl:'https://example.com/book'},reservationCents:400});
function evidence({body='Book https://example.com/book',at=now+1000,duplicate=false}={}){
 const state=bindCall(markDispatchIntent(admitPilot(plan(),initialPilotState(1000,115),now),now),callId),run=state.runs[0]!;
 run.callerStage='done';run.turns=1;
 run.receipts.push({id:messageId,from:config.expectedSender,to:config.callerNumber,body,receivedAt:at,source:'webhook'});
 if(duplicate)run.receipts.push({...run.receipts[0]!,id:'SM'+'4'.repeat(32)});
 const messages=run.receipts.map(r=>({id:r.id,from:r.from,to:r.to,body:r.body,sentAt:r.receivedAt,price:'-0.0083',priceUnit:'USD'}));
 return {state,snapshot:{atMs:now+500000,config,call:{id:callId,from:config.callerNumber,to:config.targetNumber,status:'completed',terminal:true,price:'-0.014',priceUnit:'USD',durationSeconds:10},messages,knownProviderCostCents:2}};
}
test('live pilot requires independent matching receipt, complete reconciliation and cleanup',()=>{
 const {state,snapshot}=evidence(),finished=reconcilePilotEvidence(state,snapshot);
 assert.equal(evaluatePilot(plan(),finished).verdict,'pass');
 const missing=reconcilePilotEvidence({...state,runs:[{...state.runs[0]!,receipts:[]}]},{...snapshot,messages:[]});
 assert.equal(evaluatePilot(plan(),missing).verdict,'fail');
 assert.equal(evaluatePilot(plan(),{...state,runs:[{...state.runs[0]!,observationHealthy:true}]}).verdict,'inconclusive');
 const incomplete=structuredClone(finished);incomplete.runs[0]!.cleanupComplete=false;
 assert.equal(evaluatePilot(plan(),incomplete).verdict,'infra_error');
 const limited=structuredClone(finished);limited.runs[0]!.callerLimited=true;
 assert.equal(evaluatePilot(plan(),limited).verdict,'inconclusive');
 assert.equal(finished.runs[0]!.costCents,null);
});
test('wrong URL, duplicate effects, wrong recipient and late delivery cannot pass',()=>{
 for(const options of [{body:'Book https://wrong.example/book'},{duplicate:true},{at:now+130000}]){
  const {state,snapshot}=evidence(options);assert.equal(evaluatePilot(plan(),reconcilePilotEvidence(state,snapshot)).verdict,'fail');
 }
 const {state,snapshot}=evidence();state.runs[0]!.receipts[0]!.to='+15555550999';
 assert.equal(evaluatePilot(plan(),reconcilePilotEvidence(state,snapshot)).verdict,'fail');
});
test('private replay is deterministic and exported result excludes phone numbers, SMS body and oracle',()=>{
 const {state,snapshot}=evidence(),finished=reconcilePilotEvidence(state,snapshot),bundle=createPilotBundle(finished);
 assert.deepEqual(replayPilot(bundle),evaluatePilot(plan(),finished));
 assert.doesNotMatch(JSON.stringify(bundle.result),/1555555010|Book https|bookingUrl|authToken/);
 assert.equal(bundle.result.ranked,false);assert.equal(bundle.result.transport,'pstn');
 const tampered=structuredClone(bundle);tampered.state.runs[0]!.observationHealthy=false;
 assert.throws(()=>replayPilot(tampered),/digest/);
 const forged=structuredClone(bundle);forged.state.runs[0]!.reconciliation!.atMs=now+1;
 const {digest,...body}=forged;forged.digest=hash(body);
 assert.throws(()=>replayPilot(forged),/closure|replay/);
});
