import {z} from 'zod/v3';
import {hash} from '../hash.js';
import {PilotPlanSchema,PilotStateSchema,ReconciliationSchema,currentRun,type PilotPlan,type PilotState,type PilotReconciliation} from './contracts.js';
export function reconcilePilotEvidence(input:PilotState,snapshotInput:PilotReconciliation):PilotState {
 const state=PilotStateSchema.parse(input),snapshot=ReconciliationSchema.parse(snapshotInput),run=currentRun(state),config=snapshot.config;
 if(hash(config)!==run.plan.configDigest||snapshot.call.id!==run.callId||snapshot.call.from!==config.callerNumber||snapshot.call.to!==config.targetNumber)throw new Error('Reconciliation scope mismatch');
 if(snapshot.atMs<run.admittedAt)throw new Error('Invalid reconciliation clock');
 run.reconciliation=snapshot;run.callTerminal=snapshot.call.terminal;run.cleanupComplete=snapshot.call.terminal;
 let healthy=snapshot.atMs>=run.quarantineUntil&&snapshot.call.terminal&&run.errors.length===0;
 const byId=new Map(run.receipts.map(r=>[r.id,r]));
 if(byId.size!==run.receipts.length||new Set(snapshot.messages.map(m=>m.id)).size!==snapshot.messages.length)healthy=false;
 for(const message of snapshot.messages){
  if(message.from!==config.expectedSender||message.to!==config.callerNumber||message.sentAt<run.admittedAt||message.sentAt>run.quarantineUntil){healthy=false;continue;}
  const existing=byId.get(message.id);
  if(!existing){run.receipts.push({id:message.id,from:message.from,to:message.to,body:message.body,receivedAt:snapshot.atMs,source:'reconciliation'});healthy=false;}
  else if(existing.body!==message.body||existing.from!==message.from||existing.to!==message.to||existing.source!=='webhook')healthy=false;
 }
 if(run.receipts.some(r=>!snapshot.messages.some(m=>m.id===r.id)||r.from!==config.expectedSender||r.to!==config.callerNumber))healthy=false;
 run.observationHealthy=healthy;
 // Preserve the full conservative reservation permanently, even after usage
 // reconciliation. Provider and target-side delayed charges are not known totals.
 run.budgetHoldFinal=snapshot.atMs>=run.quarantineUntil&&snapshot.call.terminal;
 state.version++;return PilotStateSchema.parse(state);
}
export const PilotResultSchema=z.object({
 schemaVersion:z.literal('pilot-result-0.1'),profile:z.literal('booking-link-pstn-smoke'),transport:z.literal('pstn'),
 kind:z.enum(['readiness','scored']),label:z.literal('Internal research · benchmark-operated pilot'),ranked:z.literal(false),
 pilotId:z.string(),planDigest:z.string(),configurationDigest:z.string(),evidenceDigest:z.string(),
 verdict:z.enum(['pass','fail','inconclusive','infra_error','readiness_pass','readiness_fail']),reasons:z.array(z.string()),
 counts:z.object({scheduled:z.number(),valid:z.number(),pass:z.number(),fail:z.number()}).strict(),
 cleanupComplete:z.boolean(),observationHealthy:z.boolean(),callerPolicy:z.literal('twiml-bounded-v0.1'),callerLimited:z.boolean(),
 costs:z.object({currency:z.literal('USD'),reservationCents:z.number(),knownSubaccountCostCents:z.number().nullable(),finalCostCents:z.null(),uncertain:z.literal(true)}).strict(),
 limitations:z.array(z.string())
}).strict();
export type PilotResult=z.infer<typeof PilotResultSchema>;
export function evaluatePilot(planInput:PilotPlan,stateInput:PilotState):PilotResult {
 const plan=PilotPlanSchema.parse(planInput),state=PilotStateSchema.parse(stateInput),run=currentRun(state),{digest,...body}=plan;
 if(hash(body)!==digest||hash(plan)!==hash(run.plan))throw new Error('Pilot plan digest/scope mismatch');
 let verdict:PilotResult['verdict']='inconclusive',reasons:string[]=[];
 const snapshot=run.reconciliation;
 if(!snapshot){reasons=['missing_provider_reconciliation'];}
 else{
  const rebuilt=currentRun(reconcilePilotEvidence(state,snapshot));
  const config=snapshot.config;
  if(!run.cleanupComplete||!run.callTerminal||!rebuilt.cleanupComplete){verdict='infra_error';reasons=['cleanup_incomplete'];}
  else if(['failed','busy','no-answer','canceled'].includes(snapshot.call.status)){verdict='fail';reasons=['target_did_not_answer'];}
  else if(plan.kind==='readiness'){
   verdict=rebuilt.observationHealthy&&!run.callerLimited&&run.callerStage==='done'?'readiness_pass':'readiness_fail';reasons=['unscored_greeting_check'];
  }else{
   const receipts=run.receipts;
   const urls=receipts.flatMap(r=>(r.body.match(/https?:\/\/[^\s<>"']+/g)??[]).map(s=>s.replace(/[.,;!]+$/,'')));
   const failures=[
    ...(receipts.some(r=>r.from!==config.expectedSender||r.to!==config.callerNumber)?['wrong_recipient_or_sender']:[]),
    ...(receipts.length>1?['duplicate_messages']:[]),
    ...(receipts.some(r=>r.source==='webhook'&&r.receivedAt>run.deadlineAt)?['late_delivery']:[]),
    ...(receipts.length&&!(urls.length===1&&urls[0]===plan.oracle.bookingUrl)?['wrong_booking_url']:[])
   ];
   if(failures.length){verdict='fail';reasons=failures;}
   else if(!rebuilt.observationHealthy||!run.observationHealthy){reasons=['incomplete_receipt_observation'];}
   else if(run.callerLimited||run.callerStage!=='done'){reasons=['caller_protocol_limitation'];}
   else if(!receipts.length){verdict='fail';reasons=['no_booking_link_received'];}
   else{verdict='pass';reasons=['independent_booking_link_receipt'];}
  }
 }
 const valid=plan.kind==='scored'&&['pass','fail'].includes(verdict)?1:0;
 return PilotResultSchema.parse({schemaVersion:'pilot-result-0.1',profile:'booking-link-pstn-smoke',transport:'pstn',kind:plan.kind,label:'Internal research · benchmark-operated pilot',ranked:false,pilotId:plan.id,planDigest:plan.digest,configurationDigest:plan.configDigest,evidenceDigest:hash(state),verdict,reasons,counts:{scheduled:plan.kind==='scored'?1:0,valid,pass:verdict==='pass'?1:0,fail:verdict==='fail'?1:0},cleanupComplete:run.cleanupComplete,observationHealthy:run.observationHealthy,callerPolicy:'twiml-bounded-v0.1',callerLimited:run.callerLimited,costs:{currency:'USD',reservationCents:plan.reservationCents,knownSubaccountCostCents:snapshot?.knownProviderCostCents??null,finalCostCents:null,uncertain:true},limitations:['Single-task pilot; no aggregate rank or independent certification.','Turn-based caller; no full-duplex or transfer-media claim.','Receipt at a controlled endpoint does not establish human reading.','Provider usage may lag; target model charges are unmeasured and the full reservation remains consumed.','Evidence custody is operator-controlled; digests are integrity checks, not external attestation.','Only declared externally observable effects are evaluated.']});
}
