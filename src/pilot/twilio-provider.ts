import { z } from 'zod/v3';
import type {PilotProvider,DialRequest,CallObservation,ReceiptScope,ProviderReceipt,UsageObservation} from './provider.js';
const callId=z.string().regex(/^CA[a-f0-9]{32}$/);
const price=z.string().regex(/^-?\d+(?:\.\d+)?$/).nullable();
const number=z.string().regex(/^\+[1-9]\d{7,14}$/);
const CallSchema=z.object({sid:callId,from:number,to:number,status:z.enum(['queued','initiated','ringing','in-progress','completed','busy','failed','no-answer','canceled']),price,price_unit:z.string().nullable(),duration:z.string().regex(/^\d+$/).nullable()});
const MessageSchema=z.object({sid:z.string().regex(/^SM[a-f0-9]{32}$/),from:number,to:number,body:z.string().max(16384),date_sent:z.string(),price,price_unit:z.string().nullable()});
export class TwilioPilotProvider implements PilotProvider {
 private readonly base:string;
 constructor(private config:{accountSid:string;authToken:string},private fetcher:typeof fetch=fetch){
  if(!/^AC[a-f0-9]{32}$/.test(config.accountSid))throw new Error('Invalid account identifier');
  this.base=`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}`;
 }
 private async api(path:string,body?:URLSearchParams):Promise<unknown>{
  const response=await this.fetcher.call(globalThis,this.base+path,{method:body?'POST':'GET',headers:{Authorization:`Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64')}`,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body,redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`Provider request failed (${response.status})`);
  return response.json();
 }
 async createCall(request:DialRequest):Promise<{callId:string}>{
  number.parse(request.from);number.parse(request.to);
  if(request.timeLimitSeconds!==120)throw new Error('Invalid call time limit');
  for(const address of [request.voiceUrl,request.statusUrl]){const url=new URL(address);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new Error('Invalid callback URL');}
  const form=new URLSearchParams({From:request.from,To:request.to,Url:request.voiceUrl,Method:'POST',StatusCallback:request.statusUrl,StatusCallbackMethod:'POST',TimeLimit:'120',Timeout:'30',Record:'false'});
  for(const status of ['initiated','ringing','answered','completed'])form.append('StatusCallbackEvent',status);
  return {callId:z.object({sid:callId}).parse(await this.api('/Calls.json',form)).sid};
 }
 async getCall(id:string):Promise<CallObservation>{
  if(!callId.safeParse(id).success)throw new Error('Invalid call identifier');
  const c=CallSchema.parse(await this.api(`/Calls/${id}.json`));
  return {id:c.sid,from:c.from,to:c.to,status:c.status,terminal:['completed','busy','failed','no-answer','canceled'].includes(c.status),price:c.price,priceUnit:c.price_unit,durationSeconds:c.duration===null?null:Number(c.duration)};
 }
 async stopCall(id:string):Promise<void>{
  if(!callId.safeParse(id).success)throw new Error('Invalid call identifier');
  await this.api(`/Calls/${id}.json`,new URLSearchParams({Status:'completed'}));
 }
 async listReceipts(scope:ReceiptScope):Promise<ProviderReceipt[]>{
  const query=new URLSearchParams({From:scope.from,To:scope.to,PageSize:'100','DateSent>=':new Date(scope.sinceMs).toISOString().slice(0,10)});
  const data=z.object({messages:z.array(MessageSchema).max(100),next_page_uri:z.string().nullable()}).parse(await this.api('/Messages.json?'+query));
  if(data.next_page_uri)throw new Error('Receipt pagination incomplete');
  return data.messages.map(m=>({id:m.sid,from:m.from,to:m.to,body:m.body,sentAt:Date.parse(m.date_sent),price:m.price,priceUnit:m.price_unit})).filter(m=>Number.isFinite(m.sentAt)&&m.sentAt>=scope.sinceMs&&m.sentAt<=scope.untilMs);
 }
 async findCalls(from:string,to:string,sinceMs:number):Promise<CallObservation[]>{
  const query=new URLSearchParams({From:from,To:to,PageSize:'100','StartTime>=':new Date(sinceMs).toISOString().slice(0,10)});
  const data=z.object({calls:z.array(CallSchema.extend({date_created:z.string()})).max(100),next_page_uri:z.string().nullable()}).parse(await this.api('/Calls.json?'+query));
  if(data.next_page_uri)throw new Error('Call pagination incomplete');
  const ids=data.calls.filter(c=>Date.parse(c.date_created)>=sinceMs-1000&&c.from===from&&c.to===to);
  return Promise.all(ids.map(c=>this.getCall(c.sid)));
 }
 async reconcileUsage(scope:ReceiptScope):Promise<UsageObservation>{
  // Dedicated subaccount only: account-wide usage includes all provider categories,
  // including speech. Target-side model charges remain explicitly unmeasured.
  const data=z.object({usage_records:z.array(z.object({category:z.string(),price:z.union([z.string(),z.number()]).nullable(),price_unit:z.string()}))}).parse(await this.api('/Usage/Records/Today.json?Category=totalprice'));
  const total=data.usage_records.find(r=>r.category==='totalprice');
  if(!total||total.price===null||total.price_unit.toLowerCase()!=='usd'||!Number.isFinite(Number(total.price)))return {costCents:null,uncertain:true};
  return {costCents:Math.ceil(Math.abs(Number(total.price))*100),uncertain:true};
 }
}
