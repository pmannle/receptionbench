import {z} from 'zod/v3';
import {hash} from './hash.js';
import {wilson} from './scoring.js';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const text=z.string().min(1).max(500).refine(s=>!/[<>]|mailto:|\b(?:sk_|ghp_|AC[a-f0-9]{32})|\+\d[\d ().-]{8,}/i.test(s),'Unsafe public text');
const count=z.number().int().nonnegative().max(1000000);
const CountsSchema=z.object({scheduled:count.refine(n=>n>0),pass:count,fail:count,inconclusive:count,infra_error:count,unsupported:count}).strict();
const url=z.string().url().refine(s=>{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&!/^localhost$|^\d|:|\.local$|\.internal$/i.test(u.hostname);},'Unsafe artifact URL');
const CohortSchema=z.object({suiteDigest:digest,evaluatorVersion:text,profile:text,transport:z.enum(['pstn','webrtc','sip']),language:text,callerPolicy:text,observationMode:z.enum(['black-box','instrumented']),track:z.enum(['deterministic','adversarial'])}).strict();
const EntrySchema=z.object({
 id:z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),system:z.object({name:text,version:text}).strict(),date:z.string().datetime(),cohort:CohortSchema,cohortDigest:digest,
 ranked:z.literal(false),evidenceLevel:z.enum(['self-reported','benchmark-operated','independently-audited']),operator:text,reviewer:text,relationship:text,
 publication:z.object({approved:z.literal(true),approvedAt:z.string().datetime(),reference:url}).strict(),
 counts:CountsSchema,scenarioResults:z.array(z.object({id:text,counts:CountsSchema,wilson95:z.tuple([z.number().min(0).max(1),z.number().min(0).max(1)])}).strict()).min(1),
 criticalViolations:count,evidenceCoverage:z.number().min(0).max(1),costs:z.object({currency:z.literal('USD'),knownCents:count.nullable(),uncertain:z.boolean()}).strict(),
 reportDigest:digest,artifacts:z.array(z.discriminatedUnion('access',[
  z.object({access:z.literal('public'),digest,url}).strict(),
  z.object({access:z.literal('restricted'),digest,instructions:text}).strict()
 ])).min(1).max(20)
}).strict().superRefine((entry,ctx)=>{
 if(hash(entry.cohort)!==entry.cohortDigest)ctx.addIssue({code:'custom',message:'Cohort digest mismatch'});
 const {scheduled,...counts}=entry.counts;if(Object.values(counts).reduce((a,b)=>a+b,0)!==scheduled)ctx.addIssue({code:'custom',message:'Scheduled count mismatch'});
 for(const key of Object.keys(entry.counts) as (keyof typeof entry.counts)[])if(entry.scenarioResults.reduce((sum,s)=>sum+s.counts[key],0)!==entry.counts[key])ctx.addIssue({code:'custom',message:'Scenario count mismatch'});
 if(new Set(entry.scenarioResults.map(s=>s.id)).size!==entry.scenarioResults.length)ctx.addIssue({code:'custom',message:'Duplicate scenario result'});
 for(const scenario of entry.scenarioResults){
  const {scheduled,...counts}=scenario.counts;
  if(Object.values(counts).reduce((a,b)=>a+b,0)!==scheduled)ctx.addIssue({code:'custom',message:'Scenario denominator mismatch'});
  const interval=wilson(counts.pass,counts.pass+counts.fail+counts.unsupported);
  if(scenario.wilson95.some((n,i)=>Math.abs(n-interval[i]!)>1e-9))ctx.addIssue({code:'custom',message:'Scenario interval mismatch'});
 }
});
export const ResultsRegistrySchema=z.object({schemaVersion:z.literal('results-registry-0.1'),entries:z.array(EntrySchema).max(1000)}).strict().superRefine((r,ctx)=>{
 if(new Set(r.entries.map(e=>e.id)).size!==r.entries.length)ctx.addIssue({code:'custom',message:'Duplicate result identifier'});
});
export type ResultsRegistry=z.infer<typeof ResultsRegistrySchema>;
export function validateResultsRegistry(input:unknown):ResultsRegistry{return ResultsRegistrySchema.parse(input);}
