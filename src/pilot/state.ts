import { hash } from '../hash.js';
import { PilotPlanBodySchema,PilotPlanSchema,PilotStateSchema,currentRun,type PilotPlan,type PilotState } from './contracts.js';
export function freezePilotPlan(input:unknown):PilotPlan {
  const raw=input as Record<string,unknown>;
  const {digest:unused,...values}=raw;
  const body=PilotPlanBodySchema.parse({schemaVersion:'live-pilot-0.1',profile:'booking-link-pstn-smoke',limits:{callSeconds:120,settleSeconds:60,quarantineSeconds:300,maxTurns:4,maxRedials:0},...values});
  return {...body,digest:hash(body)};
}
export function initialPilotState(budgetCents:number,setupCents:number):PilotState {
  if(setupCents>budgetCents)throw new Error('Setup exceeds budget');
  return PilotStateSchema.parse({schemaVersion:'live-pilot-0.1',version:0,budgetCents,setupCents,stopped:false,runs:[]});
}
export function committedCents(state:PilotState):number {return state.setupCents+state.runs.reduce((sum,r)=>sum+(r.costCents??r.plan.reservationCents),0);}
export function admitPilot(input:unknown,stateInput:PilotState,nowMs:number):PilotState {
  const state=PilotStateSchema.parse(stateInput),plan=PilotPlanSchema.parse(input),{digest,...body}=plan;
  if(hash(body)!==digest)throw new Error('Plan digest mismatch');
  if(state.stopped)throw new Error('Pilot stopped');
  if(nowMs+480000>=plan.authorizedUntil)throw new Error('Authorization expired or too short');
  if(state.runs.some(r=>r.plan.id===plan.id))throw new Error('Duplicate pilot');
  if(state.runs.some(r=>!r.cleanupComplete||!r.callTerminal||(r.costCents===null&&!r.budgetHoldFinal)||nowMs<=r.quarantineUntil))throw new Error('Exclusive number lease retained');
  if(committedCents(state)+plan.reservationCents>state.budgetCents)throw new Error('Pilot budget exhausted');
  const next=structuredClone(state);next.version++;
  next.runs.push({plan,admittedAt:nowMs,deadlineAt:nowMs+120000,settleUntil:nowMs+180000,quarantineUntil:nowMs+480000,dispatch:'pending',callTerminal:false,cleanupComplete:false,observationHealthy:false,callerLimited:false,costCents:null,budgetHoldFinal:false,reconciliation:null,reconciliationAttempts:0,callerStage:'greeting',turns:0,receipts:[],webhookDigests:{},callbackReplies:{},lastCallSequence:-1,errors:[],evidenceRefs:[]});
  return PilotStateSchema.parse(next);
}
export function markDispatchIntent(input:PilotState,nowMs:number):PilotState {
  const state=PilotStateSchema.parse(input),run=currentRun(state);
  if(state.stopped)throw new Error('Pilot stopped');
  if(run.dispatch!=='pending')throw new Error('Call dispatch already attempted');
  if(nowMs>=run.deadlineAt)throw new Error('Call dispatch expired');
  run.dispatch='intent';state.version++;return state;
}
export function bindCall(input:PilotState,callId:string):PilotState {
  const state=PilotStateSchema.parse(input),run=currentRun(state);
  if(run.callId&&run.callId!==callId)throw new Error('Conflicting call binding');
  if(!['intent','unknown','confirmed'].includes(run.dispatch))throw new Error('No call dispatch intent');
  run.callId=callId;run.dispatch='confirmed';state.version++;return PilotStateSchema.parse(state);
}
export function markDispatchUnknown(input:PilotState):PilotState {const state=PilotStateSchema.parse(input);currentRun(state).dispatch='unknown';state.version++;return state;}
