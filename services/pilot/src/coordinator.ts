import {z} from 'zod/v3';
import {hash} from '../../../src/hash.js';
import {PilotPlanSchema,PilotStateSchema,currentRun,type PilotState} from '../../../src/pilot/contracts.js';
import {initialPilotState,admitPilot,markDispatchIntent,markDispatchUnknown,bindCall} from '../../../src/pilot/state.js';
import {verifyWebhook,ingestReceipt} from '../../../src/pilot/receipts.js';
import {nextCallerTurn,renderTwiml,type CallerAction} from '../../../src/pilot/caller.js';
import {TwilioPilotProvider} from '../../../src/pilot/twilio-provider.js';
import {reconcilePilotEvidence,evaluatePilot} from '../../../src/pilot/evaluate.js';
import {createPilotBundle} from '../../../src/pilot/replay.js';
import {json,type Env} from './worker.js';
const number=z.string().regex(/^\+1[2-9]\d{2}[2-9]\d{6}$/);
const TargetSchema=z.object({accountSid:z.string().regex(/^AC[a-f0-9]{32}$/),callerNumber:number,targetNumber:number,expectedSender:number}).strict();
const terminal=(s:string)=>['completed','busy','failed','no-answer','canceled'].includes(s);
export class PilotCoordinator {
 constructor(private ctx:DurableObjectState,private env:Env){}
 private config(){return TargetSchema.parse(JSON.parse(this.env.TARGET_CONFIG_JSON));}
 private provider(){return new TwilioPilotProvider({...this.config(),authToken:this.env.TWILIO_AUTH_TOKEN});}
 private async load():Promise<PilotState>{return PilotStateSchema.parse(await this.ctx.storage.get('state')??initialPilotState(Number(this.env.BUDGET_CENTS),Number(this.env.SETUP_CENTS)));}
 private async save(state:PilotState){await this.ctx.storage.put('state',PilotStateSchema.parse(state));}
 private url(kind:string,id:string,turn?:number){return `${this.env.CANONICAL_ORIGIN}/webhooks/twilio/${kind}?pilotId=${encodeURIComponent(id)}${turn===undefined?'':`&turn=${turn}`}`;}
 async fetch(request:Request):Promise<Response>{
  return this.ctx.blockConcurrencyWhile(async()=>{
   try{return await this.handle(request);}catch{return json({error:'operation_failed'},503);}
  });
 }
 private async handle(request:Request):Promise<Response>{
  const url=new URL(request.url),path=url.pathname,now=Date.now();let state=await this.load();
  if(path==='/operator/pilots'&&request.method==='POST'){
   let plan;try{const text=await request.text();if(text.length>16384)throw new Error();plan=PilotPlanSchema.parse(JSON.parse(text));if(plan.configDigest!==hash(this.config()))throw new Error();}catch{return json({error:'invalid_plan'},400);}
   try{state=admitPilot(plan,state,now);}catch{return json({error:'admission_rejected'},409);}
   await this.save(state);await this.ctx.storage.setAlarm(now+120000);return json({id:plan.id,planDigest:plan.digest},201);
  }
  if(path.startsWith('/webhooks/twilio/'))return this.webhook(request,state,now);
  if(path==='/operator/stop'&&request.method==='POST'){
   state.stopped=true;state.version++;await this.save(state);await this.reconcile(state,true);return json({stopped:true},202);
  }
  if(path==='/internal/tick'&&request.method==='POST'){await this.reconcile(state,state.stopped);return json({checked:true});}
  const match=path.match(/^\/operator\/pilots\/([a-zA-Z0-9_-]+)(?:\/(start|reconcile|export|result))?$/);
  if(!match||!state.runs.length||currentRun(state).plan.id!==match[1])return json({error:'not_found'},404);
  if(request.method==='GET'&&!match[2])return json(state);
  if(request.method==='GET'&&match[2]==='export')return json(createPilotBundle(state));
  if(request.method==='GET'&&match[2]==='result')return json(evaluatePilot(currentRun(state).plan,state));
  if(request.method==='POST'&&match[2]==='reconcile'){await this.reconcile(state,state.stopped);return json(await this.load());}
  if(request.method==='POST'&&match[2]==='start'){
   try{state=markDispatchIntent(state,now);}catch{return json({error:'dispatch_rejected'},409);}
   await this.save(state);await this.ctx.storage.setAlarm(now+120000);
   const run=currentRun(state),c=this.config();
   try{
    const result=await this.provider().createCall({from:c.callerNumber,to:c.targetNumber,voiceUrl:this.url('voice',run.plan.id,0),statusUrl:this.url('status',run.plan.id),timeLimitSeconds:120});
    state=bindCall(state,result.callId);await this.save(state);return json({id:run.plan.id,dispatch:'confirmed'},202);
   }catch{state=markDispatchUnknown(state);await this.save(state);return json({error:'dispatch_unknown_no_redial'},503);}
  }
  return json({error:'not_found'},404);
 }
 private async webhook(request:Request,state:PilotState,now:number):Promise<Response>{
  const c=this.config();let receipt;
  try{receipt=await verifyWebhook(request,{canonicalOrigin:this.env.CANONICAL_ORIGIN,accountSid:c.accountSid,authToken:this.env.TWILIO_AUTH_TOKEN});}catch{return json({error:'invalid_webhook'},403);}
  if(!state.runs.length)return json({error:'no_active_lease'},409);
  let run=currentRun(state);
  if(receipt.kind!=='sms'&&!run.callId&&['intent','unknown'].includes(run.dispatch)&&receipt.pilotId===run.plan.id&&receipt.form.From===c.callerNumber&&receipt.form.To===c.targetNumber){
   try{state=bindCall(state,receipt.form.CallSid!);run=currentRun(state);}catch{return json({error:'binding_rejected'},409);}
  }
  if(run.dispatch==='pending')return json({error:'call_not_dispatched'},409);
  const cached=run.callbackReplies[receipt.digest];if(cached)return this.xml(cached);
  try{state=ingestReceipt(state,receipt,c,now);}catch{
   run.errors.push('callback_scope_or_conflict');run.observationHealthy=false;await this.save(state);return json({error:'callback_rejected'},409);
  }
  run=currentRun(state);
  const key=`raw/${run.plan.id}/${receipt.digest}.json`;
  await this.env.EVIDENCE.put(key,JSON.stringify({receivedAt:now,receipt}),{httpMetadata:{contentType:'application/json'}});
  if(!run.evidenceRefs.includes(key))run.evidenceRefs.push(key);
  let response='<?xml version="1.0"?><Response/>';
  if(receipt.kind==='voice'||receipt.kind==='speech'){
   let action:CallerAction;
   if(state.stopped||now>=run.deadlineAt){run.callerLimited=true;run.callerStage='done';action={kind:'hangup'};}
   else if(receipt.kind==='voice'){
    if(run.callerStage!=='greeting'||run.turns!==0)return json({error:'caller_stage_conflict'},409);
    action={kind:'listen'};
   }else{
    if(receipt.turn!==String(run.turns))return json({error:'caller_turn_conflict'},409);
    if(run.plan.kind==='readiness'){
     run.callerLimited=!receipt.form.SpeechResult?.trim();run.callerStage='done';action={kind:'hangup'};
    }else{
     const next=nextCallerTurn({stage:run.callerStage,turns:run.turns,recipientName:run.plan.caller.recipientName,deadlineAt:run.deadlineAt},{text:receipt.form.SpeechResult??'',nowMs:now});
     run.callerStage=next.stage;run.turns=next.turns;run.callerLimited=next.limited;action=next.action;
    }
   }
   response=renderTwiml(action,this.url('speech',run.plan.id,run.turns));run.callbackReplies[receipt.digest]=response;
  }
  await this.save(state);return this.xml(response);
 }
 private xml(body:string){return new Response(body,{headers:{'Content-Type':'text/xml','Cache-Control':'no-store'}});}
 private async reconcile(state:PilotState,stop:boolean):Promise<void>{
  if(!state.runs.length)return;const run=currentRun(state),now=Date.now(),provider=this.provider(),c=this.config();
  if(run.reconciliationAttempts>=10){await this.ctx.storage.deleteAlarm();return;}
  run.reconciliationAttempts++;await this.save(state);
  try{
   if(!run.callId&&['intent','unknown'].includes(run.dispatch)){
    const calls=await provider.findCalls(c.callerNumber,c.targetNumber,run.admittedAt);
    if(calls.length===1){state=bindCall(state,calls[0]!.id);}
    else{run.errors.push(calls.length?'ambiguous_provider_calls':'dispatch_unreconciled');await this.save(state);await this.ctx.storage.setAlarm(now+60000);return;}
   }
   const active=currentRun(state);
   if(active.callId){
    let call=await provider.getCall(active.callId);
    if(call.from!==c.callerNumber||call.to!==c.targetNumber)throw new Error('Call scope mismatch');
    if(!call.terminal&&(stop||now>=active.deadlineAt)){await provider.stopCall(active.callId);call=await provider.getCall(active.callId);}
    active.callTerminal=call.terminal;active.cleanupComplete=call.terminal;
   }else if(active.dispatch==='pending'&&(stop||now>=active.deadlineAt)){active.callTerminal=true;active.cleanupComplete=true;active.callerLimited=true;}
   if(active.callId&&active.cleanupComplete&&now>=active.quarantineUntil){
    const call=await provider.getCall(active.callId);
    const messages=await provider.listReceipts({from:c.expectedSender,to:c.callerNumber,sinceMs:active.admittedAt,untilMs:active.quarantineUntil});
    let knownProviderCostCents:number|null=null;
    try{knownProviderCostCents=(await provider.reconcileUsage({from:c.callerNumber,to:c.targetNumber,sinceMs:active.admittedAt,untilMs:now})).costCents;}catch{ /* Retain full reservation; usage is visibly uncertain. */ }
    const snapshot={atMs:now,config:c,call,messages,knownProviderCostCents};
    const key=`raw/${active.plan.id}/reconciliation-${now}.json`;
    await this.env.EVIDENCE.put(key,JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'}});
    state=reconcilePilotEvidence(state,snapshot);currentRun(state).evidenceRefs.push(key);
   }
   state.version++;await this.save(state);
   if((!active.cleanupComplete||now<active.quarantineUntil)&&currentRun(state).reconciliationAttempts<10)await this.ctx.storage.setAlarm(now+60000);
   else await this.ctx.storage.deleteAlarm();
  }catch{
   const active=currentRun(state);if(active.errors.length<100)active.errors.push('reconciliation_unavailable');active.observationHealthy=false;await this.save(state);if(active.reconciliationAttempts<10)await this.ctx.storage.setAlarm(now+60000);else await this.ctx.storage.deleteAlarm();
  }
 }
 async alarm(){await this.ctx.blockConcurrencyWhile(async()=>{const state=await this.load();await this.reconcile(state,state.stopped);});}
}
