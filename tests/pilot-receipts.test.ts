import test from 'node:test';
import assert from 'node:assert/strict';
import twilio from 'twilio';
import { verifyWebhook, ingestReceipt } from '../src/pilot/receipts.js';
import { admitPilot,freezePilotPlan,initialPilotState,markDispatchIntent,bindCall } from '../src/pilot/state.js';
const now=1800000000000,account='AC'+'1'.repeat(32),call='CA'+'2'.repeat(32),message='SM'+'3'.repeat(32),token='synthetic-signing-token';
const config={canonicalOrigin:'https://pilot.example.com',accountSid:account,authToken:token};
const endpoints={callerNumber:'+15555550101',targetNumber:'+15555550102',expectedSender:'+15555550102'};
const plan=freezePilotPlan({id:'pilot-one',kind:'scored',authorizedUntil:now+3600000,configDigest:'a'.repeat(64),caller:{recipientName:'Example'},oracle:{bookingUrl:'https://example.com/book'},reservationCents:200});
const state=()=>bindCall(markDispatchIntent(admitPilot(plan,initialPilotState(1000,115),now),now),call);
function request(params:Record<string,string>,path='sms',origin=config.canonicalOrigin) {
 const url=`${origin}/webhooks/twilio/${path}?pilotId=pilot-one`;
 return new Request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':twilio.getExpectedTwilioSignature(token,url,params)},body:new URLSearchParams(params)});
}
const sms=(overrides:Record<string,string>={})=>({AccountSid:account,MessageSid:message,From:endpoints.expectedSender,To:endpoints.callerNumber,Body:'Book https://example.com/book',...overrides});
test('signature verification uses canonical URL, full parameters and account identity',async()=>{
 const verified=await verifyWebhook(request(sms({FutureField:'extra'})),config);
 assert.equal(verified.form.FutureField,'extra');
 const invalid=request(sms());invalid.headers.set('X-Twilio-Signature','forged');
 await assert.rejects(verifyWebhook(invalid,config),/signature/);
 await assert.rejects(verifyWebhook(request(sms(),'sms','https://attacker.example'),config),/origin/);
 await assert.rejects(verifyWebhook(request(sms({AccountSid:'AC'+'9'.repeat(32)})),config),/account/);
 const changed=request(sms());const body=new URLSearchParams(sms({Body:'tampered'}));
 await assert.rejects(verifyWebhook(new Request(changed.url,{method:'POST',headers:changed.headers,body}),config),/signature/);
});
test('receipt ingestion rejects wrong endpoints, cross-trial scope and late lease attribution',async()=>{
 const verified=await verifyWebhook(request(sms()),config);
 assert.throws(()=>ingestReceipt(state(),verified,{...endpoints,callerNumber:'+15555550999'},now+1),/endpoint/);
 assert.throws(()=>ingestReceipt(state(),{...verified,pilotId:'other'},endpoints,now+1),/scope/);
 assert.throws(()=>ingestReceipt(state(),verified,endpoints,now+480001),/lease/);
 assert.equal(ingestReceipt(state(),verified,endpoints,now+1000).runs[0]!.receipts.length,1);
});
test('identical callback replays deduplicate while conflicts and distinct-ID duplicate messages remain visible',async()=>{
 const receipt=await verifyWebhook(request(sms()),config);
 const first=ingestReceipt(state(),receipt,endpoints,now+1000);
 assert.equal(ingestReceipt(first,receipt,endpoints,now+2000).runs[0]!.receipts.length,1);
 const conflict=await verifyWebhook(request(sms({Body:'Changed'})),config);
 assert.throws(()=>ingestReceipt(first,conflict,endpoints,now+2000),/conflict/);
 const duplicate=await verifyWebhook(request(sms({MessageSid:'SM'+'4'.repeat(32)})),config);
 assert.equal(ingestReceipt(first,duplicate,endpoints,now+2000).runs[0]!.receipts.length,2);
});
test('terminal call state cannot regress when older status callbacks arrive',async()=>{
 const params={AccountSid:account,CallSid:call,From:endpoints.callerNumber,To:endpoints.targetNumber,CallStatus:'completed',SequenceNumber:'3'};
 const complete=ingestReceipt(state(),await verifyWebhook(request(params,'status'),config),endpoints,now+1000);
 assert.equal(complete.runs[0]!.callTerminal,true);
 const old=await verifyWebhook(request({...params,CallStatus:'ringing',SequenceNumber:'1'},'status'),config);
 assert.equal(ingestReceipt(complete,old,endpoints,now+2000).runs[0]!.callTerminal,true);
});
