import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { evaluate } from '../src/evaluator.js';
import { scenarios } from '../src/fixtures.js';
import { type EvidenceEvent, type TrialContext } from '../src/schemas.js';
for(const file of readdirSync('tests/golden'))test(`golden evidence: ${file}`,()=>{
  const b=JSON.parse(readFileSync(`tests/golden/${file}`,'utf8')) as {scenarioId:string;context:TrialContext;events:EvidenceEvent[];expected:string};
  const scenario=scenarios.find(s=>s.id===b.scenarioId)!;
  if(b.expected==='reject') assert.throws(()=>evaluate(scenario,b.events,b.context));
  else assert.equal(evaluate(scenario,b.events,b.context).verdict,b.expected);
});
