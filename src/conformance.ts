import { randomUUID } from 'node:crypto';
import { z } from 'zod/v3';
import { hash } from './hash.js';
import {
  CapabilitySchema, ContextSchema, DescriptionSchema, FixtureSchema,
  PreparedSchema, SnapshotSchema, type BusinessFixture, type ReceptionBenchAdapter,
  type TrialContext,
} from './schemas.js';

export const HealthSchema = z.object({ ready: z.boolean() }).strict();
export const CleanupSchema = z.object({ complete: z.boolean() }).strict();

/** Lifecycle checks only. Conformance never places a call or awards a task score. */
export async function checkAdapter(adapter: ReceptionBenchAdapter, input: BusinessFixture) {
  const fixture = FixtureSchema.parse(input);
  const { contentHash, ...body } = fixture;
  if (hash(body) !== contentHash) throw new Error('Fixture digest mismatch');
  const description = DescriptionSchema.parse(await adapter.describe());
  const nonce = randomUUID();
  const ctx: TrialContext = ContextSchema.parse({
    trialId: `conformance-${nonce}`, namespace: `conformance-${nonce}`,
    deadline: new Date(Date.now() + 60000).toISOString(), idempotencyKey: nonce,
  });
  const targets = new Set<string>();
  const rememberTarget = (raw: unknown) => {
    const candidate = raw && typeof raw === 'object' && 'targetId' in raw ? raw.targetId : undefined;
    const parsed = PreparedSchema.shape.targetId.safeParse(candidate);
    if (parsed.success) targets.add(parsed.data);
  };
  let failure: unknown;
  let failed = false;
  const cleanupErrors: unknown[] = [];
  let records = 0;
  let unavailableFields: string[] = [];
  try {
    const raw = await adapter.prepare(ctx, structuredClone(fixture));
    // Recover a valid owned target even if another response field is malformed.
    rememberTarget(raw);
    const prepared = PreparedSchema.parse(raw);
    if (prepared.fixtureReceiptHash !== fixture.contentHash) throw new Error('Fixture receipt mismatch');
    const rawAgain = await adapter.prepare(ctx, structuredClone(fixture));
    rememberTarget(rawAgain);
    const again = PreparedSchema.parse(rawAgain);
    if (hash(prepared) !== hash(again)) throw new Error('Prepare not idempotent');
    if (!HealthSchema.parse(await adapter.health(ctx, prepared.targetId)).ready) throw new Error('Target not ready');
    const snapshot = SnapshotSchema.parse(await adapter.snapshot(ctx, prepared.targetId));
    records = snapshot.records.length;
    unavailableFields = snapshot.unavailableFields;
    let denied = false;
    try { await adapter.snapshot({ ...ctx, namespace: `other-${nonce}` }, prepared.targetId); }
    catch { denied = true; }
    if (!denied) throw new Error('Adapter accepted wrong namespace');
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    // A defective second prepare may create another resource. Clean every known
    // owned target, continuing after failures so one leak cannot hide another.
    for (const targetId of targets) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (!CleanupSchema.parse(await adapter.cleanup(ctx, targetId)).complete) throw new Error('Cleanup incomplete');
        } catch (error) { cleanupErrors.push(error); }
      }
    }
  }
  if (cleanupErrors.length) throw new AggregateError(
    failed ? [failure, ...cleanupErrors] : cleanupErrors,
    failed ? 'Adapter conformance failed and cleanup was incomplete' : 'Adapter cleanup incomplete or not idempotent',
  );
  if (failed) throw failure instanceof Error ? failure : new Error('Adapter conformance operation failed');
  return {
    ready: true as const, scope: 'adapter-lifecycle-only' as const, description,
    unsupported: CapabilitySchema.options.filter(c => !description.capabilities.includes(c)),
    snapshotRecordCount: records, unavailableFields, cleanupComplete: true as const,
  };
}
