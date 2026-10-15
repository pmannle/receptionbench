import { EventSchema, ContextSchema, ScenarioSchema, type Scenario, type TrialContext, type EvidenceEvent } from './schemas.js';
import { validateScope } from './evidence.js';
import { canonical } from './hash.js';
export type Verdict = 'pass' | 'fail' | 'inconclusive' | 'infra_error' | 'unsupported';
export interface AssertionResult { id: string; status: 'pass' | 'fail' | 'unknown'; reason: string; evidenceRefs: string[] }
export interface TrialResult { scenarioId: string; trialId: string; verdict: Verdict; reasons: string[]; assertions: AssertionResult[]; criticalViolations: number }
function matches(e: EvidenceEvent, match: Record<string, unknown>): boolean {
  return Object.entries(match).every(([k,v]) => (e.payload as Record<string, unknown>)[k] === v);
}
// Accept only normalized evidence collected through authenticated ingress. Replay rebuilds ingress first.
export function evaluate(input: Scenario, raw: EvidenceEvent[], ctx: TrialContext): TrialResult {
  const s = ScenarioSchema.parse(input); ContextSchema.parse(ctx);
  if (s.oracle.all.some(a => a.authority !== 'benchmark-sink')) throw new Error('Offline primary assertion requires independent sink authority');
  const unique = new Map<string, EvidenceEvent>();
  for (const item of raw) {
    const e = EventSchema.parse(item); validateScope(e,ctx);
    if (Date.parse(e.receivedAt) < Date.parse(e.occurredAt)) throw new Error('Invalid event clocks');
    const key = `${e.producerId}:${e.eventId}`, prior = unique.get(key);
    if (prior && canonical(prior) !== canonical(e)) throw new Error('Conflicting replay');
    unique.set(key,e);
  }
  const events = [...unique.values()];
  const window = s.limits.durationMs + s.limits.settleMs;
  const startMs = Date.parse(ctx.deadline) - window;
  const elapsed = (e: EvidenceEvent) => Math.max(e.monotonicMs, Date.parse(e.receivedAt)-startMs);
  const closed = events.some(e => e.type === 'observation.closed' && e.authority === 'benchmark-sink' && e.payload.healthy && e.payload.throughMs >= window && e.monotonicMs >= e.payload.throughMs && Date.parse(e.receivedAt)-startMs >= window);
  const assertions: AssertionResult[] = s.oracle.all.map(a => {
    const observed = events.filter(e => e.type === a.predicate && e.authority === a.authority);
    const correct = observed.filter(e => matches(e,a.match) && elapsed(e) <= a.withinMs && Date.parse(e.occurredAt) >= startMs && Date.parse(e.receivedAt) <= Date.parse(ctx.deadline));
    const wrong = observed.length > correct.length;
    const status = wrong || correct.length > a.count || (closed && correct.length !== a.count) ? 'fail' : closed && correct.length === a.count ? 'pass' : 'unknown';
    return { id: a.id, status, reason: status === 'pass' ? 'outcome_confirmed' : status === 'fail' ? 'outcome_mismatch' : 'missing_required_evidence', evidenceRefs: observed.flatMap(e => e.evidenceRefs) };
  });
  let criticalViolations = 0;
  for (const f of s.oracle.forbidden) {
    // Attributed vendor disclosures may prove a violation; they can never establish success.
    const violations = events.filter(e => e.type === f.predicate && matches(e,f.match));
    if (violations.length && f.severity === 'critical') criticalViolations += violations.length;
    assertions.push({ id: f.id, status: violations.length ? 'fail' : closed ? 'pass' : 'unknown', reason: violations.length ? 'forbidden_effect' : closed ? 'absence_confirmed' : 'missing_observation_window', evidenceRefs: violations.flatMap(e => e.evidenceRefs) });
  }
  // A bridge must use the independently accepted legs; no shared-parent-ID requirement.
  for (const e of events) if (e.type === 'transfer.bridged' && e.authority === 'benchmark-sink') {
    const accepted = e.payload.callerLegId !== e.payload.counterpartLegId && events.some(a => a.type === 'transfer.accepted' && a.authority === 'benchmark-sink' && a.payload.recipientRef === e.payload.recipientRef && a.payload.callerLegId === e.payload.callerLegId && a.payload.counterpartLegId === e.payload.counterpartLegId && a.monotonicMs <= e.monotonicMs);
    if (!accepted) assertions.push({ id: 'bridge-leg-integrity', status: 'fail', reason: 'unaccepted_bridge_legs', evidenceRefs: e.evidenceRefs });
  }
  const verdict = assertions.some(a => a.status === 'fail') ? 'fail' : assertions.some(a => a.status === 'unknown') ? 'inconclusive' : 'pass';
  return { scenarioId: s.id, trialId: ctx.trialId, verdict, reasons: [...new Set(assertions.filter(a => a.status !== 'pass').map(a => a.reason))], assertions, criticalViolations };
}
