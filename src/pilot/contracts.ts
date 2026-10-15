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
  limits:z.object({callSeconds:z.literal(120),settleSeconds:z.literal(60),quarantineSeconds:z.literal(300),retentionSeconds:z.literal(604800),maxTurns:z.literal(4),maxRedials:z.literal(0)}).strict()
}).strict();
export const PilotPlanSchema=PilotPlanBodySchema.extend({digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type PilotPlan=z.infer<typeof PilotPlanSchema>;
export const PilotEndpointConfigSchema=z.object({accountSid:z.string().regex(/^AC[a-f0-9]{32}$/),callerNumber:z.string().regex(/^\+[1-9]\d{7,14}$/),targetNumber:z.string().regex(/^\+[1-9]\d{7,14}$/),expectedSender:z.string().regex(/^\+[1-9]\d{7,14}$/)}).strict();
export const ReconciliationSchema=z.object({
 atMs:epoch,config:PilotEndpointConfigSchema,
 call:z.object({id:z.string().regex(/^CA[a-f0-9]{32}$/),from:z.string(),to:z.string(),status:z.enum(['queued','initiated','ringing','in-progress','completed','busy','failed','no-answer','canceled']),terminal:z.boolean(),price:z.string().nullable(),priceUnit:z.string().nullable(),durationSeconds:z.number().nonnegative().nullable()}).strict().refine(c=>c.terminal===['completed','busy','failed','no-answer','canceled'].includes(c.status),'Inconsistent terminal call status'),
 messages:z.array(z.object({id:z.string().regex(/^SM[a-f0-9]{32}$/),from:z.string(),to:z.string(),body:z.string().max(16384),sentAt:epoch,price:z.string().nullable(),priceUnit:z.string().nullable()}).strict()).max(100),knownProviderCostCents:cents.nullable()
}).strict();
export type PilotReconciliation=z.infer<typeof ReconciliationSchema>;
export const PilotRunSchema=z.object({
  plan:PilotPlanSchema,admittedAt:epoch,deadlineAt:epoch,settleUntil:epoch,quarantineUntil:epoch,retainedUntil:epoch,boundConfig:PilotEndpointConfigSchema.nullable().default(null),
  dispatch:z.enum(['pending','intent','unknown','confirmed']),callId:z.string().regex(/^CA[a-f0-9]{32}$/).optional(),
  callTerminal:z.boolean(),cleanupComplete:z.boolean(),observationHealthy:z.boolean(),callerLimited:z.boolean(),
  costCents:cents.nullable(),budgetHoldFinal:z.boolean().default(false),reconciliation:ReconciliationSchema.nullable().default(null),reconciliationAttempts:z.number().int().nonnegative().max(10).default(0),terminationAttempts:z.number().int().nonnegative().max(10).default(0),callerStage:z.enum(['greeting','request','consent','done']),turns:z.number().int().min(0).max(4),
  receipts:z.array(z.object({id:z.string(),from:z.string(),to:z.string(),body:z.string().max(16384),receivedAt:epoch,source:z.enum(['webhook','reconciliation'])}).strict()).max(100),
  webhookDigests:z.record(z.string()),callbackReplies:z.record(z.string()),lastCallSequence:z.number().int(),
  errors:z.array(z.string().max(100)).max(100),evidenceRefs:z.array(z.string()).max(500)
}).strict();
export type PilotRun=z.infer<typeof PilotRunSchema>;
export const PilotStateSchema=z.object({schemaVersion:z.literal('live-pilot-0.1'),version:z.number().int().nonnegative(),budgetCents:cents,setupCents:cents,stopped:z.boolean(),knownProviderUsage:z.record(z.number().int().nonnegative().safe()).default({}),retired:z.array(z.object({id,planDigest:z.string(),heldCents:cents,cleanupComplete:z.boolean()}).strict()).default([]),runs:z.array(PilotRunSchema).max(20)}).strict();
export type PilotState=z.infer<typeof PilotStateSchema>;
export function currentRun(state:PilotState):PilotRun {const run=state.runs.at(-1);if(!run)throw new Error('No admitted pilot');return run;}
