import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { plan, run, replay } from '../src/runner.js';
import { FakeAdapter, checkAdapter } from '../src/fake.js';
import { score, wilson, passK } from '../src/scoring.js';
import { htmlReport } from '../src/reports.js';
import { scenarios, fixture } from '../src/fixtures.js';

test('ten offline cases pass with durable artifacts and deterministic replay', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rb-run-'));
  try {
    const p = plan({ repetitions: 1, seed: 42 });
    const bundle = await run(p, dir);
    assert.equal(bundle.report.score.primary, 100);
    assert.equal(bundle.report.trials.length, 10);
    assert.ok(bundle.report.trials.every(t => t.verdict === 'pass'));
    assert.deepEqual(replay(bundle), bundle.report);
    assert.deepEqual(replay(JSON.parse(readFileSync(join(dir,'bundle.json'), 'utf8'))), bundle.report);
    assert.equal(bundle.manifest.transport, 'fake'); assert.equal(bundle.manifest.costUsd, 0);
    assert.ok(readFileSync(join(dir, 'report.html'), 'utf8').includes('Simulation'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('admission rejects external transport, changed plan, over-limit repetitions and config drift', async () => {
  assert.throws(() => plan({ transport: 'pstn' } as never), /offline|transport/i);
  assert.throws(() => plan({ repetitions: 0 }));
  assert.throws(() => plan({ repetitions: 10001 }));
  const dir = mkdtempSync(join(tmpdir(), 'rb-plan-'));
  try {
    const p = plan(); p.seed++;
    await assert.rejects(run(p,dir), /digest/);
    const p2 = plan(); p2.fixture.publicFacts.hours = 'altered';
    await assert.rejects(run(p2,dir), /digest/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('fake adapter conforms, rejects namespace mismatch and cleans up idempotently', async () => {
  await checkAdapter(new FakeAdapter(), fixture);
});
test('fake failures cannot masquerade as successful outcomes; cleanup/crash always collected', async () => {
  for (const fault of ['acceptance-only','wrong-recipient','duplicate-text','late-delivery','broken-bridge','no-return','privacy','missing-evidence','cleanup-error','crash','unsupported'] as const) {
    const dir = mkdtempSync(join(tmpdir(), 'rb-fault-'));
    try {
      const b = await run(plan({ fault }),dir);
      const expectedFailures: Record<string,number> = { 'acceptance-only':3,'wrong-recipient':3,'duplicate-text':3,'late-delivery':3,'broken-bridge':2,'no-return':1,privacy:10,crash:10 };
      if(fault in expectedFailures) { assert.equal(b.report.score.counts.fail,expectedFailures[fault],fault); assert.equal(b.report.score.counts.pass,10-expectedFailures[fault]!,fault); }
      if(fault==='missing-evidence') assert.equal(b.report.score.counts.inconclusive,10);
      assert.ok(b.report.trials.some(t => t.verdict !== 'pass'), fault);
      assert.deepEqual(replay(b), b.report, fault);
      if (fault === 'privacy') assert.ok(b.report.score.criticalViolations > 0);
      if (fault === 'cleanup-error') assert.ok(b.report.trials.every(t => t.verdict === 'infra_error'));
      if (fault === 'crash') { assert.ok(b.report.trials.every(t => t.verdict === 'fail')); assert.equal(b.report.score.valid,10); }
      if (fault === 'unsupported') assert.ok(b.report.trials.every(t => t.verdict === 'unsupported'));
      assert.equal(b.trials.length, 10);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
test('replay rejects corrupted digest, unknown producer and forged sink authority', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rb-replay-'));
  try {
    const b = await run(plan(),dir);
    const changed = structuredClone(b); changed.trials[0]!.events[0]!.authority = 'provider';
    assert.throws(() => replay(changed), /digest/);
    assert.throws(() => replay({ ...b, unknown: true }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('scoring uses equal category/scenario weights; unsupported fails and inconclusive excludes', () => {
  const trials = scenarios.map((s,i) => ({ scenarioId:s.id, trialId:`t-${i}`, verdict: 'pass' as const, reasons:[],assertions:[],criticalViolations:0 }));
  assert.equal(score(scenarios,trials).primary,100);
  const mixed = trials.map((t,i) => ({ ...t, verdict: i === 0 ? 'unsupported' as const : t.verdict }));
  assert.ok(Math.abs(score(scenarios,mixed).primary! - 100 * 5/6) < 1e-10);
  const unknown = trials.map((t,i) => ({ ...t, verdict: i === 0 ? 'inconclusive' as const : t.verdict }));
  assert.equal(score(scenarios,unknown).primary,null);
  assert.equal(score(scenarios,unknown).rankStatus,'incomplete');
  assert.ok(Math.abs(passK(3,5,3)! - 0.1) < 1e-12);
  assert.equal(passK(2,2,3),null);
  const interval = wilson(0,10); assert.equal(interval[0],0); assert.ok(interval[1]! > 0.27);
});
test('HTML escapes untrusted content', () => {
  const content = htmlReport({ label: '<script>alert(1)</script>' });
  assert.ok(!content.includes('<script>')); assert.ok(content.includes('&lt;script&gt;'));
});
