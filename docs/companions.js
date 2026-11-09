import {request} from './simplyos.js';
/** Calls are permission checked by SimplyOS. Mutations open the system consent dialog. */
export const companions = Object.freeze({
 status: () => request('devices.companion.status'),
 list: () => request('devices.companion.list'),
 device: deviceId => request('devices.companion.device',{deviceId}),
 discover: () => request('devices.companion.discover'),
 pair: deviceId => request('devices.companion.pair',{deviceId}),
 unpair: deviceId => request('devices.companion.unpair',{deviceId}),
 ring: deviceId => request('devices.companion.ring',{deviceId}),
 shareText: (deviceId,text) => request('devices.companion.shareText',{deviceId,text}),
 shareUrl: (deviceId,url) => request('devices.companion.shareUrl',{deviceId,url}),
 shareFile: deviceId => request('devices.companion.shareFile',{deviceId}),
 notifications: (deviceId,offset=0) => request('devices.companion.notifications.list',{deviceId,offset}),
 reply: (deviceId,notificationId,text) => request('devices.companion.notifications.reply',{deviceId,notificationId,text}),
 dismiss: (deviceId,notificationId) => request('devices.companion.notifications.dismiss',{deviceId,notificationId}),
 conversations: (deviceId,offset=0) => request('devices.companion.sms.conversations',{deviceId,offset}),
 sendSms: (deviceId,number,text) => request('devices.companion.sms.send',{deviceId,number,text})
});
