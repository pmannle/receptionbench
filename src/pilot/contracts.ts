import { z } from 'zod/v3';
const id=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const cents=z.number().int().nonnegative().max(100000);
const epoch=z.number().int().nonnegative();
export const PilotPlanBodySchema=z.object({
  schemaVersion:z.literal('live-pilot-0.1'),profile:z.literal('booking-link-pstn-smoke'),id,kind:z.enum(['readiness','scored']),
  authorizedUntil:epoch,configDigest:z.string().regex(/^[a-f0-9]{64}$/),
  caller:z.object({recipientName:z.string().min(1).max(100)}).strict(),
  oracle:z.object({bookingUrl:z.string().url().refine(s=>{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;})}).strict(),
  reservationCents:cents.refine(n=>n>0),
  limits:z.object({callSeconds:z.literal(120),settleSeconds:z.literal(60),quarantineSeconds:z.literal(300),maxTurns:z.literal(4),maxRedials:z.literal(0)}).strict()
}).strict();
export const PilotPlanSchema=PilotPlanBodySchema.extend({digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type PilotPlan=z.infer<typeof PilotPlanSchema>;
export const PilotRunSchema=z.object({
  plan:PilotPlanSchema,admittedAt:epoch,deadlineAt:epoch,settleUntil:epoch,quarantineUntil:epoch,
  dispatch:z.enum(['pending','intent','unknown','confirmed']),callId:z.string().regex(/^CA[a-f0-9]{32}$/).optional(),
  callTerminal:z.boolean(),cleanupComplete:z.boolean(),observationHealthy:z.boolean(),callerLimited:z.boolean(),
  costCents:cents.nullable(),callerStage:z.enum(['greeting','request','consent','done']),turns:z.number().int().min(0).max(4),
  receipts:z.array(z.object({id:z.string(),from:z.string(),to:z.string(),body:z.string().max(16384),receivedAt:epoch,source:z.enum(['webhook','reconciliation'])}).strict()).max(100),
  webhookDigests:z.record(z.string()),callbackReplies:z.record(z.string()),lastCallSequence:z.number().int(),
  errors:z.array(z.string().max(100)).max(100),evidenceRefs:z.array(z.string()).max(500)
}).strict();
export type PilotRun=z.infer<typeof PilotRunSchema>;
export const PilotStateSchema=z.object({schemaVersion:z.literal('live-pilot-0.1'),version:z.number().int().nonnegative(),budgetCents:cents,setupCents:cents,stopped:z.boolean(),runs:z.array(PilotRunSchema).max(20)}).strict();
export type PilotState=z.infer<typeof PilotStateSchema>;
export function currentRun(state:PilotState):PilotRun {const run=state.runs.at(-1);if(!run)throw new Error('No admitted pilot');return run;}
