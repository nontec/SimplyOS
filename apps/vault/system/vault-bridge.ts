import {chooseFiles} from './file-picker';

type Prompt=(title:string,label:string,initial?:string,inputType?:string)=>Promise<string|null>;
let clipboardTimer:number|undefined;

async function vaultCall(fields:Record<string,unknown>){
 const response=await fetch('/api/system/vault',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});
 const data=await response.json();
 if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Хранилище недоступно');
 return data;
}

export async function vaultRequest(payload:any,owner:HTMLElement,prompt:Prompt){
 const action=payload?.action;
 if(action==='open'||action==='create'){
  const creating=action==='create';
  const selected=await chooseFiles({title:creating?'Создать хранилище KeePassXC':'Открыть хранилище KeePassXC',extensions:['.kdbx'],...(creating?{saveName:'Пароли.kdbx'}:{})});
  if(!selected?.[0]||!owner.isConnected)return {cancelled:true};
  const password=await prompt(creating?'Создать хранилище':'Разблокировать хранилище','Мастер-пароль','','password');
  if(creating&&password!==null&&await prompt('Подтвердить мастер-пароль','Повторите мастер-пароль','','password')!==password)throw Error('Пароли не совпали');
  if(password===null||!owner.isConnected)return {cancelled:true};
  const status=await vaultCall({action,path:selected[0],password});
  if(!owner.isConnected){await vaultCall({action:'lock'});return {locked:true};}
  if(!owner.dataset.vaultCloseListener){
   owner.dataset.vaultCloseListener='yes';
   owner.addEventListener('simplyos:close',()=>void vaultCall({action:'lock'}).catch(()=>{}));
  }
  return status;
 }
 if(action==='lock'){
  void window.simplyosBrowserHost?.vaultClipboard?.(null).catch(()=>{});
  return vaultCall({action});
 }
 if(action==='status')return vaultCall({action});
 if(action==='add'){
  const title=await prompt('Добавить запись','Название');
  if(!title||!owner.isConnected)return {cancelled:true};
  const username=await prompt('Добавить запись','Имя пользователя');
  if(username===null||!owner.isConnected)return {cancelled:true};
  const password=await prompt('Добавить запись','Пароль записи','','password');
  if(password===null||!owner.isConnected)return {cancelled:true};
  return vaultCall({action,title,username,password});
 }
 if(action==='copy'&&typeof payload.entry==='string'&&['Username','Password'].includes(payload.field)){
  const {value}=await vaultCall({action,entry:payload.entry,field:payload.field});
  if(!owner.isConnected||document.getElementById('desktopScreen')?.classList.contains('hidden'))throw Error('Сеанс заблокирован');
  if(window.simplyosBrowserHost?.vaultClipboard){
   await window.simplyosBrowserHost.vaultClipboard(value);
   return {copied:true};
  }
  await navigator.clipboard.writeText(value);
  clearTimeout(clipboardTimer);
  clipboardTimer=window.setTimeout(()=>void navigator.clipboard.readText().then(text=>{
   if(text===value)return navigator.clipboard.writeText('');
  }).catch(()=>{}),30000);
  return {copied:true};
 }
 throw Error('Неизвестная операция хранилища');
}
