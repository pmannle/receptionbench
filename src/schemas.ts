import { z } from 'zod/v3';
import { hash } from './hash.js';
export const VERSION = '0.1' as const;
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);
const text = z.string().min(1).max(4096);
const ms = z.number().finite().int().nonnegative().max(86400000);
const date = z.string().datetime({ offset: true });
export const CapabilitySchema = z.enum(['business.info', 'routing.team', 'booking.link', 'message.deliver', 'callback.request', 'callback.execute', 'transfer.warm', 'transfer.return', 'booking.mutate']);
export type Capability = z.infer<typeof CapabilitySchema>;
const authority = z.enum(['vendor', 'provider', 'benchmark-sink']);
export const FixtureSchema = z.object({
  schemaVersion: z.literal(VERSION), fixtureId: id, contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  publicFacts: z.object({ hours: text, businessName: text, timezone: text }).strict(),
  directory: z.array(z.object({ id, name: text, service: text, bookingUrl: z.string().url() }).strict()).min(1),
  policies: z.object({ requireTextConsent: z.literal(true), disclosePrivateContacts: z.literal(false) }).strict(),
  endpointRefs: z.array(id).min(1), allowedHosts: z.array(z.string().min(1)).min(1)
}).strict();
export type BusinessFixture = z.infer<typeof FixtureSchema>;
export const ContextSchema = z.object({ trialId: id, namespace: id, deadline: date, idempotencyKey: id }).strict();
export type TrialContext = z.infer<typeof ContextSchema>;
export const EndpointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('webrtc'), connectionRef: id }).strict(),
  z.object({ kind: z.literal('pstn'), numberRef: id }).strict(),
  z.object({ kind: z.literal('sip'), uriRef: id }).strict()
]);
export const PreparedSchema = z.object({ targetId: id, endpoint: EndpointSchema, fixtureReceiptHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const SnapshotSchema = z.object({ schemaVersion: z.literal(VERSION), observedAt: date, records: z.array(z.record(z.unknown())), evidenceRefs: z.array(text), unavailableFields: z.array(text) }).strict();
export const DescriptionSchema = z.object({ adapterVersion: text, systemVersion: text, capabilities: z.array(CapabilitySchema), observationMode: z.enum(['black-box', 'instrumented']) }).strict();
export interface ReceptionBenchAdapter {
  describe(): Promise<z.infer<typeof DescriptionSchema>>;
  prepare(ctx: TrialContext, fixture: BusinessFixture): Promise<z.infer<typeof PreparedSchema>>;
  health(ctx: TrialContext, targetId: string): Promise<{ ready: boolean }>;
  snapshot(ctx: TrialContext, targetId: string): Promise<z.infer<typeof SnapshotSchema>>;
  cleanup(ctx: TrialContext, targetId: string): Promise<{ complete: boolean }>;
}
const envelope = {
  schemaVersion: z.literal(VERSION), eventId: id, trialId: id, namespace: id, callId: id.optional(), legId: id.optional(),
  correlationId: id, parentEventId: id.optional(), producerId: id, sequence: z.number().int().nonnegative(),
  occurredAt: date, receivedAt: date, monotonicMs: ms, authority, evidenceRefs: z.array(text).min(1).max(20)
};
const recipient = { recipientRef: id };
const message = { ...recipient, messageId: id, content: text, url: z.string().url().optional() };
const transfer = { ...recipient, callerLegId: id, counterpartLegId: id };
const booking = { bookingId: id, ...recipient, service: text, start: date };
function event<T extends string, S extends z.ZodRawShape>(type: T, shape: S) {
  return z.object({ ...envelope, type: z.literal(type), payload: z.object(shape).strict() }).strict();
}
export const EventSchema = z.discriminatedUnion('type', [
  event('call.started', { callId: id }), event('call.answered', { callId: id }), event('call.ended', { callId: id, reason: text }),
  event('speech.turn', { role: z.enum(['caller', 'assistant', 'counterpart']), text }),
  event('tool.intent', { name: id }), event('tool.result', { name: id, success: z.boolean() }),
  event('fact.observed', { key: id, value: text }), event('routing.selected', { ...recipient, service: text }),
  event('message.accepted', message), event('message.delivered', message), event('message.failed', { ...recipient, messageId: id, reason: text }),
  event('callback.requested', { ...recipient, callerNumberRef: id, requestId: id, durable: z.boolean() }),
  event('callback.completed', { ...recipient, callerNumberRef: id, interactionConfirmed: z.boolean() }),
  event('transfer.requested', recipient), event('transfer.ringing', recipient), event('transfer.accepted', transfer),
  event('transfer.bridged', { ...transfer, callerNonceHeard: z.boolean(), counterpartNonceHeard: z.boolean() }),
  event('transfer.ended', { ...recipient, reason: text }),
  event('transfer.returned', { ...recipient, callerConnected: z.boolean(), audible: z.boolean(), contextRetained: z.boolean(), activeAgentCount: z.number().int().nonnegative() }),
  event('booking.created', booking), event('booking.changed', booking), event('booking.cancelled', { bookingId: id }),
  event('policy.refused', { reason: z.enum(['consent', 'private-contact', 'instruction-override']) }),
  event('private_contact.disclosed', { ...recipient, content: text }),
  event('cleanup.result', { complete: z.boolean() }),
  event('observation.closed', { throughMs: ms, healthy: z.boolean() })
]);
export type EvidenceEvent = z.infer<typeof EventSchema>;
export const effectTypes = ['fact.observed', 'routing.selected', 'message.delivered', 'callback.requested', 'callback.completed', 'transfer.requested', 'transfer.accepted', 'transfer.bridged', 'transfer.returned', 'booking.created', 'booking.changed', 'booking.cancelled', 'policy.refused', 'private_contact.disclosed'] as const;
const match = z.record(z.union([text, z.boolean(), z.number().finite()]));
export const AssertionSchema = z.object({ id, predicate: z.enum(effectTypes), authority,
  match, count: z.number().int().min(1).max(100), withinMs: ms
}).strict();
export const ForbiddenSchema = z.object({ id, predicate: z.enum(effectTypes), match, severity: z.enum(['normal', 'critical']) }).strict();
export const RequestSchema = z.object({
  action: z.enum(['facts', 'route', 'booking-link', 'message', 'callback', 'transfer', 'return', 'privacy']),
  recipientRef: id.optional(), service: text.optional(), content: text.optional(), consent: z.boolean().optional(), callerNumberRef: id.optional()
}).strict();
export type CallerRequest = z.infer<typeof RequestSchema>;
export const ScenarioSchema = z.object({
  schemaVersion: z.literal(VERSION), id, version: z.literal('1.0.0'), category: z.enum(['facts', 'routing', 'booking-link', 'messages', 'transfer', 'policy']),
  profile: z.literal('core-offline'), track: z.literal('deterministic'), fixtureId: id, requires: z.array(CapabilitySchema).min(1),
  clock: z.object({ businessTime: date, zone: text }).strict(),
  goal: text, request: RequestSchema, limits: z.object({ durationMs: ms, settleMs: ms, maxCostUsd: z.literal(0) }).strict(),
  resetStrategy: z.literal('fresh-namespace'), severity: z.enum(['normal', 'critical']),
  oracle: z.object({ all: z.array(AssertionSchema).min(1), forbidden: z.array(ForbiddenSchema) }).strict()
}).strict();
export type Scenario = z.infer<typeof ScenarioSchema>;
const payloadKeys: Record<typeof effectTypes[number], string[]> = {
  'fact.observed': ['key', 'value'], 'routing.selected': ['recipientRef','service'],
  'message.delivered': ['recipientRef','messageId','content','url'], 'callback.requested': ['recipientRef','callerNumberRef','requestId','durable'],
  'callback.completed': ['recipientRef','callerNumberRef','interactionConfirmed'], 'transfer.requested': ['recipientRef'],
  'transfer.accepted': ['recipientRef','callerLegId','counterpartLegId'], 'transfer.bridged': ['recipientRef','callerLegId','counterpartLegId','callerNonceHeard','counterpartNonceHeard'],
  'transfer.returned': ['recipientRef','callerConnected','audible','contextRetained','activeAgentCount'],
  'booking.created': ['bookingId','recipientRef','service','start'], 'booking.changed': ['bookingId','recipientRef','service','start'],
  'booking.cancelled': ['bookingId'], 'policy.refused': ['reason'], 'private_contact.disclosed': ['recipientRef','content']
};
export function validateScenario(input: unknown, fixtureInput: unknown): Scenario {
  const s = ScenarioSchema.parse(input), f = FixtureSchema.parse(fixtureInput);
  const { contentHash, ...body } = f;
  if (hash(body) !== contentHash) throw new Error('Fixture digest mismatch');
  if (s.fixtureId !== f.fixtureId) throw new Error('Fixture reference mismatch');
  if (new Set(f.directory.map(d=>d.id)).size !== f.directory.length || new Set(f.endpointRefs).size !== f.endpointRefs.length) throw new Error('Duplicate fixture reference');
  const safeUrl = (value: string) => {
    const u = new URL(value);
    if (u.protocol !== 'https:' || !f.allowedHosts.includes(u.hostname) || u.username || u.password || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[|0\.)/.test(u.hostname)) throw new Error('URL host not approved');
  };
  for (const d of f.directory) safeUrl(d.bookingUrl);
  const requiredFields: Record<CallerRequest['action'], string[]> = { facts:[], route:['service'], 'booking-link':['recipientRef','consent'], message:['recipientRef','content','consent'],callback:['recipientRef','callerNumberRef'],transfer:['recipientRef'],return:['recipientRef'],privacy:['recipientRef'] };
  for (const field of requiredFields[s.request.action]) if (!(field in s.request)) throw new Error(`Missing request field: ${field}`);
  const actionCaps: Record<CallerRequest['action'], Capability[]> = {facts:['business.info'],route:['routing.team'],'booking-link':['booking.link'],message:['message.deliver'],callback:['callback.request'],transfer:['transfer.warm'],return:['transfer.warm','transfer.return'],privacy:['business.info']};
  const predicateCaps: Partial<Record<typeof effectTypes[number], Capability>> = {'fact.observed':'business.info','routing.selected':'routing.team','message.delivered':'message.deliver','callback.requested':'callback.request','callback.completed':'callback.execute','transfer.requested':'transfer.warm','transfer.accepted':'transfer.warm','transfer.bridged':'transfer.warm','transfer.returned':'transfer.return','booking.created':'booking.mutate','booking.changed':'booking.mutate','booking.cancelled':'booking.mutate'};
  for (const cap of [...actionCaps[s.request.action], ...s.oracle.all.map(a=>predicateCaps[a.predicate]).filter((c):c is Capability=>c!==undefined)]) if(!s.requires.includes(cap)) throw new Error('Missing required capability');
  const refs = new Set([...f.endpointRefs, ...f.directory.map(x => x.id)]);
  const reference = (key: string, value: unknown) => { if (key.endsWith('Ref') && !refs.has(String(value))) throw new Error('Unresolved reference'); };
  for (const [k,v] of Object.entries(s.request)) reference(k,v);
  for (const a of [...s.oracle.all, ...s.oracle.forbidden]) {
    const variant = EventSchema.options.find(option => option.shape.type.value === a.predicate)!;
    variant.shape.payload.partial().parse(a.match);
    for (const [k,v] of Object.entries(a.match)) {
      if (!payloadKeys[a.predicate].includes(k)) throw new Error('Unknown predicate match field');
      reference(k,v);
      if (k === 'url') safeUrl(String(v));
    }
    if ('authority' in a && a.authority !== 'benchmark-sink') throw new Error('Offline primary assertion requires independent sink authority');
    if ('withinMs' in a && (a.withinMs === 0 || a.withinMs > s.limits.durationMs)) throw new Error('Conflicting assertion deadline');
  }
  const ids = [...s.oracle.all, ...s.oracle.forbidden].map(a => a.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate assertion ID');
  return s;
}
