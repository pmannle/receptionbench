import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plan } from '../src/runner.js';
const cli='dist/src/cli.js';
test('CLI validates fixtures, checks fake adapter and rejects unknown/live flags',()=>{
  assert.equal(JSON.parse(execFileSync(process.execPath,[cli,'validate','scenarios/public'],{encoding:'utf8'})).valid,10);
  assert.equal(JSON.parse(execFileSync(process.execPath,[cli,'adapter','check','--adapter','fake'],{encoding:'utf8'})).ready,true);
  assert.equal(spawnSync(process.execPath,[cli,'run','--allow-live']).status,2);
  assert.equal(spawnSync(process.execPath,[cli,'plan','--typo']).status,2);
});
test('CLI run and replay preserve verdicts and failure exit status',()=>{
  const dir=mkdtempSync(join(tmpdir(),'rb-cli-'));
  try {
    const p=join(dir,'plan.json');writeFileSync(p,JSON.stringify(plan({fault:'acceptance-only'})));
    const output=join(dir,'output');
    const run=spawnSync(process.execPath,[cli,'run','--offline','--plan',p,'--out',output],{encoding:'utf8'});
    assert.equal(run.status,1,run.stderr);
    const replay=spawnSync(process.execPath,[cli,'replay','--bundle',join(output,'bundle.json')],{encoding:'utf8'});
    assert.equal(replay.status,1,replay.stderr);
    assert.equal(JSON.parse(run.stdout).score.primary,JSON.parse(replay.stdout).score.primary);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
