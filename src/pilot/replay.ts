import {z} from 'zod/v3';
import {hash} from '../hash.js';
import {PilotStateSchema,currentRun,type PilotState} from './contracts.js';
import {PilotResultSchema,evaluatePilot,reconcilePilotEvidence} from './evaluate.js';
const BundleSchema=z.object({schemaVersion:z.literal('pilot-bundle-0.1'),state:PilotStateSchema,result:PilotResultSchema,digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function createPilotBundle(input:PilotState){
 const state=PilotStateSchema.parse(input),body={schemaVersion:'pilot-bundle-0.1' as const,state,result:evaluatePilot(currentRun(state).plan,state)};
 return {...body,digest:hash(body)};
}
export function replayPilot(input:unknown){
 const bundle=BundleSchema.parse(input),{digest,...body}=bundle;if(hash(body)!==digest)throw new Error('Pilot bundle digest mismatch');
 const run=currentRun(bundle.state);
 if(run.reconciliation){
  const rebuilt=currentRun(reconcilePilotEvidence(bundle.state,run.reconciliation));
  for(const field of ['observationHealthy','cleanupComplete','callTerminal'] as const)if(run[field]!==rebuilt[field])throw new Error('Pilot closure replay mismatch');
 }
 const result=evaluatePilot(run.plan,bundle.state);if(hash(result)!==hash(bundle.result))throw new Error('Pilot result replay mismatch');return result;
}
