export interface DialRequest {from:string;to:string;voiceUrl:string;statusUrl:string;timeLimitSeconds:120}
export interface CallObservation {id:string;from:string;to:string;status:string;terminal:boolean;price:string|null;priceUnit:string|null;durationSeconds:number|null}
export interface ReceiptScope {from:string;to:string;sinceMs:number;untilMs:number}
export interface ProviderReceipt {id:string;from:string;to:string;body:string;sentAt:number;price:string|null;priceUnit:string|null}
export interface UsageObservation {costCents:number|null;uncertain:boolean}
export interface PilotProvider {
 createCall(request:DialRequest):Promise<{callId:string}>;
 getCall(callId:string):Promise<CallObservation>;
 stopCall(callId:string):Promise<void>;
 listReceipts(scope:ReceiptScope):Promise<ProviderReceipt[]>;
 reconcileUsage(scope:ReceiptScope):Promise<UsageObservation>;
}
