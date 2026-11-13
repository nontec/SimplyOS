const $=id=>document.getElementById(id);
const api=(action,fields={})=>window.simplyos.request('vault.request',{action,...fields});
let state={locked:true},busy=false,timer=0;
function render(){
 $('vault').hidden=state.locked;$('lock').hidden=state.locked;$('add').hidden=state.locked;
 for(const id of ['open','lock','create','add'])$(id).disabled=busy;
 const entries=$('entries');
 entries.replaceChildren();
 if(state.locked){$('query').value='';return;}
 const filter=$('query').value.toLocaleLowerCase();
 for(const entry of (state.entries||[]).filter(item=>item.name.toLocaleLowerCase().includes(filter))){
  const row=document.createElement('li'),name=document.createElement('strong'),actions=document.createElement('div');
  name.textContent=entry.name;row.append(name,actions);
  actions.className='actions';
  for(const [field,label] of [['Username','Копировать логин'],['Password','Копировать пароль']]){
   const button=document.createElement('button');button.textContent=label;
   button.onclick=async()=>{
    try{await api('copy',{entry:entry.id,field});$('status').textContent='Скопировано. Буфер будет очищен через 30 секунд.';}
    catch(error){$('status').textContent=error.message;}
   };
   actions.append(button);
  }
  entries.append(row);
 }
 if(!entries.children.length){const empty=document.createElement('li');empty.textContent='Нет подходящих записей';entries.append(empty);}
}
async function act(action){
 if(busy)return;
 busy=true;render();
 try{
  const result=await api(action);
  if(!result.cancelled){state=result;$('status').textContent=state.locked?'Хранилище заблокировано.':state.name;}
 }catch(error){$('status').textContent=error.message;await refresh(true);}
 finally{busy=false;render();}
}
async function refresh(force=false){
 if(busy&&!force)return;
 try{
  const result=await api('status');
  if(result.locked!==state.locked||result.name!==state.name){
   state=result;$('status').textContent=state.locked?'Хранилище заблокировано.':state.name;render();
  }
 }catch{
  if(!state.locked){state={locked:true};$('status').textContent='Хранилище заблокировано.';render();}
 }
}
$('query').oninput=render;
for(const action of ['open','create','add','lock'])$(action).onclick=()=>void act(action);
window.addEventListener('pagehide',()=>clearInterval(timer));
void refresh();timer=setInterval(refresh,1500);
