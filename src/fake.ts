import { z } from 'zod/v3';
import { hash } from './hash.js';
import { EventSchema, DescriptionSchema, FixtureSchema, PreparedSchema, SnapshotSchema, type BusinessFixture, type CallerRequest, type ReceptionBenchAdapter, type TrialContext, type EvidenceEvent } from './schemas.js';
export const FaultSchema = z.enum(['none','acceptance-only','wrong-recipient','duplicate-text','late-delivery','broken-bridge','no-return','privacy','missing-evidence','cleanup-error','crash','unsupported']);
export type Fault = z.infer<typeof FaultSchema>;
export type SimulatedEffect = { type: EvidenceEvent['type']; payload: Record<string, unknown>; atMs?: number };
const caps = ['business.info','routing.team','booking.link','message.deliver','callback.request','transfer.warm','transfer.return'] as const;
export class FakeAdapter implements ReceptionBenchAdapter {
  private targets = new Map<string, { ctx: TrialContext; fixture: BusinessFixture }>();
  constructor(readonly fault: Fault = 'none') { FaultSchema.parse(fault); }
  async describe() { return { adapterVersion: 'fake-0.1.0', systemVersion: 'deterministic-0.1.0', capabilities: this.fault === 'unsupported' ? [] : [...caps], observationMode: 'instrumented' as const }; }
  async prepare(ctx: TrialContext, fixture: BusinessFixture) {
    const f = FixtureSchema.parse(fixture); const { contentHash, ...body } = f;
    if (hash(body) !== contentHash) throw new Error('Fixture receipt mismatch');
    const targetId = `fake-${ctx.trialId}`; const prior = this.targets.get(targetId);
    if (prior && hash(prior) !== hash({ ctx, fixture:f })) throw new Error('Idempotency conflict');
    this.targets.set(targetId, structuredClone({ ctx, fixture:f }));
    return { targetId, endpoint: { kind:'webrtc' as const, connectionRef: targetId }, fixtureReceiptHash: f.contentHash };
  }
  private owned(ctx: TrialContext, targetId: string) {
    const t = this.targets.get(targetId);
    if (!t || hash(t.ctx) !== hash(ctx)) throw new Error('Target scope mismatch');
    return t;
  }
  async health(ctx: TrialContext, targetId: string) { this.owned(ctx,targetId); return { ready: true }; }
  async snapshot(ctx: TrialContext, targetId: string) {
    this.owned(ctx,targetId);
    return { schemaVersion: '0.1' as const, observedAt: ctx.deadline, records: [], evidenceRefs: ['synthetic:snapshot'], unavailableFields: ['real-provider-state','real-audio'] };
  }
  async cleanup(ctx: TrialContext, targetId: string) {
    if (!this.targets.has(targetId)) return { complete: true };
    this.owned(ctx,targetId); this.targets.delete(targetId);
    return { complete: this.fault !== 'cleanup-error' };
  }
  // Fake simulation protocol only. Neither adapter method receives the scenario or its oracle.
  async respond(ctx: TrialContext, targetId: string, request: CallerRequest): Promise<SimulatedEffect[]> {
    const { fixture:f } = this.owned(ctx,targetId);
    if (this.fault === 'crash') throw new Error('Injected fake crash');
    const staff = f.directory.find(d => request.recipientRef ? d.id === request.recipientRef : d.service === request.service);
    const effects: SimulatedEffect[] = [];
    const add = (type: SimulatedEffect['type'], payload: SimulatedEffect['payload']) => effects.push({ type,payload });
    const message = (recipientRef: string, content: string, url?: string) => add('message.delivered', { recipientRef, content, messageId: 'message-1', ...(url ? { url } : {}) });
    switch (request.action) {
      case 'facts': add('fact.observed', { key:'hours', value:f.publicFacts.hours }); break;
      case 'route': if (staff) add('routing.selected', { recipientRef:staff.id,service:staff.service }); break;
      case 'booking-link':
        if (!request.consent) add('policy.refused', { reason:'consent' });
        else if (staff) message('caller', `${f.publicFacts.businessName}: ${staff.service} booking`,staff.bookingUrl);
        break;
      case 'message': if (request.consent) message(request.recipientRef!,request.content!); break;
      case 'callback':
        add('callback.requested', { recipientRef:request.recipientRef,callerNumberRef:request.callerNumberRef,requestId:'request-1',durable:true });
        message(request.recipientRef!, `Callback requested: ${request.callerNumberRef}`); break;
      case 'transfer': case 'return': {
        const legs = { recipientRef:request.recipientRef,callerLegId:'caller-leg',counterpartLegId:'staff-leg' };
        add('transfer.requested', { recipientRef:request.recipientRef });
        add('transfer.accepted', legs);
        add('transfer.bridged', { ...legs,callerNonceHeard:true,counterpartNonceHeard:true });
        if (request.action === 'return') add('transfer.returned', { recipientRef:request.recipientRef,callerConnected:true,audible:true,contextRetained:true,activeAgentCount:1 });
        break;
      }
      case 'privacy': add('policy.refused', { reason:'private-contact' }); break;
    }
    if (this.fault === 'privacy') add('private_contact.disclosed', { recipientRef:'casey',content:'synthetic confidential field' });
    return effects.flatMap(effect => {
      if (this.fault === 'no-return' && effect.type === 'transfer.returned') return [];
      if (this.fault === 'broken-bridge' && effect.type === 'transfer.bridged') return [{ ...effect,payload:{ ...effect.payload,counterpartNonceHeard:false } }];
      if (effect.type === 'message.delivered') {
        if (this.fault === 'acceptance-only') return [{ ...effect,type:'message.accepted' as const }];
        if (this.fault === 'wrong-recipient') return [{ ...effect,payload:{ ...effect.payload,recipientRef:'wrong-party' } }];
        if (this.fault === 'duplicate-text') return [effect,{ ...effect,payload:{ ...effect.payload,messageId:'message-2' } }];
        if (this.fault === 'late-delivery') return [{ ...effect,atMs:90000 }];
      }
      return [effect];
    });
  }
}
export { checkAdapter } from './conformance.js';
