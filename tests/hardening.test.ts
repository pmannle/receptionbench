import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenario } from '../src/schemas.js';
import { scenarios, fixture } from '../src/fixtures.js';
import { hash } from '../src/hash.js';

test('compiler rejects malformed requests and capability/oracle mismatch before running',()=>{
  const s=scenarios[4]!;
  assert.throws(()=>validateScenario({...s,request:{action:'message'}},fixture),/request/i);
  assert.throws(()=>validateScenario({...s,requires:['business.info']},fixture),/capability/i);
});
test('fixture compiler rejects unsafe URLs and duplicated directory references',()=>{
  const f=structuredClone(fixture);f.directory[0]!.bookingUrl='https://127.0.0.1/private';
  const {contentHash,...body}=f;
  assert.throws(()=>validateScenario(scenarios[0],{...body,contentHash:hash(body)}),/URL/);
  const duplicate=structuredClone(fixture);duplicate.directory.push(duplicate.directory[0]!);
  const {contentHash:ignored,...duplicateBody}=duplicate;
  assert.throws(()=>validateScenario(scenarios[0],{...duplicateBody,contentHash:hash(duplicateBody)}),/Duplicate/);
});
test('match values must conform to their event payload types',()=>{
  const s=structuredClone(scenarios[0]!);s.oracle.all[0]!.match.value=3;
  assert.throws(()=>validateScenario(s,fixture));
});
test('low-level evaluator rejects an uncompiled vendor-authority primary assertion',async()=>{
  const { evaluate }=await import('../src/evaluator.js');
  const s=structuredClone(scenarios[0]!);s.oracle.all[0]!.authority='vendor';
  assert.throws(()=>evaluate(s,[],{trialId:'trial',namespace:'tenant',idempotencyKey:'key',deadline:'2026-01-15T18:02:00.000Z'}),/authority/);
});
