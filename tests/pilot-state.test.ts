import test from 'node:test';
import assert from 'node:assert/strict';
import { freezePilotPlan, initialPilotState, admitPilot, markDispatchIntent, bindCall, markDispatchUnknown } from '../src/pilot/state.js';

const now = 1800000000000;
const plan = () => freezePilotPlan({ id:'pilot-one',kind:'scored',authorizedUntil:now+3600000,configDigest:'a'.repeat(64),caller:{recipientName:'Example stylist'},oracle:{bookingUrl:'https://example.com/book'},reservationCents:200 });
test('pilot admission rejects changed plans, expired authorization and over-budget reservations', () => {
  const state=initialPilotState(1000,115);
  assert.throws(()=>admitPilot({...plan(),reservationCents:1},state,now),/digest/);
  assert.throws(()=>admitPilot(plan(),initialPilotState(200,115),now),/budget/);
  assert.throws(()=>admitPilot(plan(),state,now+3600000),/expired/);
  assert.throws(()=>freezePilotPlan({...plan(),reservationCents:0.1}),/./);
  const admitted=admitPilot(plan(),state,now);
  assert.equal(admitted.runs.length,1);
  assert.equal(state.runs.length,0);
  assert.throws(()=>admitPilot({...plan(),id:'second'},admitted,now),/digest/);
  assert.throws(()=>admitPilot(plan(),admitted,now),/lease|duplicate/i);
});
test('persisted dispatch intent and unknown outcomes cannot cause a second dial after restart', () => {
  const admitted=admitPilot(plan(),initialPilotState(1000,115),now);
  const intent=markDispatchIntent(admitted,now);
  assert.equal(intent.runs[0]!.dispatch,'intent');
  assert.throws(()=>markDispatchIntent(JSON.parse(JSON.stringify(intent)),now),/dispatch/);
  const unknown=markDispatchUnknown(intent);
  assert.throws(()=>markDispatchIntent(unknown,now),/dispatch/);
  const bound=bindCall(unknown,'CA'+'1'.repeat(32));
  assert.equal(bound.runs[0]!.callId,'CA'+'1'.repeat(32));
  assert.throws(()=>bindCall(bound,'CA'+'2'.repeat(32)),/call/);
  assert.throws(()=>markDispatchIntent({...admitted,stopped:true},now),/stopped/);
});
test('quarantine, uncertain cost and incomplete cleanup retain exclusive admission', () => {
  const admitted=admitPilot(plan(),initialPilotState(1000,115),now);
  const second=freezePilotPlan({...plan(),id:'pilot-two'});
  assert.throws(()=>admitPilot(second,admitted,now+1000000),/lease/);
  const finished=structuredClone(admitted);
  Object.assign(finished.runs[0]!,{cleanupComplete:true,observationHealthy:true,costCents:10,callTerminal:true,quarantineUntil:now+300000});
  assert.throws(()=>admitPilot(second,finished,now+200000),/lease/);
  assert.equal(admitPilot(second,finished,now+300001).runs.length,2);
});
