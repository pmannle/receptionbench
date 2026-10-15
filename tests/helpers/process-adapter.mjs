// Contract test fixture only. No network, providers or original application imports.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [mode, path] = process.argv.slice(2);
let raw = ''; for await (const chunk of process.stdin) raw += chunk;
const request = JSON.parse(raw);
appendFileSync(path + '.requests', JSON.stringify(request) + '\n');
if (mode === 'hang') { setInterval(() => {}, 1000); }
else if (mode === 'huge') { process.stdout.write('x'.repeat(200000)); }
else if (mode === 'malformed') { process.stdout.write('{bad'); }
else if (mode === 'stderr') { process.stderr.write('SECRET_DO_NOT_LEAK'); process.exitCode = 1; }
else if (mode === 'error') { process.stdout.write(JSON.stringify({protocolVersion:'0.1',ok:false,error:{code:'private-error',message:'SECRET_DO_NOT_LEAK',retryable:false}})); }
else {
  const state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  let result;
  const key = JSON.stringify(request.context);
  if (request.operation === 'describe') result = {adapterVersion:'fixture-0.1',systemVersion:mode==='env'?JSON.stringify(Object.keys(process.env).sort()):'test',capabilities:['routing.team'],observationMode:mode==='secret-enum'?'SECRET_DO_NOT_LEAK':'instrumented',...(mode==='unknown-field'?{secret:'no'}:{})};
  if (request.operation === 'prepare') {
    const targetId = (mode==='non-idempotent'?'target-'+Object.keys(state).length+'-':'target-') + createHash('sha256').update(key).digest('hex').slice(0,20);
    state[targetId] = {context:key,fixture:request.fixture};
    result = {targetId,endpoint:{kind:'webrtc',connectionRef:targetId},fixtureReceiptHash:mode==='wrong-hash'?'0'.repeat(64):request.fixture.contentHash};
  }
  if (['health','snapshot','cleanup'].includes(request.operation)) {
    const target = state[request.targetId];
    if (target && target.context !== key) { process.stdout.write(JSON.stringify({protocolVersion:'0.1',ok:false,error:{code:'scope',message:'scope mismatch',retryable:false}})); process.exit(0); }
    if (!target && request.operation !== 'cleanup') process.exit(1);
    if (request.operation === 'health') result = {ready:mode==='bad-health'?'yes':true};
    if (request.operation === 'snapshot') result = {schemaVersion:'0.1',observedAt:new Date().toISOString(),records:[],evidenceRefs:[],unavailableFields:['real-media']};
    if (request.operation === 'cleanup') { delete state[request.targetId]; result = {complete:true}; }
  }
  writeFileSync(path,JSON.stringify(state));
  process.stdout.write(JSON.stringify({protocolVersion:'0.1',ok:true,result})+'\n');
}
