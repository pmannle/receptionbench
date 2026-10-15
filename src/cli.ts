#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { plan, run, replay, type Report } from './runner.js';
import { fixture } from './fixtures.js';
import { validateScenario } from './schemas.js';
import { FakeAdapter, FaultSchema } from './fake.js';
import { checkAdapter } from './conformance.js';
import { htmlReport } from './reports.js';
import { ProcessAdapter } from './process-adapter.js';
const read=(path:string):unknown=>JSON.parse(readFileSync(path,'utf8'));
const print=(value:unknown)=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
function code(r:Report) {return r.score.rankStatus==='incomplete'?3:r.score.counts.fail!+r.score.counts.unsupported!>0||r.score.criticalViolations>0?1:0;}
async function main() {
  const [command,...args]=process.argv.slice(2); const flags=new Map<string,string|boolean>(); const positional:string[]=[];
  for(let i=0;i<args.length;i++) {
    const arg=args[i]!;
    if(arg.startsWith('--')) {
      if(flags.has(arg)) throw new Error('Duplicate option');
      if(arg==='--offline'||arg==='--allow-local-integration') flags.set(arg,true);
      else {const value=args[++i];if(!value||value.startsWith('--')) throw new Error(`Missing value for ${arg}`);flags.set(arg,value);}
    } else positional.push(arg);
  }
  const allowed:Record<string,string[]>={doctor:[],validate:[],adapter:['--adapter','--process-config','--allow-local-integration'],plan:['--repetitions','--seed','--fault','--out'],run:['--offline','--plan','--out'],replay:['--bundle'],report:['--run','--format','--out'],help:[]};
  if(!command||command==='help') {print({commands:['doctor','validate scenarios/public','adapter check --adapter fake','adapter check --process-config PRIVATE_CONFIG --allow-local-integration','plan --out plan.json','run --offline --plan plan.json --out runs/demo','replay --bundle runs/demo/bundle.json','report --run runs/demo --format html --out report.html'],scope:'Offline scored runs; opt-in local adapter lifecycle checks'});return;}
  if(!(command in allowed)||[...flags.keys()].some(f=>!allowed[command]!.includes(f))) throw new Error('Unknown command or option; only offline fake transport is supported');
  const get=(key:string,fallback?:string):string=>{const v=flags.get(key)??fallback;if(typeof v!=='string') throw new Error(`Required option ${key}`);return v;};
  if(command==='doctor') {print({ready:true,node:process.version,sqlite:execFileSync('sqlite3',['--version'],{encoding:'utf8'}).trim(),mode:'offline; no credentials required'});return;}
  if(command==='validate') {
    if(positional.length!==1) throw new Error('Expected scenario directory');
    const files=readdirSync(positional[0]!).filter(f=>f.endsWith('.json'));
    if(files.length===0) throw new Error('No scenarios found');
    const ids=files.map(f=>validateScenario(read(join(positional[0]!,f)),fixture).id);
    if(new Set(ids).size!==ids.length) throw new Error('Duplicate scenario IDs');print({valid:files.length});return;
  }
  if(command==='adapter') {
    if(positional.join(' ')!=='check')throw new Error('Expected adapter check');
    if(flags.has('--process-config')) {
      if(flags.has('--adapter'))throw new Error('Choose either a process config or fake adapter');
      if(!flags.has('--allow-local-integration'))throw new Error('An external executable requires explicit --allow-local-integration');
      print(await checkAdapter(new ProcessAdapter(read(get('--process-config'))),fixture));
    } else {
      if(get('--adapter')!=='fake'||flags.has('--allow-local-integration'))throw new Error('Expected adapter check --adapter fake');
      print(await checkAdapter(new FakeAdapter(),fixture));
    }
    return;
  }
  if(positional.length) throw new Error('Unexpected positional arguments');
  if(command==='plan') {const p=plan({repetitions:Number(get('--repetitions','1')),seed:Number(get('--seed','42')),fault:FaultSchema.parse(get('--fault','none'))});if(flags.has('--out'))writeFileSync(get('--out'),JSON.stringify(p,null,2)+'\n',{mode:0o600});print(p);return;}
  if(command==='run') {if(!flags.has('--offline'))throw new Error('Explicit --offline required; live execution unavailable');const b=await run(read(get('--plan')),get('--out'));print(b.report);process.exitCode=code(b.report);return;}
  if(command==='replay') {const r=replay(read(get('--bundle')));print(r);process.exitCode=code(r);return;}
  if(command==='report') {const r=replay(read(join(get('--run'),'bundle.json'))),format=get('--format','json');if(!['html','json'].includes(format))throw new Error('Unknown report format');const content=format==='html'?htmlReport(r):JSON.stringify(r,null,2)+'\n';if(flags.has('--out'))writeFileSync(get('--out'),content,{mode:0o600});else process.stdout.write(content);return;}
}
main().catch(error=>{process.stderr.write(JSON.stringify({code:'configuration_error',message:error instanceof Error?error.message:'Invalid request',retryable:false})+'\n');process.exitCode=2;});
