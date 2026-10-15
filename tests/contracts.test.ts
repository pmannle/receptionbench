import test from 'node:test';
import assert from 'node:assert/strict';
import { EventSchema, ScenarioSchema, validateScenario } from '../src/schemas.js';
import { fixture, scenarios } from '../src/fixtures.js';
import { hash } from '../src/hash.js';

test('ten independently authored scenarios compile and fixture digest binds content', () => {
  assert.equal(scenarios.length, 10);
  for (const s of scenarios) assert.deepEqual(validateScenario(s, fixture), s);
  const { contentHash, ...body } = fixture;
  assert.equal(hash(body), contentHash);
});
test('compiler rejects unknown predicates, oracle code and unresolved recipients', () => {
  const s = structuredClone(scenarios[0]!);
  assert.throws(() => ScenarioSchema.parse({ ...s, oracle: { ...s.oracle, all: [{ id: 'bad', predicate: 'eval', code: 'true' }] } }));
  assert.throws(() => validateScenario({ ...s, request: { ...s.request, recipientRef: 'unknown' } }, fixture), /reference/);
  assert.throws(() => ScenarioSchema.parse({ ...s, injectedCode: 'true' }));
});
test('events require discriminated payload and strict IDs and finite clocks', () => {
  assert.throws(() => EventSchema.parse({ type: 'message.delivered', payload: { claimed: true } }));
  assert.throws(() => EventSchema.parse({ type: 'unknown' }));
});
test('compiler rejects incompatible authority, impossible deadline and fixture mismatch', () => {
  const s = structuredClone(scenarios[0]!);
  const a = s.oracle.all[0]!;
  assert.throws(() => validateScenario({ ...s, oracle: { ...s.oracle, all: [{ ...a, authority: 'vendor' }] } }, fixture), /authority/);
  assert.throws(() => validateScenario({ ...s, oracle: { ...s.oracle, all: [{ ...a, withinMs: 200000 }] } }, fixture), /deadline/);
  assert.throws(() => validateScenario(s, { ...fixture, publicFacts: { ...fixture.publicFacts, hours: 'tampered' } }), /digest/);
});
test('checked-in public fixtures match the frozen SDK suite',async()=>{
  const {readFileSync}=await import('node:fs');
  assert.deepEqual(JSON.parse(readFileSync('fixtures/salon-synthetic-v1.json','utf8')),fixture);
  for(const s of scenarios)assert.deepEqual(JSON.parse(readFileSync(`scenarios/public/${s.id}.json`,'utf8')),s);
});
