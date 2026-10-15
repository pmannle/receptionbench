import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import twilio from '../../../node_modules/twilio/lib/index.js';
import {createHash} from 'node:crypto';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const account='AC'+'1'.repeat(32),call='CA'+'2'.repeat(32),origin='https://pilot.example.com',auth='synthetic-token',operator='synthetic-operator-token-32-characters';
const config={accountSid:account,callerNumber:'+15555550101',targetNumber:'+15555550102',expectedSender:'+15555550102'};
const frozen=()=>{const p={schemaVersion:'live-pilot-0.1',profile:'booking-link-pstn-smoke',id:'pilot-one',kind:'scored',authorizedUntil:Date.now()+3600000,configDigest:hash(config),caller:{recipientName:'Example'},oracle:{bookingUrl:'https://example.com/book'},reservationCents:400,limits:{callSeconds:120,settleSeconds:60,quarantineSeconds:300,maxTurns:4,maxRedials:0}};return {...p,digest:hash(p)};};
await mkdir('build',{recursive:true});
async function setup(t,{uncertain=false,persist}={}){
 const dir=persist??await mkdtemp(join(tmpdir(),'receptionbench-worker-'));
 let dials=0,completed=false;const outbound=[];
 const outboundService=async request=>{
  const url=new URL(request.url);outbound.push({url:url.href,method:request.method});
  if(url.origin!=='https://api.twilio.com')return new Response('network disabled',{status:503});
  if(url.pathname===`/2010-04-01/Accounts/${account}/Calls.json`&&request.method==='POST'){
   const p=new URLSearchParams(await request.text());outbound.at(-1).form=Object.fromEntries(p);
   if(p.get('To')!==config.targetNumber||p.get('From')!==config.callerNumber||p.get('TimeLimit')!=='120'||p.get('Record')!=='false'||++dials>1)return new Response('invalid dispatch',{status:400});
   if(uncertain)throw new Error('Lost provider response');
   return new Response(JSON.stringify({sid:call}),{status:201});
  }
  if(url.pathname===`/2010-04-01/Accounts/${account}/Calls/${call}.json`){
   if(request.method==='POST')completed=true;
   return new Response(JSON.stringify({sid:call,from:config.callerNumber,to:config.targetNumber,status:completed?'completed':'in-progress',price:'-0.014',price_unit:'USD',duration:'30'}));
  }
  return new Response('synthetic unavailable provider',{status:503});
 };
 const mf=new Miniflare({...convertV4MiniflareOptions({name:'receptionbench-pilot-test',modules:true,scriptPath:'build/worker.js',compatibilityDate:'2025-10-01',compatibilityFlags:['nodejs_compat'],durableObjects:{PILOT:{className:'PilotCoordinator',useSQLite:true}},durableObjectsPersist:join(dir,'do'),r2Buckets:['EVIDENCE'],r2Persist:join(dir,'r2'),outboundService,bindings:{CANONICAL_ORIGIN:origin,TWILIO_AUTH_TOKEN:auth,OPERATOR_TOKEN:operator,TARGET_CONFIG_JSON:JSON.stringify(config),BUDGET_CENTS:'1000',SETUP_CENTS:'115'}}),resourcePersistencePath:dir});
 t.after(async()=>{await mf.dispose();if(!persist)await rm(dir,{recursive:true,force:true});});
 const request=(path,{body,method=body?'POST':'GET',authorized=true}={})=>mf.dispatchFetch(origin+path,{method,headers:{...(authorized?{Authorization:`Bearer ${operator}`}:{}) ,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {mf,request,dir,outbound};
}
test('operator API rejects anonymous admission and altered or arbitrary target input',async t=>{
 const {request}=await setup(t);
 assert.equal((await request('/operator/pilots',{authorized:false})).status,401);
 assert.equal((await request('/operator/pilots',{body:{...frozen(),targetNumber:'+15555550999'}})).status,400);
 assert.equal((await request('/operator/pilots',{body:{...frozen(),configDigest:'b'.repeat(64)}})).status,400);
 assert.equal((await request('/operator/pilots',{body:frozen()})).status,201);
 assert.equal((await request('/operator/pilots',{body:frozen()})).status,409);
});
test('durable admission dispatches only once and validates real SDK signatures in Worker',async t=>{
 const {mf,request,outbound}=await setup(t);
 assert.equal((await request('/operator/pilots',{body:frozen()})).status,201);
 const responses=await Promise.all([request('/operator/pilots/pilot-one/start',{method:'POST'}),request('/operator/pilots/pilot-one/start',{method:'POST'})]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[202,409],JSON.stringify(outbound));
 const state=await (await request('/operator/pilots/pilot-one')).json();
 assert.equal(state.runs[0].dispatch,'confirmed');
 const url=origin+'/webhooks/twilio/sms',params={AccountSid:account,MessageSid:'SM'+'3'.repeat(32),From:config.expectedSender,To:config.callerNumber,Body:'Book https://example.com/book'};
 const signature=twilio.getExpectedTwilioSignature(auth,url,params);
 assert.equal((await mf.dispatchFetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':'forged'},body:new URLSearchParams(params)})).status,403);
 assert.equal((await mf.dispatchFetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':signature},body:new URLSearchParams(params)})).status,200);
 const observed=await(await request('/operator/pilots/pilot-one')).json();
 assert.equal(observed.runs[0].receipts.length,1);
 const result=await(await request('/operator/pilots/pilot-one/result')).json();
 assert.equal(result.verdict,'inconclusive');assert.equal(result.ranked,false);
 assert.doesNotMatch(JSON.stringify(result),/1555555010|Book https/);
 assert.equal((await request('/operator/pilots/pilot-one/export',{authorized:false})).status,401);
 assert.equal((await request('/operator/pilots/wrong/start',{method:'POST'})).status,404);
});
test('ambiguous provider response persists uncertainty and blocks redial',async t=>{
 const {request}=await setup(t,{uncertain:true});
 await request('/operator/pilots',{body:frozen()});
 assert.equal((await request('/operator/pilots/pilot-one/start',{method:'POST'})).status,503);
 const state=await(await request('/operator/pilots/pilot-one')).json();
 assert.equal(state.runs[0].dispatch,'unknown');
 assert.equal((await request('/operator/pilots/pilot-one/start',{method:'POST'})).status,409);
 assert.equal((await request('/operator/stop',{method:'POST'})).status,202);
 assert.equal((await(await request('/operator/pilots/pilot-one')).json()).stopped,true);
});

test('operator stop reconciles terminated call ownership and confirmed cleanup',async t=>{
 const {request}=await setup(t);
 await request('/operator/pilots',{body:frozen()});
 await request('/operator/pilots/pilot-one/start',{method:'POST'});
 assert.equal((await request('/operator/stop',{method:'POST'})).status,202);
 const state=await(await request('/operator/pilots/pilot-one')).json();
 assert.equal(state.stopped,true);assert.equal(state.runs[0].callTerminal,true);assert.equal(state.runs[0].cleanupComplete,true);
});
test('unknown dispatch survives a full runtime restart with no redial',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'receptionbench-restart-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const first=await setup(t,{uncertain:true,persist:dir});
 await first.request('/operator/pilots',{body:frozen()});
 await first.request('/operator/pilots/pilot-one/start',{method:'POST'});
 await first.mf.dispose();
 const second=await setup(t,{persist:dir});
 assert.equal((await second.request('/operator/pilots/pilot-one/start',{method:'POST'})).status,409);
 assert.equal((await(await second.request('/operator/pilots/pilot-one')).json()).runs[0].dispatch,'unknown');
});
