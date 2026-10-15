import { validateRequest } from 'twilio/lib/webhooks/webhooks.js';
import { hash } from '../hash.js';
import { PilotStateSchema,currentRun,type PilotState } from './contracts.js';
export interface WebhookConfig {canonicalOrigin:string;accountSid:string;authToken:string}
export interface EndpointConfig {callerNumber:string;targetNumber:string;expectedSender:string}
export interface VerifiedWebhook {kind:'sms'|'voice'|'speech'|'status';pilotId?:string;turn:string;form:Record<string,string>;digest:string}
export async function verifyWebhook(request:Request,config:WebhookConfig):Promise<VerifiedWebhook> {
  const url=new URL(request.url),origin=new URL(config.canonicalOrigin);
  if(origin.protocol!=='https:'||origin.pathname!=='/'||url.origin!==origin.origin)throw new Error('Invalid canonical origin');
  const kind=url.pathname.split('/').at(-1);
  if(request.method!=='POST'||!['sms','voice','speech','status'].includes(kind??'')||url.pathname!==`/webhooks/twilio/${kind}`)throw new Error('Invalid webhook route');
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded'))throw new Error('Invalid webhook content type');
  const reader=request.body?.getReader();if(!reader)throw new Error('Missing webhook body');
  let body='',length=0;const decoder=new TextDecoder();
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>65536){await reader.cancel();throw new Error('Webhook too large');}body+=decoder.decode(value,{stream:true});}body+=decoder.decode();
  const params=new URLSearchParams(body),form:Record<string,string>=Object.create(null);
  if([...params].length>128)throw new Error('Too many webhook parameters');
  for(const [key,value] of params){if(Object.hasOwn(form,key)||key.length>128)throw new Error('Duplicate webhook parameter');form[key]=value;}
  if(!validateRequest(config.authToken,request.headers.get('x-twilio-signature')??'',url.href,form))throw new Error('Invalid provider signature');
  if(form.AccountSid!==config.accountSid)throw new Error('Invalid provider account');
  if(url.searchParams.getAll('pilotId').length>1||url.searchParams.getAll('turn').length>1)throw new Error('Ambiguous callback scope');
  return {kind:kind as VerifiedWebhook['kind'],pilotId:url.searchParams.get('pilotId')??undefined,turn:url.searchParams.get('turn')??'0',form,digest:hash({url:url.href,form})};
}
export function ingestReceipt(input:PilotState,receipt:VerifiedWebhook,endpoints:EndpointConfig,nowMs:number):PilotState {
  const state=PilotStateSchema.parse(input),run=currentRun(state),f=receipt.form;
  if(receipt.pilotId&&receipt.pilotId!==run.plan.id)throw new Error('Callback scope mismatch');
  if(nowMs<run.admittedAt||nowMs>run.quarantineUntil)throw new Error('Callback lease expired');
  let key:string;
  if(receipt.kind==='sms'){
    if(f.From!==endpoints.expectedSender||f.To!==endpoints.callerNumber)throw new Error('SMS endpoint mismatch');
    if(!/^SM[a-f0-9]{32}$/.test(f.MessageSid??'')||typeof f.Body!=='string'||f.Body.length>16384)throw new Error('Invalid message receipt');
    key=`sms:${f.MessageSid}`;
  }else{
    if(!receipt.pilotId||f.From!==endpoints.callerNumber||f.To!==endpoints.targetNumber||f.CallSid!==run.callId)throw new Error('Call endpoint or binding mismatch');
    key=receipt.kind==='status'?`status:${f.CallSid}:${f.SequenceNumber??f.CallStatus}`:`${receipt.kind}:${f.CallSid}:${receipt.turn}`;
  }
  const prior=run.webhookDigests[key];
  if(prior){if(prior!==receipt.digest)throw new Error('Callback replay conflict');return state;}
  if(Object.keys(run.webhookDigests).length>=200)throw new Error('Callback limit exhausted');
  run.webhookDigests[key]=receipt.digest;
  if(receipt.kind==='sms')run.receipts.push({id:f.MessageSid!,from:f.From!,to:f.To!,body:f.Body!,receivedAt:nowMs,source:'webhook'});
  if(receipt.kind==='status'){
    const sequence=Number(f.SequenceNumber??0);
    if(!Number.isSafeInteger(sequence)||sequence<0)throw new Error('Invalid call sequence');
    run.lastCallSequence=Math.max(run.lastCallSequence,sequence);
    if(['completed','busy','failed','no-answer','canceled'].includes(f.CallStatus??''))run.callTerminal=true;
  }
  state.version++;return PilotStateSchema.parse(state);
}
