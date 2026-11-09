export type CompanionDevice = {id:string;name:string;paired:boolean;reachable:boolean;verificationKey?:string;battery?:{percent:number|null;charging:boolean};capabilities?:Record<string,boolean>};
export type CompanionStatus = {provider:string;available:boolean;packageInstalled:boolean;reason:string|null;screenMirroring:false;phoneCallAudio:false;clipboardSync:false;smsHistory:false};
export type CompanionNotification = {id:string;appName:string;title:string;text:string;canReply:boolean;dismissable:boolean;silent:boolean};
export declare const companions: {
 status():Promise<CompanionStatus>;list():Promise<{devices:CompanionDevice[]}>;device(deviceId:string):Promise<CompanionDevice>;
 discover():Promise<unknown>;pair(deviceId:string):Promise<unknown>;unpair(deviceId:string):Promise<unknown>;ring(deviceId:string):Promise<unknown>;
 shareText(deviceId:string,text:string):Promise<unknown>;shareUrl(deviceId:string,url:string):Promise<unknown>;shareFile(deviceId:string):Promise<unknown>;
 notifications(deviceId:string,offset?:number):Promise<{notifications:CompanionNotification[];nextOffset:number|null}>;
 reply(deviceId:string,notificationId:string,text:string):Promise<unknown>;dismiss(deviceId:string,notificationId:string):Promise<unknown>;
 conversations(deviceId:string,offset?:number):Promise<{conversations:{threadId:string;text:string;date:string;addresses:string[];read:boolean}[];nextOffset:number|null;snapshot:true;historyAvailable:false}>;
 sendSms(deviceId:string,number:string,text:string):Promise<{accepted:boolean;delivered:false}>;
};
