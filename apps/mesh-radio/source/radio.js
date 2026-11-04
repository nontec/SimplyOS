// SPDX-License-Identifier: GPL-3.0-only
// Application protocols live here. The OS only moves bytes to approved targets.
import {create,fromBinary,toBinary} from '@bufbuild/protobuf';
export {create,fromBinary,toBinary,Protobuf};
import {MeshDevice,Protobuf,Types} from './vendor/meshtastic-js/packages/core/mod.ts';
import Connection from './vendor/meshcore/src/connection/connection.js';
import SerialConnection from './vendor/meshcore/src/connection/serial_connection.js';
import Constants from './vendor/meshcore/src/constants.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const bytes=value=>Uint8Array.from(atob(value||''),c=>c.charCodeAt(0));
const base64=value=>{let text='';for(const byte of value)text+=String.fromCharCode(byte);return btoa(text);};
const hex=value=>Array.from(value,x=>x.toString(16).padStart(2,'0')).join('');
const nodeId=value=>'!'+Number(value).toString(16).padStart(8,'0');
export function bounded(promise,ms=20000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Радиоустройство не ответило вовремя')),ms);})]).finally(()=>clearTimeout(timer));}
const MT={service:'6ba1b218-15a8-461f-9fa8-5dcae273eafd',to:'f75c76d2-129e-4dad-a1dd-7866124401e7',from:'2c55e69e-4993-11ed-b878-0242ac120002',number:'ed9da18c-a800-4f66-a670-aa7547e34453'};
const MC={service:Constants.Ble.ServiceUuid.toLowerCase(),to:Constants.Ble.CharacteristicUuidRx.toLowerCase(),from:Constants.Ble.CharacteristicUuidTx.toLowerCase()};

export class RawChannel {
 constructor(api,kind,handle){this.api=api;this.kind=kind;this.handle=handle;this.closed=false;this.sending=Promise.resolve();this.gattQueue=Promise.resolve();}
 static async open(api,options){
  const kind=options.transport==='usb'?'devices.serial':options.transport==='ip'?'network.tcp':'devices.bluetooth.gatt';
  const ble=options.protocol==='meshtastic'?MT:MC;
  const payload=options.transport==='usb'?{deviceId:options.address,baudRate:115200}:options.transport==='ip'?{host:options.address,port:options.port||(options.protocol==='meshtastic'?4403:4000),tls:false}:{address:options.address,services:[ble.service]};
  const value=await api.request(kind+'.open',payload);
  const channel=new RawChannel(api,kind,value.handle);channel.ble=ble;
  try{
   if(kind==='devices.bluetooth.gatt'){
    const details=await channel.call('services');
    const write=details.services.flatMap(service=>service.characteristics).find(c=>c.uuid.toLowerCase()===ble.to);
    if(!write)throw new Error('Не найдена характеристика записи');
    channel.bleResponse=write.properties.includes('write');
    await channel.call('subscribe',{characteristic:options.protocol==='meshtastic'?MT.number:MC.from});
   }
   return channel;
  }catch(error){await channel.close();throw error;}
 }
 call(action,payload={}){
  const run=()=>this.api.request(this.kind+'.'+action,{handle:this.handle,...payload});
  if(this.kind!=='devices.bluetooth.gatt')return run();
  const result=this.gattQueue.then(run);this.gattQueue=result.catch(()=>{});return result;
 }
 async write(value){
  const run=()=>this.kind==='devices.bluetooth.gatt'?this.call('write',{characteristic:this.ble.to,data:base64(value),response:this.bleResponse}):this.call('write',{data:base64(value)});
  const pending=this.sending.then(run);this.sending=pending.catch(()=>{});await pending;
 }
 async read(){const value=await this.call('read',{maxBytes:65536});if(value.connected===false)throw new Error('Устройство отключено');return bytes(value.data);}
 async close(){if(this.closed)return;this.closed=true;await this.call('close').catch(()=>{});}
}

export class MeshtasticFramer {
 constructor(){this.buffer=new Uint8Array();}
 feed(chunk){
  this.buffer=new Uint8Array([...this.buffer,...chunk]);const packets=[];
  while(this.buffer.length>=4){
   if(this.buffer[0]!==0x94||this.buffer[1]!==0xc3){this.buffer=this.buffer.slice(1);continue;}
   const length=(this.buffer[2]<<8)|this.buffer[3];
   if(!length||length>4096){this.buffer=this.buffer.slice(2);continue;}
   if(this.buffer.length<length+4)break;
   packets.push(this.buffer.slice(4,4+length));this.buffer=this.buffer.slice(4+length);
  }
  if(this.buffer.length>65536)throw new Error('Некорректный поток Meshtastic');
  return packets;
 }
 static encode(raw){return new Uint8Array([0x94,0xc3,raw.length>>8,raw.length&255,...raw]);}
}

class Device extends MeshDevice {
 constructor(transport){super(transport);this.pending=new Map();this.events.onQueueStatus.subscribe(status=>{
  const request=this.pending.get(status.meshPacketId);if(!request)return;
  this.pending.delete(status.meshPacketId);status.res===0?request.resolve(status.meshPacketId):request.reject(new Error('Радиоустройство отклонило пакет'));
 });}
 async sendRaw(raw){
  const message=fromBinary(Protobuf.Mesh.ToRadioSchema,raw);
  const writer=this.transport.toDevice.getWriter();
  const packet=message.payloadVariant.case==='packet'?message.payloadVariant.value:null;
  let pending;
  if(packet){pending=new Promise((resolve,reject)=>this.pending.set(packet.id,{resolve,reject}));pending.catch(()=>{});}
  try{await writer.write(raw);}catch(error){this.pending.delete(packet?.id);throw error;}finally{writer.releaseLock();}
  if(!packet)return 0;
  try{return await bounded(pending,10000);}finally{this.pending.delete(packet.id);}
 }
 closePending(){for(const request of this.pending.values())request.reject(new Error('Соединение закрыто'));this.pending.clear();}
}

export class MeshtasticClient {
 constructor(raw,onMessage){this.raw=raw;this.onMessage=onMessage;this.nodes=new Map();this.configs=new Map();this.myNum=0;this.connected=false;this.framer=new MeshtasticFramer();}
 async connect(){
  const transport={toDevice:new WritableStream({write:data=>this.raw.write(this.raw.kind==='devices.bluetooth.gatt'?data:MeshtasticFramer.encode(data))}),
   fromDevice:new ReadableStream({start:controller=>this.controller=controller}),disconnect:()=>this.close()};
  this.device=new Device(transport);
  this.device.log.settings.minLevel=5;
  this.device.events.onDeviceStatus.subscribe(status=>{if(status===Types.DeviceStatusEnum.DeviceDisconnected){this.connected=false;void this.raw.close();}});
  this.device.events.onMyNodeInfo.subscribe(info=>this.myNum=info.myNodeNum);
  this.device.events.onNodeInfoPacket.subscribe(info=>this.nodes.set(info.num,info));
  this.device.events.onConfigPacket.subscribe(config=>this.configs.set(config.payloadVariant.case,config));
  this.device.events.onMessagePacket.subscribe(packet=>this.onMessage({text:packet.data,sender:nodeId(packet.from),direction:packet.from===this.myNum?'outgoing':'incoming',channel:packet.channel,time:Math.floor(packet.rxTime.getTime()/1000)||Math.floor(Date.now()/1000)}));
  const configured=new Promise(resolve=>this.device.events.onDeviceStatus.subscribe(status=>{if(status===Types.DeviceStatusEnum.DeviceConfigured)resolve();}));
  this.connected=true;
  this.pumpPromise=this.pump().catch(error=>{this.error=error.message;this.connected=false;clearInterval(this.heartbeat);clearInterval(this.timer);void this.raw.close();});
  try{await this.device.configure();await bounded(configured,25000);}catch(error){await this.close();throw error;}
  this.heartbeat=setInterval(()=>void this.device.heartbeat().catch(()=>{}),45000);
 }
 async pump(){
  while(!this.raw.closed){
   if(this.raw.kind==='devices.bluetooth.gatt'){
    await this.raw.call('events');
    for(let count=0;count<128;count++){
     const packet=bytes((await this.raw.call('read',{characteristic:MT.from})).data);
     if(!packet.length)break;this.controller.enqueue({type:'packet',data:packet});
    }
    await sleep(200);
   }else{
    const chunk=await this.raw.read();
    for(const packet of this.framer.feed(chunk))this.controller.enqueue({type:'packet',data:packet});
    if(!chunk.length)await sleep(20);
   }
  }
 }
 listNodes(){return [...this.nodes.values()].map(node=>({id:nodeId(node.num),name:node.user?.longName||nodeId(node.num),shortName:node.user?.shortName||''}));}
 async send(payload){
  const destination=payload.target?parseInt(payload.target.replace(/^!/,''),16):'broadcast';
  if(destination!=='broadcast'&&!Number.isInteger(destination))throw new Error('Некорректный адрес узла');
  await this.device.sendText(payload.text,destination,false,Number(payload.channel)||0);
 }
 async configure(payload){
  if(payload.name!==undefined||payload.shortName!==undefined){
   const previous=this.nodes.get(this.myNum)?.user;if(!previous)throw new Error('Сведения о владельце ещё не прочитаны. Повторите позже');
   await this.device.setOwner(create(Protobuf.Mesh.UserSchema,{...previous,...(payload.name!==undefined?{longName:payload.name}:{}),...(payload.shortName!==undefined?{shortName:payload.shortName}:{})}));
  }
  if(['txPower','region','preset'].some(name=>payload[name]!==undefined)){
   const previous=this.configs.get('lora');if(!previous)throw new Error('Конфигурация LoRa ещё не прочитана. Изменение отменено');
   const value={...previous.payloadVariant.value};
   if(payload.txPower!==undefined)value.txPower=payload.txPower;
   if(payload.region!==undefined){const region=Protobuf.Config.Config_LoRaConfig_RegionCode[payload.region];if(typeof region!=='number')throw new Error('Неизвестный регион');value.region=region;}
   if(payload.preset!==undefined){const preset=Protobuf.Config.Config_LoRaConfig_ModemPreset[payload.preset];if(typeof preset!=='number')throw new Error('Неизвестный пресет');value.modemPreset=preset;value.usePreset=true;}
   await this.device.setConfig(create(Protobuf.Config.ConfigSchema,{payloadVariant:{case:'lora',value}}));
   await this.device.commitEditSettings();
  }
 }
 async close(){this.connected=false;clearInterval(this.heartbeat);this.device?.closePending();await this.raw.close();try{this.controller?.close();}catch{}}
}

export class MeshCoreClient {
 constructor(raw,onMessage){this.raw=raw;this.onMessage=onMessage;this.connected=false;this.contacts=[];this.chain=Promise.resolve();}
 command(callback){const pending=this.chain.then(()=>bounded(callback(),15000));this.chain=pending.catch(()=>{});return pending;}
 async connect(){
  const self=this;
  if(this.raw.kind==='devices.bluetooth.gatt'){
   this.device=new class extends Connection {sendToRadioFrame(data){return self.raw.write(data);}close(){return self.raw.close();}};
  }else{
   this.device=new class extends SerialConnection {write(data){return self.raw.write(data);}close(){return self.raw.close();}};
  }
  this.device.on(Constants.ResponseCodes.ContactMsgRecv,p=>this.onMessage({text:p.text,sender:hex(p.pubKeyPrefix),channel:0,direction:'incoming',time:p.senderTimestamp}));
  this.device.on(Constants.ResponseCodes.ChannelMsgRecv,p=>this.onMessage({text:p.text,sender:'Канал '+p.channelIdx,channel:p.channelIdx,direction:'incoming',time:p.senderTimestamp}));
  this.device.on(Constants.PushCodes.MsgWaiting,()=>void this.fetchMessages().catch(()=>{}));
  this.connected=true;
  this.pumpPromise=this.pump().catch(error=>{this.error=error.message;this.connected=false;clearInterval(this.heartbeat);clearInterval(this.timer);void this.raw.close();});
  try{
   await bounded(this.device.onConnected(),15000);
   await this.device.sendCommandAppStart();
   this.contacts=await this.command(()=>this.device.getContacts());
   await this.fetchMessages();
  }catch(error){await this.close();throw error;}
  this.timer=setInterval(()=>{if(this.connected)void this.fetchMessages().catch(()=>{});},10000);
 }
 async pump(){while(!this.raw.closed){
  if(this.raw.kind==='devices.bluetooth.gatt'){
   const answer=await this.raw.call('events');
   for(const event of answer.events||[])if(event.characteristic===MC.from)this.device.onFrameReceived(bytes(event.data));
   await sleep(150);
  }else{const chunk=await this.raw.read();if(chunk.length)await this.device.onDataReceived(chunk);else await sleep(20);}
 }}
 fetchMessages(){return this.command(()=>this.device.getWaitingMessages());}
 async listNodes(){this.contacts=await this.command(()=>this.device.getContacts());return this.contacts.map(contact=>({id:hex(contact.publicKey),name:contact.advName||hex(contact.publicKey).slice(0,12),shortName:(contact.advName||'').slice(0,4)}));}
 async send(payload){
  if(payload.target){const contact=this.contacts.find(item=>hex(item.publicKey)===payload.target);if(!contact)throw new Error('Контакт не найден');await this.command(()=>this.device.sendTextMessage(contact.publicKey,payload.text));}
  else await this.command(()=>this.device.sendChannelTextMessage(Number(payload.channel)||0,payload.text));
  this.onMessage({text:payload.text,sender:'Вы',direction:'outgoing',channel:Number(payload.channel)||0,time:Math.floor(Date.now()/1000)});
 }
 async configure(payload){if(payload.name!==undefined)await this.command(()=>this.device.setAdvertName(payload.name));if(payload.txPower!==undefined)await this.command(()=>this.device.setTxPower(payload.txPower));}
 async close(){this.connected=false;clearInterval(this.timer);await this.raw.close();}
}

export function createRadio(api){
 let client=null,options={},sequence=0,events=[];
 const received=message=>{events.push({...message,seq:++sequence});events=events.slice(-300);};
 return {async request(method,payload={}){
  const action=method.replace(/^radio\./,'');
  if(action==='devices.list'){
   const serial=await api.request('devices.serial.list');
   let bluetooth=[],bluetoothError='';
   try{bluetooth=(await api.request('devices.bluetooth.scan')).devices||[];}catch(error){bluetoothError=error.message;}
   return {serial:serial.devices||[],bluetooth,bluetoothError};
  }
  if(action==='connect'){
   await client?.close();options=payload;events=[];sequence=0;
   const raw=await RawChannel.open(api,payload);
   client=payload.protocol==='meshtastic'?new MeshtasticClient(raw,received):new MeshCoreClient(raw,received);
   try{await client.connect();}catch(error){await raw.close();client=null;throw error;}
   return {connected:true,...options};
  }
  if(action==='disconnect'){await client?.close();client=null;return {connected:false};}
  if(action==='status'){
   if(client?.connected){try{const status=await api.request('io.status',{handle:client.raw.handle});if(!status.connected)await client.close();}catch(error){client.error=error.message;await client.close();}}
   return {connected:Boolean(client?.connected),...options,error:client?.error};
  }
  if(!client?.connected)throw new Error('Устройство не подключено');
  if(action==='messages')return {messages:events.filter(item=>item.seq>Number(payload.after||0))};
  if(action==='nodes')return {nodes:await client.listNodes()};
  if(action==='send'){
   if(typeof payload.text!=='string'||!payload.text.trim()||new TextEncoder().encode(payload.text).length>180)throw new Error('Сообщение должно содержать от 1 до 180 байт UTF-8');
   await client.send(payload);return {sent:true};
  }
  if(action==='configure'){
   if(payload.txPower!==undefined&&(!Number.isInteger(payload.txPower)||payload.txPower<0||payload.txPower>30))throw new Error('Мощность должна быть от 0 до 30 дБм');
   if(payload.name!==undefined&&(typeof payload.name!=='string'||!payload.name||payload.name.length>32))throw new Error('Имя должно содержать от 1 до 32 символов');
   if(payload.shortName!==undefined&&(typeof payload.shortName!=='string'||payload.shortName.length>4))throw new Error('Короткое имя — до 4 символов');
   await client.configure(payload);return {saved:true};
  }
  throw new Error('Неизвестная операция приложения');
 }};
}

globalThis.simplyosMeshRadio=createRadio({request:(method,payload)=>window.simplyos.request(method,payload)});
