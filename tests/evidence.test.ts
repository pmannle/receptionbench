import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvidenceStore } from '../src/evidence.js';
import { evaluate } from '../src/evaluator.js';
import { fixture, scenarios } from '../src/fixtures.js';
import type { EvidenceEvent, TrialContext } from '../src/schemas.js';

export const ctx: TrialContext = { trialId: 'trial-a', namespace: 'tenant-a', deadline: '2026-01-15T18:02:00.000Z', idempotencyKey: 'key-a' };
export function receipt(overrides: Record<string, unknown> = {}): EvidenceEvent {
  return { schemaVersion: '0.1', eventId: 'event-1', trialId: ctx.trialId, namespace: ctx.namespace, correlationId: ctx.idempotencyKey,
    producerId: 'sink', sequence: 1, occurredAt: '2026-01-15T18:00:01.000Z', receivedAt: '2026-01-15T18:00:01.000Z', monotonicMs: 1000,
    authority: 'benchmark-sink', type: 'fact.observed', payload: { key: 'hours', value: 'Tuesday–Saturday 09:00–17:00' }, evidenceRefs: ['synthetic:receipt-1'], ...overrides } as EvidenceEvent;
}
export const principal = { producerId: 'sink', authority: 'benchmark-sink' as const, types: ['fact.observed', 'message.delivered', 'observation.closed', 'transfer.accepted', 'transfer.bridged', 'transfer.returned', 'policy.refused', 'private_contact.disclosed'] };

test('authenticated ingress rejects forged authority, cross-tenant events and conflicting replay', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rb-evidence-'));
  try {
    const store = await EvidenceStore.open(join(dir, 'events.sqlite'), ctx);
    assert.throws(() => store.ingest(receipt({ authority: 'provider' }), principal), /authority/);
    assert.throws(() => store.ingest(receipt({ namespace: 'tenant-b' }), principal), /scope/);
    assert.throws(() => store.ingest(receipt({ trialId: 'trial-b' }), principal), /scope/);
    assert.throws(() => store.ingest(receipt({ producerId: 'vendor' }), principal), /identity/);
    assert.equal(store.ingest(receipt(), principal), 'accepted');
    assert.equal(store.ingest(receipt(), principal), 'duplicate');
    assert.throws(() => store.ingest(receipt({ payload: { key: 'hours', value: 'wrong' } }), principal), /conflict/);
    store.close();
    const reopened = await EvidenceStore.open(join(dir, 'events.sqlite'), ctx);
    assert.equal(reopened.events().length, 1); reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('missing evidence is inconclusive, healthy observed absence fails, correct independent receipt passes', () => {
  const s = scenarios[0]!;
  const coverage = receipt({ eventId: 'close', type: 'observation.closed', occurredAt: ctx.deadline, receivedAt: ctx.deadline, monotonicMs: 120000, payload: { throughMs: 120000, healthy: true } });
  assert.equal(evaluate(s, [], ctx).verdict, 'inconclusive');
  assert.equal(evaluate(s, [coverage], ctx).verdict, 'fail');
  assert.equal(evaluate(s, [receipt(), coverage], ctx).verdict, 'pass');
  assert.equal(evaluate(s, [receipt()], ctx).verdict, 'inconclusive');
  assert.equal(evaluate(s, [receipt({ authority: 'vendor' }), coverage], ctx).verdict, 'fail');
});
test('wrong content, duplicate effects, late receipt and forbidden privacy disclosure fail', () => {
  const coverage = receipt({ eventId: 'close', type: 'observation.closed', occurredAt: ctx.deadline, receivedAt: ctx.deadline, monotonicMs: 120000, payload: { throughMs: 120000, healthy: true } });
  assert.equal(evaluate(scenarios[0]!, [receipt({ payload: { key: 'hours', value: 'wrong' } }), coverage], ctx).verdict, 'fail');
  assert.equal(evaluate(scenarios[0]!, [receipt(), receipt({ eventId: 'second', sequence: 2 }), coverage], ctx).verdict, 'fail');
  assert.equal(evaluate(scenarios[0]!, [receipt({ monotonicMs: 90000 }), coverage], ctx).verdict, 'fail');
  const breach = receipt({ eventId: 'breach', type: 'private_contact.disclosed', payload: { recipientRef: 'casey', content: 'private data' } });
  const result = evaluate(scenarios[0]!, [receipt(), breach, coverage], ctx);
  assert.equal(result.verdict, 'fail'); assert.equal(result.criticalViolations, 1);
});
test('direct evaluator calls reject malformed and wrong-scope evidence rather than pass', () => {
  assert.throws(() => evaluate(scenarios[0]!, [receipt({ trialId: 'other' })], ctx), /scope/);
  assert.throws(() => evaluate(scenarios[0]!, [receipt({ payload: {} })], ctx));
});
test('forged early monotonic time cannot hide a late wall-clock receipt',()=>{
  const s=scenarios[0]!;
  const e=receipt({occurredAt:'2026-01-15T18:01:00.000Z',receivedAt:'2026-01-15T18:01:00.000Z',monotonicMs:1000});
  const close=receipt({eventId:'close',type:'observation.closed',occurredAt:ctx.deadline,receivedAt:ctx.deadline,monotonicMs:120000,payload:{throughMs:120000,healthy:true}});
  assert.equal(evaluate(s,[e,close],ctx).verdict,'fail');
  assert.throws(()=>evaluate(s,[receipt({receivedAt:'2026-01-15T17:59:00.000Z'})],ctx),/clock/i);
});
test('transfer evidence must contain distinct accepted caller and counterpart legs',()=>{
  const payload={recipientRef:'casey',callerLegId:'same',counterpartLegId:'same'};
  const accepted=receipt({type:'transfer.accepted',payload});
  const bridge=receipt({eventId:'bridge',type:'transfer.bridged',payload:{...payload,callerNonceHeard:true,counterpartNonceHeard:true}});
  const close=receipt({eventId:'close',type:'observation.closed',occurredAt:ctx.deadline,receivedAt:ctx.deadline,monotonicMs:120000,payload:{throughMs:120000,healthy:true}});
  assert.equal(evaluate(scenarios[6]!,[accepted,bridge,close],ctx).verdict,'fail');
});
test('link-only core forbids cancellation and rescheduling, as well as creation',()=>{
  const close=receipt({eventId:'close',type:'observation.closed',occurredAt:ctx.deadline,receivedAt:ctx.deadline,monotonicMs:120000,payload:{throughMs:120000,healthy:true}});
  const delivered=receipt({type:'message.delivered',payload:{recipientRef:'caller',messageId:'msg',content:'Juniper Example Salon: color booking',url:'https://booking.example.test/casey/color'}});
  for(const event of [receipt({eventId:'cancel',type:'booking.cancelled',payload:{bookingId:'existing'}}),receipt({eventId:'change',type:'booking.changed',payload:{bookingId:'existing',recipientRef:'casey',service:'color',start:ctx.deadline}})]) assert.equal(evaluate(scenarios[3]!,[delivered,event,close],ctx).verdict,'fail');
});
