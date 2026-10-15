import { z } from 'zod/v3';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ContextSchema, FixtureSchema, ScenarioSchema, DescriptionSchema, PreparedSchema, SnapshotSchema, EventSchema, effectTypes, validateScenario, type EvidenceEvent, type TrialContext } from './schemas.js';
import { fixture, scenarios } from './fixtures.js';
import { FakeAdapter, FaultSchema } from './fake.js';
import { EvidenceStore, type IngressIdentity } from './evidence.js';
import { evaluate, type TrialResult } from './evaluator.js';
import { score } from './scoring.js';
import { writeReports } from './reports.js';
import { hash } from './hash.js';
const evaluatorVersion = 'evaluator-0.1.0';
const PlanBodySchema = z.object({
  schemaVersion:z.literal('0.1'), suiteId:z.literal('core-offline-v0.1'), profile:z.literal('core-offline'),transport:z.literal('fake'),track:z.literal('deterministic'),
  repetitions:z.number().int().min(1).max(1000),seed:z.number().int().min(0).max(2147483647),fault:FaultSchema,
  limits:z.object({maxTrials:z.literal(10000),maxCostUsd:z.literal(0),maxCalls:z.literal(0),maxMessages:z.literal(0),maxModelTokens:z.literal(0),maxRetries:z.literal(0)}).strict(),
  fixture:FixtureSchema,scenarios:z.array(ScenarioSchema).length(10), suiteDigest:z.string(),adapterConfigDigest:z.string(), evaluatorVersion:z.literal(evaluatorVersion),
  exclusionRule:z.literal('infra_error and inconclusive excluded; unsupported fails'), completionGate:z.literal(0.95)
}).strict();
export const PlanSchema = PlanBodySchema.extend({ digest:z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type RunPlan = z.infer<typeof PlanSchema>;
export function plan(options: { repetitions?:number;seed?:number;fault?:z.infer<typeof FaultSchema>;transport?:'fake' } = {}): RunPlan {
  const body = PlanBodySchema.parse({ schemaVersion:'0.1',suiteId:'core-offline-v0.1',profile:'core-offline',transport:options.transport ?? 'fake',track:'deterministic',
    repetitions:options.repetitions ?? 1,seed:options.seed ?? 42,fault:options.fault ?? 'none',
    limits:{maxTrials:10000,maxCostUsd:0,maxCalls:0,maxMessages:0,maxModelTokens:0,maxRetries:0},
    fixture:structuredClone(fixture),scenarios:structuredClone(scenarios),suiteDigest:hash(scenarios),adapterConfigDigest:hash({adapter:'fake',fault:options.fault ?? 'none'}),
    evaluatorVersion,exclusionRule:'infra_error and inconclusive excluded; unsupported fails',completionGate:0.95 });
  return { ...body,digest:hash(body) };
}
function admit(input: unknown): RunPlan {
  const p=PlanSchema.parse(input), { digest,...body }=p;
  if (hash(body)!==digest || hash(p.scenarios)!==p.suiteDigest || hash({adapter:'fake',fault:p.fault})!==p.adapterConfigDigest) throw new Error('Plan digest mismatch');
  if (p.repetitions*p.scenarios.length>p.limits.maxTrials) throw new Error('Budget admission exhausted');
  if (new Set(p.scenarios.map(s=>s.id)).size!==p.scenarios.length) throw new Error('Duplicate scenario ID');
  for (const s of p.scenarios) validateScenario(s,p.fixture);
  return p;
}
const sinkIdentity: IngressIdentity = { producerId:'simulated-sink',authority:'benchmark-sink',types:[...effectTypes,'observation.closed','cleanup.result'] };
const vendorIdentity: IngressIdentity = { producerId:'fake-vendor',authority:'vendor',types:['message.accepted','tool.intent','tool.result','speech.turn'] };
const TrialRecordSchema=z.object({scenarioId:z.string(),context:ContextSchema,events:z.array(EventSchema).max(1000),evidenceDigest:z.string(),cleanupComplete:z.boolean(),infrastructureError:z.boolean(),vendorFailure:z.boolean(),unsupported:z.boolean()}).strict();
type TrialRecord=z.infer<typeof TrialRecordSchema>;
const ManifestSchema=z.object({runId:z.string(),planDigest:z.string(),suiteDigest:z.string(),fixtureDigest:z.string(),evaluatorVersion:z.literal(evaluatorVersion),adapterVersion:z.string(),systemVersion:z.string(),capabilities:z.array(z.string()),transport:z.literal('fake'),observationMode:z.literal('instrumented'),costUsd:z.literal(0),sourceDigest:z.string(),dependencyDigest:z.string(),startedAt:z.string(),finishedAt:z.string(),locale:z.literal('en-US'),region:z.literal('local'),audio:z.literal('none-simulation'),callerPolicy:z.literal('finite-request-v0.1'),retention:z.literal('local synthetic artifacts; operator deletes'),state:z.enum(['completed','infrastructure_failed'])}).strict();
function result(p:RunPlan,t:TrialRecord): TrialResult {
  const s=p.scenarios.find(s=>s.id===t.scenarioId); if (!s) throw new Error('Unknown scenario');
  const base=evaluate(s,t.events,t.context);
  if (t.infrastructureError || !t.cleanupComplete) return {...base,verdict:'infra_error',reasons:[...base.reasons,!t.cleanupComplete?'cleanup_failed':'adapter_execution_error']};
  if (t.vendorFailure) return {...base,verdict:'fail',reasons:[...base.reasons,'vendor_execution_error']};
  if (t.unsupported) return {...base,verdict:'unsupported',reasons:['required_capability_unsupported']};
  return base;
}
function report(p:RunPlan,manifest:z.infer<typeof ManifestSchema>,trials:TrialRecord[]) {
  const results=trials.map(t=>result(p,t));
  return {schemaVersion:'0.1',label:'Internal research · offline simulation',manifest,score:score(p.scenarios,results),trials:results,
    evidenceCoverage:trials.map(t=>({trialId:t.context.trialId,events:t.events.length,hash:t.evidenceDigest})),
    limitations:['No actual audio, calls, messages, booking store or model executed.','No independent certification or live safety badge.','Aggregate bootstrap, paired comparison and measured audio metrics deferred to M4.'],
    metrics:{latency:null,taskDuration:null,transferMedia:'simulated',delivery:'simulated',costUsd:0}};
}
export type Report=ReturnType<typeof report>;
const BundleSchema=z.object({schemaVersion:z.literal('0.1'),plan:PlanSchema,manifest:ManifestSchema,trials:z.array(TrialRecordSchema).max(10000),report:z.unknown(),digest:z.string()}).strict();
export interface Bundle {schemaVersion:'0.1';plan:RunPlan;manifest:z.infer<typeof ManifestSchema>;trials:TrialRecord[];report:Report;digest:string}
function ctxFor(p:RunPlan,runId:string,index:number): TrialContext {
  return {trialId:`trial-${index}`,namespace:`${runId}.trial-${index}`,idempotencyKey:hash({run:runId,plan:p.digest,index}).slice(0,40),deadline:'2026-01-15T18:02:00.000Z'};
}
function event(ctx:TrialContext,sequence:number,type:EvidenceEvent['type'],payload:Record<string,unknown>,atMs:number,identity:IngressIdentity):EvidenceEvent {
  const time=new Date(Date.parse('2026-01-15T18:00:00.000Z')+atMs).toISOString();
  return EventSchema.parse({schemaVersion:'0.1',eventId:`event-${sequence}`,trialId:ctx.trialId,namespace:ctx.namespace,correlationId:ctx.idempotencyKey,producerId:identity.producerId,sequence,occurredAt:time,receivedAt:time,monotonicMs:atMs,type,authority:identity.authority,payload,evidenceRefs:[`synthetic:${ctx.trialId}:${sequence}`]});
}
export async function run(input:unknown,outDir:string):Promise<Bundle> {
  const p=admit(input); // Admission occurs before any adapter or filesystem side effects.
  mkdirSync(outDir,{recursive:true,mode:0o700});writeFileSync(join(outDir,'run.lock'),p.digest,{flag:'wx',mode:0o600});
  const startedAt=new Date().toISOString(),runId=`run-${randomUUID()}`,adapter=new FakeAdapter(p.fault),description=DescriptionSchema.parse(await adapter.describe());
  const trials:TrialRecord[]=[];
  for (let index=0;index<p.scenarios.length*p.repetitions;index++) {
    const s=p.scenarios[index%p.scenarios.length]!,ctx=ctxFor(p,runId,index);
    const store=await EvidenceStore.open(join(outDir,`${ctx.trialId}.sqlite`),ctx);
    let targetId:string|undefined,infrastructureError=false,vendorFailure=false,cleanupComplete=false;
    let stage:'adapter'|'collector'='adapter';
    const unsupported=s.requires.some(c=>!description.capabilities.includes(c)); let seq=0;
    try {
      if (!unsupported) {
        const prepared=PreparedSchema.parse(await adapter.prepare(ctx,structuredClone(p.fixture))); targetId=prepared.targetId;
        if (prepared.fixtureReceiptHash!==p.fixture.contentHash) throw new Error('Fixture mismatch');
        if (!(await adapter.health(ctx,targetId)).ready) throw new Error('Not ready');
        // Simulated environment executes proposed effects. Adapter gets caller request only, never oracle.
        const effects=await adapter.respond(ctx,targetId,structuredClone(s.request));
        stage='collector';
        for (const effect of effects) {
          const identity=effect.type==='message.accepted'?vendorIdentity:sinkIdentity;
          store.ingest(event(ctx,++seq,effect.type,effect.payload,effect.atMs??seq*1000,identity),identity);
        }
        stage='adapter';SnapshotSchema.parse(await adapter.snapshot(ctx,targetId));stage='collector';
        if (p.fault!=='missing-evidence') store.ingest(event(ctx,++seq,'observation.closed',{throughMs:s.limits.durationMs+s.limits.settleMs,healthy:true},s.limits.durationMs+s.limits.settleMs,sinkIdentity),sinkIdentity);
      }
    } catch { if(stage==='adapter')vendorFailure=true;else infrastructureError=true; }
    finally {
      try {cleanupComplete=targetId?(await adapter.cleanup(ctx,targetId)).complete:true;} catch {cleanupComplete=false;}
      store.ingest(event(ctx,++seq,'cleanup.result',{complete:cleanupComplete},120000,sinkIdentity),sinkIdentity);
    }
    const events=store.events();store.close();
    trials.push({scenarioId:s.id,context:ctx,events,evidenceDigest:hash(events),cleanupComplete,infrastructureError,vendorFailure,unsupported});
    writeFileSync(join(outDir,'checkpoint.json'),JSON.stringify({planDigest:p.digest,trials}),{mode:0o600});
  }
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const sourceDigest=hash(readdirSync(join(root,'src')).filter(f=>f.endsWith('.ts')).sort().map(f=>[f,readFileSync(join(root,'src',f),'utf8')]));
  const manifest:Bundle['manifest']={runId,planDigest:p.digest,suiteDigest:p.suiteDigest,fixtureDigest:p.fixture.contentHash,evaluatorVersion,adapterVersion:description.adapterVersion,systemVersion:description.systemVersion,capabilities:description.capabilities,transport:'fake',observationMode:'instrumented',costUsd:0,sourceDigest,dependencyDigest:hash(readFileSync(join(root,'package-lock.json'),'utf8')),startedAt,finishedAt:new Date().toISOString(),locale:'en-US',region:'local',audio:'none-simulation',callerPolicy:'finite-request-v0.1',retention:'local synthetic artifacts; operator deletes',state:trials.some(t=>t.infrastructureError||!t.cleanupComplete)?'infrastructure_failed':'completed'};
  const body={schemaVersion:'0.1' as const,plan:p,manifest,trials,report:report(p,manifest,trials)};
  const bundle:Bundle={...body,digest:hash(body)};
  writeFileSync(join(outDir,'bundle.json'),JSON.stringify(bundle,null,2)+'\n',{mode:0o600});writeReports(outDir,bundle.report);return bundle;
}
export function replay(input:unknown):Report {
  const b=BundleSchema.parse(input),{digest,...body}=b;
  if (hash(body)!==digest) throw new Error('Bundle digest mismatch');
  const p=admit(b.plan);
  if(b.manifest.planDigest!==p.digest||b.manifest.suiteDigest!==p.suiteDigest||b.manifest.fixtureDigest!==p.fixture.contentHash) throw new Error('Manifest digest mismatch');
  if(b.trials.length!==p.scenarios.length*p.repetitions) throw new Error('Scheduled trial roster incomplete');
  for (let i=0;i<b.trials.length;i++) {
    const t=b.trials[i]!;
    if(t.scenarioId!==p.scenarios[i%p.scenarios.length]!.id||hash(t.context)!==hash(ctxFor(p,b.manifest.runId,i))) throw new Error('Trial roster or scope mismatch');
    if(hash(t.events)!==t.evidenceDigest) throw new Error('Evidence digest mismatch');
    const seen=new Map<string,string>();
    for(const e of t.events) {
      const identity=e.producerId===sinkIdentity.producerId?sinkIdentity:e.producerId===vendorIdentity.producerId?vendorIdentity:undefined;
      if(!identity||e.authority!==identity.authority||!identity.types.includes(e.type)) throw new Error('Replay ingress identity or authority mismatch');
      const key=`${e.producerId}:${e.eventId}`,prior=seen.get(key);
      if(prior&&prior!==hash(e)) throw new Error('Replay conflict');seen.set(key,hash(e));
    }
  }
  return report(p,b.manifest,b.trials);
}
