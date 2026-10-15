import test from 'node:test';
import assert from 'node:assert/strict';
import { nextCallerTurn,renderTwiml } from '../src/pilot/caller.js';
const base={stage:'greeting' as const,turns:0,recipientName:'A & B <Example>',deadlineAt:10000};
test('bounded caller listens for greeting and never turns silence into success',()=>{
 const silent=nextCallerTurn(base,{text:'',nowMs:1});
 assert.equal(silent.limited,true);assert.equal(silent.action.kind,'hangup');
 const greeted=nextCallerTurn(base,{text:'Hello, how can I help?',nowMs:1});
 assert.equal(greeted.action.kind,'speak');
 assert.match(JSON.stringify(greeted.action),/A & B <Example>/);
 assert.doesNotMatch(JSON.stringify(greeted.action),/https:|oracle|bookingUrl/);
 const xml=renderTwiml(greeted.action,'https://pilot.example.com/webhooks/twilio/speech?pilotId=x&turn=1');
 assert.match(xml,/A &amp; B &lt;Example&gt;/);assert.match(xml,/&amp;turn=1/);
 assert.match(xml,/actionOnEmptyResult="true"/);
});
test('caller answers consent once, recognizes an acknowledgment and bounds unexpected dialogue',()=>{
 const request={...base,stage:'request' as const,turns:1};
 const consent=nextCallerTurn(request,{text:'May I text it to this number?',nowMs:2});
 assert.equal(consent.stage,'consent');assert.match(JSON.stringify(consent.action),/consent/);
 assert.equal(nextCallerTurn({...request,stage:'consent',turns:2},{text:'The link has been sent.',nowMs:3}).limited,false);
 assert.equal(nextCallerTurn(request,{text:'What is your credit card?',nowMs:2}).limited,true);
 assert.equal(nextCallerTurn({...request,turns:4},{text:'May I send it?',nowMs:2}).action.kind,'hangup');
 assert.equal(nextCallerTurn(request,{text:'The link has been sent.',nowMs:10001}).limited,true);
 assert.throws(()=>renderTwiml({kind:'listen'},'https://bad.example/#fragment'),/callback/);
});
