import {z} from 'zod/v3';
import {hash} from '../../../src/hash.js';
import {PilotPlanSchema,PilotStateSchema,currentRun,type PilotState} from '../../../src/pilot/contracts.js';
import {initialPilotState,admitPilot,markDispatchIntent,markDispatchUnknown,bindCall,purgeExpiredPilotState} from '../../../src/pilot/state.js';
import {verifyWebhook,ingestReceipt} from '../../../src/pilot/receipts.js';
import {nextCallerTurn,renderTwiml,callerReplyAllowed,type CallerAction} from '../../../src/pilot/caller.js';
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
 private provider(config=this.config()){return new TwilioPilotProvider({...config,authToken:this.env.TWILIO_AUTH_TOKEN});}
 private async load():Promise<PilotState>{
  const state=PilotStateSchema.parse(await this.ctx.storage.get('state')??initialPilotState(Number(this.env.BUDGET_CENTS),Number(this.env.SETUP_CENTS)));
  const purged=purgeExpiredPilotState(state,Date.now());if(purged.version!==state.version){await this.save(purged);await this.schedule(purged);}return purged;
 }
 private async save(state:PilotState){await this.ctx.storage.put('state',PilotStateSchema.parse(state));}
 private async schedule(state:PilotState,checkAt?:number){const times=state.runs.map(r=>r.retainedUntil);if(checkAt!==undefined)times.push(checkAt);if(times.length)await this.ctx.storage.setAlarm(Math.min(...times));else await this.ctx.storage.deleteAlarm();}
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
   currentRun(state).boundConfig=this.config();await this.save(state);await this.schedule(state,now+120000);return json({id:plan.id,planDigest:plan.digest},201);
  }
  if(path.startsWith('/webhooks/twilio/'))return this.webhook(request,state,now);
  if(path==='/operator/stop'&&request.method==='POST'){
   state.stopped=true;state.version++;await this.save(state);await this.reconcile(state,true,true);return json({stopped:true},202);
  }
  if(path==='/internal/tick'&&request.method==='POST'){await this.reconcile(state,state.stopped);return json({checked:true});}
  const match=path.match(/^\/operator\/pilots\/([a-zA-Z0-9_-]+)(?:\/(start|reconcile|export|result))?$/);
  if(!match||!state.runs.length||currentRun(state).plan.id!==match[1])return json({error:'not_found'},404);
  if(request.method==='GET'&&!match[2])return json(state);
  if(request.method==='GET'&&match[2]==='export')return json(createPilotBundle(state));
  if(request.method==='GET'&&match[2]==='result')return json(evaluatePilot(currentRun(state).plan,state));
  if(request.method==='POST'&&match[2]==='reconcile'){await this.reconcile(state,state.stopped);return json(await this.load());}
  if(request.method==='POST'&&match[2]==='start'){
   if(hash(this.config())!==currentRun(state).plan.configDigest)return json({error:'configuration_changed'},409);
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
  const c=state.runs.length?(currentRun(state).boundConfig??this.config()):this.config();let receipt;
  try{receipt=await verifyWebhook(request,{canonicalOrigin:this.env.CANONICAL_ORIGIN,accountSid:c.accountSid,authToken:this.env.TWILIO_AUTH_TOKEN});}catch{return json({error:'invalid_webhook'},403);}
  if(receipt.kind==='reject')return receipt.form.To===c.callerNumber?this.xml('<?xml version="1.0"?><Response><Reject reason="busy"/></Response>'):json({error:'wrong_destination'},403);
  if(!state.runs.length)return json({error:'no_active_lease'},409);
  let run=currentRun(state);
  if(receipt.kind!=='sms'&&!run.callId&&['intent','unknown'].includes(run.dispatch)&&receipt.pilotId===run.plan.id&&receipt.form.From===c.callerNumber&&receipt.form.To===c.targetNumber){
   try{state=bindCall(state,receipt.form.CallSid!);run=currentRun(state);}catch{return json({error:'binding_rejected'},409);}
  }
  if(run.dispatch==='pending')return json({error:'call_not_dispatched'},409);
  if(receipt.kind==='voice'||receipt.kind==='speech'){
   if(receipt.pilotId!==run.plan.id||receipt.form.CallSid!==run.callId||receipt.form.From!==c.callerNumber||receipt.form.To!==c.targetNumber)return json({error:'callback_scope_rejected'},409);
   if(!callerReplyAllowed({stopped:state.stopped,deadlineAt:run.deadlineAt,quarantineUntil:run.quarantineUntil},now))return this.xml('<?xml version="1.0"?><Response><Hangup/></Response>');
  }
  const cached=run.callbackReplies[receipt.digest];if(cached)return this.xml(cached);
  try{state=ingestReceipt(state,receipt,c,now);}catch(error){
   if(error instanceof Error&&error.message.includes('replay conflict')){run.errors.push('callback_replay_conflict');run.observationHealthy=false;await this.save(state);}return json({error:'callback_rejected'},409);
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
 private async reconcile(state:PilotState,stop:boolean,forceStop=false):Promise<void>{
  if(!state.runs.length)return;
  let run=currentRun(state);const now=Date.now(),c=run.boundConfig??this.config(),provider=this.provider(c);
  if(run.reconciliation&&run.cleanupComplete){await this.schedule(state);return;}
  const terminationDue=(stop||now>=run.deadlineAt)&&!run.cleanupComplete;
  const canTerminate=terminationDue&&(forceStop||run.terminationAttempts<10);
  if(run.reconciliationAttempts>=10&&!canTerminate){await this.schedule(state,now<run.deadlineAt?run.deadlineAt:undefined);return;}
  if(terminationDue&&!canTerminate){await this.schedule(state);return;}
  try{
   if(canTerminate){run.terminationAttempts=Math.min(10,run.terminationAttempts+1);await this.save(state);}
   if(!run.callId&&['intent','unknown'].includes(run.dispatch)){
    const calls=await provider.findCalls(c.callerNumber,c.targetNumber,run.admittedAt);
    if(calls.length!==1)throw new Error('Dispatch still ambiguous');
    state=bindCall(state,calls[0]!.id);run=currentRun(state);
   }
   if(run.callId){
    let call=await provider.getCall(run.callId);
    if(call.from!==c.callerNumber||call.to!==c.targetNumber)throw new Error('Call scope mismatch');
    if(!call.terminal&&canTerminate){await provider.stopCall(run.callId);call=await provider.getCall(run.callId);}
    run.callTerminal=call.terminal;run.cleanupComplete=call.terminal;
   }else if(run.dispatch==='pending'&&(stop||now>=run.deadlineAt)){run.callTerminal=true;run.cleanupComplete=true;run.callerLimited=true;}
   if(run.callId&&run.cleanupComplete&&now>=run.quarantineUntil){
    const call=await provider.getCall(run.callId);
    const messages=await provider.listReceipts({from:c.expectedSender,to:c.callerNumber,sinceMs:run.admittedAt,untilMs:run.quarantineUntil});
    let knownProviderCostCents:number|null=null;
    try{knownProviderCostCents=(await provider.reconcileUsage({from:c.callerNumber,to:c.targetNumber,sinceMs:run.admittedAt,untilMs:now})).costCents;}catch{}
    const snapshot={atMs:now,config:c,call,messages,knownProviderCostCents};
    const key=`raw/${run.plan.id}/reconciliation-${now}.json`;
    await this.env.EVIDENCE.put(key,JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'}});
    state=reconcilePilotEvidence(state,snapshot);run=currentRun(state);run.evidenceRefs.push(key);
   }
   run.reconciliationAttempts=0;state.version++;await this.save(state);
   await this.schedule(state,(!run.cleanupComplete||now<run.quarantineUntil)?Math.max(now+1000,Math.min(now+60000,run.quarantineUntil)):undefined);
  }catch{
   run=currentRun(state);run.reconciliationAttempts=Math.min(10,run.reconciliationAttempts+1);
   if(!run.errors.includes('reconciliation_unavailable'))run.errors.push('reconciliation_unavailable');run.observationHealthy=false;await this.save(state);
   const retry=run.reconciliationAttempts<10||((stop||now>=run.deadlineAt)&&run.terminationAttempts<10);
   await this.schedule(state,retry?now+60000:(now<run.deadlineAt?run.deadlineAt:undefined));
  }
 }

 async alarm(){await this.ctx.blockConcurrencyWhile(async()=>{const state=await this.load();await this.reconcile(state,state.stopped);});}
}
