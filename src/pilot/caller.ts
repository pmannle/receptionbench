export interface CallerState {stage:'greeting'|'request'|'consent'|'done';turns:number;recipientName:string;deadlineAt:number}
export interface CallerObservation {text:string;nowMs:number}
export type CallerAction={kind:'listen'}|{kind:'speak';text:string}|{kind:'hangup'};
export interface CallerTransition {stage:CallerState['stage'];turns:number;limited:boolean;action:CallerAction}
export function callerReplyAllowed(state:{stopped:boolean;deadlineAt:number;quarantineUntil:number},nowMs:number):boolean{return !state.stopped&&nowMs<state.deadlineAt&&nowMs<=state.quarantineUntil;}
export function nextCallerTurn(state:CallerState,observation:CallerObservation):CallerTransition {
  const done=(limited:boolean):CallerTransition=>({stage:'done',turns:state.turns,limited,action:{kind:'hangup'}});
  if(state.stage==='done')return done(false);
  if(observation.nowMs>=state.deadlineAt||state.turns>=4||!observation.text.trim())return done(true);
  if(state.stage==='greeting'){
    if(!/hello|hi\b|welcome|thank|help|salon|speaking|reception/i.test(observation.text))return done(true);
    return {stage:'request',turns:state.turns+1,limited:false,action:{kind:'speak',text:`I'd like the booking link for ${state.recipientName}. Please text it to the number I'm calling from. Yes, I consent to that text.`}};
  }
  if(/(?:has been sent|have sent|i.ve sent|just sent|on its way|you should receive|sending (?:it|that|the)|i.ll (?:send|text))/i.test(observation.text))return done(false);
  if(state.stage==='request'&&/(?:may|can|would|do|is|shall|confirm|permission|consent|okay|ok).*(?:text|send|number|message)|(?:text|send|number).*(?:okay|ok|consent|permission|correct)/i.test(observation.text)){
    return {stage:'consent',turns:state.turns+1,limited:false,action:{kind:'speak',text:'Yes, I consent. Please send the booking link to the number I am calling from.'}};
  }
  return done(true);
}
const xml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function renderTwiml(action:CallerAction,callbackUrl:string):string {
  const u=new URL(callbackUrl);if(u.protocol!=='https:'||u.hash||u.username||u.password)throw new Error('Invalid callback URL');
  if(action.kind==='hangup')return '<?xml version="1.0"?><Response><Hangup/></Response>';
  const prompt=action.kind==='speak'?`<Say voice="woman" language="en-US">${xml(action.text)}</Say>`:'';
  return `<?xml version="1.0"?><Response>${prompt}<Gather input="speech" language="en-US" speechModel="googlev2_telephony" speechTimeout="auto" timeout="5" actionOnEmptyResult="true" method="POST" action="${xml(callbackUrl)}"/><Hangup/></Response>`;
}
