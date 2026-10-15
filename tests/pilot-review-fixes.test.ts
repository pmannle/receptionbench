import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../src/hash.js';
import {initialPilotState,freezePilotPlan,admitPilot,markDispatchIntent,bindCall,purgeExpiredPilotState} from '../src/pilot/state.js';
import {reconcilePilotEvidence} from '../src/pilot/evaluate.js';
import {callerReplyAllowed} from '../src/pilot/caller.js';
const now=1800000000000,call='CA'+'1'.repeat(32),config={accountSid:'AC'+'2'.repeat(32),callerNumber:'+15555550101',targetNumber:'+15555550102',expectedSender:'+15555550102'};
const plan=()=>freezePilotPlan({id:'pilot-one',kind:'scored',authorizedUntil:now+86400000,configDigest:hash(config),caller:{recipientName:'Example'},oracle:{bookingUrl:'https://example.com/book'},reservationCents:400});
const state=()=>bindCall(markDispatchIntent(admitPilot(plan(),initialPilotState(1000,115),now),now),call);
test('observed spending above the authorized budget stops further admission',()=>{
 const finished=reconcilePilotEvidence(state(),{atMs:now+500000,config,call:{id:call,from:config.callerNumber,to:config.targetNumber,status:'completed',terminal:true,price:'-15',priceUnit:'USD',durationSeconds:120},messages:[],knownProviderCostCents:1500});
 assert.throws(()=>admitPilot(freezePilotPlan({...plan(),id:'pilot-two'}),finished,now+500001),/budget|stopped/);
 assert.equal(finished.stopped,true);
});
test('caller response guards override cached dialogue after stop, deadline and lease expiry',()=>{
 assert.equal(callerReplyAllowed({stopped:false,deadlineAt:now+120000,quarantineUntil:now+480000},now),true);
 assert.equal(callerReplyAllowed({stopped:true,deadlineAt:now+120000,quarantineUntil:now+480000},now),false);
 assert.equal(callerReplyAllowed({stopped:false,deadlineAt:now+120000,quarantineUntil:now+480000},now+120000),false);
 assert.equal(callerReplyAllowed({stopped:false,deadlineAt:now+120000,quarantineUntil:now+480000},now+480001),false);
});
test('pinned retention removes private state while retaining budget and replay tombstones',()=>{
 const privateState=state();privateState.runs[0]!.receipts.push({id:'SM'+'3'.repeat(32),from:config.expectedSender,to:config.callerNumber,body:'private-body',receivedAt:now+1,source:'webhook'});
 assert.equal(purgeExpiredPilotState(privateState,now+600000).runs.length,1);
 const purged=purgeExpiredPilotState(privateState,now+7*86400000+1);
 assert.equal(purged.runs.length,0);assert.equal(purged.retired.length,1);
 assert.doesNotMatch(JSON.stringify(purged),/private-body|1555555010|bookingUrl/);
 assert.equal(purged.retired[0]!.heldCents,400);
 assert.equal(purged.stopped,true);
});
test('replay reconciliation rejects inconsistent terminal status claims',()=>{
 assert.throws(()=>reconcilePilotEvidence(state(),{atMs:now+500000,config,call:{id:call,from:config.callerNumber,to:config.targetNumber,status:'in-progress',terminal:true,price:null,priceUnit:null,durationSeconds:0},messages:[],knownProviderCostCents:null}),/terminal/);
});
