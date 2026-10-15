import test from 'node:test';
import assert from 'node:assert/strict';
import { TwilioPilotProvider } from '../src/pilot/twilio-provider.js';
const account='AC'+'1'.repeat(32),call='CA'+'2'.repeat(32),from='+15555550101',to='+15555550102';
test('Twilio boundary fixes account scope, enforces call bounds and redacts provider errors',async()=>{
 const seen:string[]=[];
 const provider=new TwilioPilotProvider({accountSid:account,authToken:'synthetic'},async(url:RequestInfo|URL,options?:RequestInit)=>{
  seen.push(String(url));
  if(options?.method==='POST'){
   const form=new URLSearchParams(String(options.body));
   assert.equal(form.get('TimeLimit'),'120');assert.equal(form.get('Record'),'false');
   return new Response(JSON.stringify({sid:call}),{status:201});
  }
  return new Response(JSON.stringify({sid:call,from,to,status:'completed',price:'-0.012',price_unit:'USD',duration:'10'}));
 });
 assert.equal((await provider.createCall({from,to,voiceUrl:'https://pilot.example.com/voice',statusUrl:'https://pilot.example.com/status',timeLimitSeconds:120})).callId,call);
 assert.equal((await provider.getCall(call)).terminal,true);
 assert.ok(seen.every(url=>url.startsWith(`https://api.twilio.com/2010-04-01/Accounts/${account}/`)));
 const failing=new TwilioPilotProvider({accountSid:account,authToken:'synthetic'},async()=>new Response('secret-provider-error',{status:500}));
 await assert.rejects(failing.getCall(call),e=>e instanceof Error&&!e.message.includes('secret-provider-error'));
 await assert.rejects(provider.getCall('../OtherAccount'),/identifier/);
});
test('provider receipt reconciliation rejects truncation and preserves server timing and prices',async()=>{
 const provider=new TwilioPilotProvider({accountSid:account,authToken:'synthetic'},async()=>new Response(JSON.stringify({messages:[{sid:'SM'+'3'.repeat(32),from:to,to:from,body:'Book https://example.com',date_sent:'2027-01-15T08:00:01.000Z',price:'-0.0083',price_unit:'USD'}],next_page_uri:null})));
 const messages=await provider.listReceipts({from:to,to:from,sinceMs:Date.parse('2027-01-15T08:00:00Z'),untilMs:Date.parse('2027-01-15T08:01:00Z')});
 assert.equal(messages.length,1);assert.equal(messages[0]!.price,'-0.0083');
 const truncated=new TwilioPilotProvider({accountSid:account,authToken:'synthetic'},async()=>new Response(JSON.stringify({messages:[],next_page_uri:'https://attacker.example'})));
 await assert.rejects(truncated.listReceipts({from:to,to:from,sinceMs:0,untilMs:10000}),/pagination/);
});
