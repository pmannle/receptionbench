import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { ProcessAdapter, ProcessAdapterConfigSchema } from '../src/process-adapter.js';
import { checkAdapter } from '../src/conformance.js';
import { fixture } from '../src/fixtures.js';

function setup(mode='normal', options:Record<string,unknown>={}) {
  const dir=mkdtempSync(join(tmpdir(),'rb-process-')), path=join(dir,'state.json');
  const config={protocolVersion:'0.1',command:process.execPath,args:[resolve('tests/helpers/process-adapter.mjs'),mode,path],timeoutMs:2000,maxOutputBytes:65536,environmentRefs:[],...options};
  return {dir,path,config,adapter:new ProcessAdapter(config),dispose:()=>rmSync(dir,{recursive:true,force:true})};
}
test('neutral process adapter completes lifecycle with no oracle in provisioning',async()=>{
  const x=setup();try {
    const result=await checkAdapter(x.adapter,fixture);
    assert.equal(result.ready,true);assert.equal(result.scope,'adapter-lifecycle-only');
    assert.deepEqual(JSON.parse(readFileSync(x.path,'utf8')),{});
    const requests=readFileSync(x.path+'.requests','utf8').trim().split('\n').map(l=>JSON.parse(l));
    assert.ok(requests.every(r=>!('oracle' in r)&&!('scenario' in r)));
    assert.equal(requests.find(r=>r.operation==='prepare').fixture.contentHash,fixture.contentHash);
    assert.ok(requests.filter(r=>r.operation==='cleanup').length>=2);
  }finally{x.dispose();}
});
test('conformance cleans up after bad health and process adapter rolls back receipt mismatch',async()=>{
  for(const mode of ['bad-health','wrong-hash']) {
    const x=setup(mode);try {
      await assert.rejects(checkAdapter(x.adapter,fixture));
      assert.deepEqual(JSON.parse(readFileSync(x.path,'utf8')),{});
      assert.ok(readFileSync(x.path+'.requests','utf8').includes('"operation":"cleanup"'));
    }finally{x.dispose();}
  }
});
test('process transport rejects malformed, huge, unknown-field, timeout and private error responses',async()=>{
  for(const mode of ['malformed','huge','unknown-field','hang','stderr','error']) {
    const x=setup(mode,{timeoutMs:mode==='hang'?80:2000,maxOutputBytes:1024});
    try {
      await assert.rejects(x.adapter.describe(),(error:unknown)=>error instanceof Error&&!error.message.includes('SECRET_DO_NOT_LEAK'));
    }finally{x.dispose();}
  }
});
test('child process inherits only explicit environment references',async()=>{
  process.env.RECEPTIONBENCH_TEST_SECRET='secret';
  const x=setup('env');const y=setup('env',{environmentRefs:['RECEPTIONBENCH_TEST_SECRET']});
  try {
    assert.ok(!(await x.adapter.describe()).systemVersion.includes('RECEPTIONBENCH_TEST_SECRET'));
    assert.ok((await y.adapter.describe()).systemVersion.includes('RECEPTIONBENCH_TEST_SECRET'));
    assert.throws(()=>ProcessAdapterConfigSchema.parse({...x.config,environmentRefs:['NODE_OPTIONS']}));
    assert.throws(()=>ProcessAdapterConfigSchema.parse({...x.config,env:{KEY:'secret'}}));
    assert.throws(()=>new ProcessAdapter({...x.config,command:'sh'}));
  }finally{delete process.env.RECEPTIONBENCH_TEST_SECRET;x.dispose();y.dispose();}
});
test('CLI requires explicit local integration opt-in before spawning an external adapter',()=>{
  const x=setup();try {
    const path=join(x.dir,'config.json');writeFileSync(path,JSON.stringify(x.config));
    const denied=spawnSync(process.execPath,['dist/src/cli.js','adapter','check','--process-config',path],{encoding:'utf8'});
    assert.equal(denied.status,2);assert.ok(!existsSync(x.path+'.requests'));
    const allowed=spawnSync(process.execPath,['dist/src/cli.js','adapter','check','--process-config',path,'--allow-local-integration'],{encoding:'utf8'});
    assert.equal(allowed.status,0,allowed.stderr);assert.equal(JSON.parse(allowed.stdout).scope,'adapter-lifecycle-only');
  }finally{x.dispose();}
});
test('invalid result values are redacted even when a vendor puts a secret in an enum',async()=>{
  const x=setup('secret-enum');
  try { await assert.rejects(x.adapter.describe(),(error:unknown)=>error instanceof Error&&!error.message.includes('SECRET_DO_NOT_LEAK')); }
  finally{x.dispose();}
});

test('non-idempotent preparation cleans every discovered owned target',async()=>{
  const x=setup('non-idempotent');
  try {
    await assert.rejects(checkAdapter(x.adapter,fixture),/idempotent/);
    assert.deepEqual(JSON.parse(readFileSync(x.path,'utf8')),{});
    const requests=readFileSync(x.path+'.requests','utf8').trim().split('\n').map(l=>JSON.parse(l));
    assert.equal(new Set(requests.filter(r=>r.operation==='cleanup').map(r=>r.targetId)).size,2);
  }finally{x.dispose();}
});
test('a non-Error rejection cannot turn a failed conformance check into readiness',async()=>{
  const {FakeAdapter}=await import('../src/fake.js');
  class RejectingAdapter extends FakeAdapter { async health():Promise<never> {throw undefined;} }
  await assert.rejects(checkAdapter(new RejectingAdapter(),fixture));
});
