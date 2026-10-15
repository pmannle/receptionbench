import { timingSafeEqual } from 'node:crypto';
export {PilotCoordinator} from './coordinator.js';
export interface Env {
 PILOT:DurableObjectNamespace;EVIDENCE:R2Bucket;CANONICAL_ORIGIN:string;TWILIO_AUTH_TOKEN:string;
 OPERATOR_TOKEN:string;TARGET_CONFIG_JSON:string;BUDGET_CENTS:string;SETUP_CENTS:string;
}
export const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  if(url.origin!==env.CANONICAL_ORIGIN)return json({error:'wrong_origin'},403);
  if(url.pathname==='/health')return json({service:'receptionbench-pilot',mode:'operator-only'});
  if(url.pathname.startsWith('/operator/')){
   const supplied=Buffer.from(request.headers.get('Authorization')??''),expected=Buffer.from(`Bearer ${env.OPERATOR_TOKEN}`);
   if(!env.OPERATOR_TOKEN||env.OPERATOR_TOKEN.length<32||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return json({error:'unauthorized'},401);
  }else if(!/^\/webhooks\/twilio\/(voice|speech|status|sms)$/.test(url.pathname))return json({error:'not_found'},404);
  return env.PILOT.get(env.PILOT.idFromName('single-pilot-coordinator')).fetch(request);
 },
 async scheduled(_event:ScheduledEvent,env:Env,ctx:ExecutionContext){
  ctx.waitUntil(env.PILOT.get(env.PILOT.idFromName('single-pilot-coordinator')).fetch(env.CANONICAL_ORIGIN+'/internal/tick',{method:'POST'}));
 }
};
