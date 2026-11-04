(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = window.simplyos;
  const state = {connected:false, protocol:'meshtastic', transport:'usb', address:'',
    nodes:[], history:[], profiles:{}, lastSeq:0, conversation:'', polling:false, busy:false};
  let saveTimer, toastTimer;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const request = (method, payload) => method.startsWith('radio.')?window.simplyosMeshRadio.request(method,payload):api.request(method,payload);

  function toast(message, error=false) {
    const node=$('toast'); node.textContent=message; node.classList.toggle('error',error);
    node.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>node.classList.remove('show'),4500);
  }
  function errorText(error) { return error instanceof Error ? error.message : 'Операция не выполнена'; }
  function profileKey() { return `${$('protocol').value}:${$('transport').value}`; }
  function updateTransport() {
    const protocol=$('protocol').value, transport=$('transport').value;
    $('device-select-wrap').hidden=transport==='ip'; $('address-wrap').hidden=transport!=='ip';
    $('pin-wrap').hidden=true;
    $('address').placeholder=transport==='ip'?'192.168.1.100':'Адрес устройства';
    document.querySelectorAll('.meshtastic-only').forEach(item=>item.hidden=protocol!=='meshtastic');
    const profile=state.profiles[profileKey()];
    if(profile){ if(transport==='ip')$('address').value=profile.address||'';
      else if(profile.address&&!Array.from($('device-select').options).some(option=>option.value===profile.address)){
        $('device-select').add(new Option(profile.address,profile.address)); $('device-select').value=profile.address;
      }else if(profile.address)$('device-select').value=profile.address;
    }
  }
  function updateConnection(connected, details={}) {
    state.connected=Boolean(connected);
    if(connected){state.protocol=details.protocol||state.protocol;state.transport=details.transport||state.transport;state.address=details.address||state.address;}
    $('status-dot').classList.toggle('connected',state.connected);
    $('top-status').textContent=state.connected?`${state.protocol==='meshtastic'?'Meshtastic':'MeshCore'} · ${state.address}`:'Устройство не подключено';
    $('connect').disabled=state.connected||state.busy; $('disconnect').disabled=!state.connected||state.busy;
    $('refresh-nodes').disabled=!state.connected; $('message-text').disabled=!state.connected; $('send').disabled=!state.connected;
    $('save-settings').disabled=!state.connected;
    $('chat-subtitle').textContent=state.connected?`Подключено по ${state.transport==='usb'?'USB/COM':state.transport==='ip'?'IP':'Bluetooth'}. Для личного сообщения выберите узел.`:'Подключите Meshtastic или MeshCore, чтобы начать обмен.';
  }
  function setBusy(value, label='Подключить') {state.busy=value;$('connect').textContent=value?'Подключение…':label;updateConnection(state.connected);}
  function scheduleSave() {
    clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{
      try{await request('app.data.write',JSON.stringify({profiles:state.profiles,history:state.history.slice(-500)}));}
      catch(error){console.warn('Не удалось сохранить историю Mesh Радио:',errorText(error));}
    },600);
  }
  async function restore() {
    try{
      const saved=await request('app.data.read');const value=JSON.parse(saved.content||'{}');
      if(value.profiles&&typeof value.profiles==='object')state.profiles=value.profiles;
      if(Array.isArray(value.history))state.history=value.history.filter(item=>item&&typeof item.text==='string').slice(-500);
    }catch(error){console.warn('История не прочитана:',errorText(error));}
    updateTransport();renderMessages();
  }
  async function scan() {
    $('scan').disabled=true;$('scan-note').textContent='Поиск USB и Bluetooth-устройств…';
    try{
      const found=await request('radio.devices.list');
      const transport=$('transport').value,list=transport==='bluetooth'?found.bluetooth:found.serial;
      const selected=$('device-select').value||state.profiles[profileKey()]?.address||'';
      $('device-select').replaceChildren(new Option(list.length?'Выберите устройство':'Устройства не найдены',''));
      for(const item of list){const address=transport==='bluetooth'?item.address:item.path;
        $('device-select').add(new Option(`${item.name||address} · ${address}`,address));}
      if(selected&&list.some(item=>(transport==='bluetooth'?item.address:item.path)===selected))$('device-select').value=selected;
      $('scan-note').textContent=found.bluetoothError?`Bluetooth: ${found.bluetoothError}`:`USB: ${found.serial.length} · Bluetooth: ${found.bluetooth.length}`;
    }catch(error){$('scan-note').textContent=errorText(error);toast(errorText(error),true);}
    finally{$('scan').disabled=false;}
  }
  async function connect() {
    if(state.busy||state.connected)return;
    const protocol=$('protocol').value, transport=$('transport').value;
    const address=(transport==='ip'?$('address').value:$('device-select').value).trim();
    if(!address){toast('Выберите устройство или введите локальный IP-адрес',true);return;}
    const payload={protocol,transport,address};
    if(transport==='ip')payload.port=protocol==='meshtastic'?4403:4000;
    if(protocol==='meshcore'&&transport==='bluetooth'&&$('pin').value)payload.pin=$('pin').value;
    setBusy(true);
    try{
      const result=await request('radio.connect',payload);
      if(!result.connected)throw new Error('Устройство не ответило');
      state.lastSeq=0;state.conversation='';state.nodes=[];
      state.profiles[profileKey()]={address};scheduleSave();
      updateConnection(true,result);renderNodes();renderMessages();await refreshNodes();
      toast('Радиоустройство подключено');
    }catch(error){updateConnection(false);toast(errorText(error),true);}
    finally{setBusy(false);}
  }
  async function disconnect() {
    try{await request('radio.disconnect');}catch(error){toast(errorText(error),true);}
    state.nodes=[];state.lastSeq=0;state.conversation='';updateConnection(false);renderNodes();renderMessages();
  }
  function renderNodes() {
    const container=$('nodes');container.replaceChildren();
    const all=document.createElement('button');all.type='button';all.className='node'+(!state.conversation?' selected':'');
    all.innerHTML='<span class="avatar">◉</span><span><strong>Все сообщения</strong><small>Каналы и контакты</small></span>';
    all.onclick=()=>{state.conversation='';renderNodes();renderMessages();};container.append(all);
    for(const node of state.nodes){const item=document.createElement('button');item.type='button';item.className='node'+(state.conversation===node.id?' selected':'');
      item.innerHTML=`<span class="avatar">${escape((node.shortName||node.name||'?').slice(0,2).toUpperCase())}</span><span><strong>${escape(node.name)}</strong><small>${escape(node.id)}</small></span>`;
      item.onclick=()=>{state.conversation=node.id;$('recipient').value=node.id;renderNodes();renderMessages();};container.append(item);
    }
    $('recipient').replaceChildren(new Option('Всем · канал',''));
    for(const node of state.nodes)$('recipient').add(new Option(node.name,node.id));
    if(state.conversation)$('recipient').value=state.conversation;
  }
  async function refreshNodes() {
    if(!state.connected)return;
    try{const value=await request('radio.nodes');state.nodes=Array.isArray(value.nodes)?value.nodes:[];renderNodes();}
    catch(error){toast('Не удалось прочитать узлы: '+errorText(error),true);}
  }
  function renderMessages() {
    const selected=state.conversation;
    const visible=state.history.filter(item=>!selected||item.sender===selected||item.sender?.startsWith(selected.slice(0,12))||selected.startsWith(String(item.sender||''))&&item.sender);
    $('chat-title').textContent=selected?(state.nodes.find(node=>node.id===selected)?.name||selected):'Сообщения';
    $('message-count').textContent=`${visible.length} сообщений`;
    const container=$('messages');container.replaceChildren();
    if(!visible.length){container.innerHTML='<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-9 9c0 1.6.42 3.12 1.15 4.43L3 21l4.57-1.15A9 9 0 1 0 12 3zm0 2a7 7 0 1 1 0 14 7 7 0 0 1-3.55-.96l-.34-.2-2.24.56.56-2.24-.2-.34A7 7 0 0 1 12 5zm-4 6h8v2H8z"/></svg><strong>Пока нет сообщений</strong><span>Сообщения останутся на этом устройстве.</span></div>';return;}
    for(const item of visible.slice(-150)){
      const bubble=document.createElement('article');bubble.className='bubble '+(item.direction==='outgoing'?'outgoing':'incoming');
      const when=new Date(Number(item.time||0)*1000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
      bubble.innerHTML=`<div class="meta"><strong>${escape(item.direction==='outgoing'?'Вы':item.sender||'Радиосеть')}</strong><span>${escape(when)} · канал ${Number(item.channel)||0}</span></div><p>${escape(item.text)}</p>`;
      container.append(bubble);
    }
    container.scrollTop=container.scrollHeight;
  }
  async function poll() {
    if(!state.connected||state.polling)return;state.polling=true;
    try{
      const value=await request('radio.messages',{after:state.lastSeq});
      if(Array.isArray(value.messages)&&value.messages.length){
        for(const item of value.messages){state.lastSeq=Math.max(state.lastSeq,Number(item.seq)||0);
          const duplicate=state.history.slice(-12).some(old=>old.time===item.time&&old.text===item.text&&old.sender===item.sender&&old.direction===item.direction);
          if(!duplicate){state.history.push(item);if(item.direction==='incoming')request('notifications.post',{title:'Новое сообщение',message:`${item.sender||'Радиосеть'}: ${item.text}`}).catch(()=>{});}
        }
        state.history=state.history.slice(-500);renderMessages();scheduleSave();
      }
    }catch(error){if(String(errorText(error)).includes('не подключено')){updateConnection(false);toast('Соединение с радиоустройством потеряно',true);}}
    finally{state.polling=false;}
  }
  async function checkStatus() {
    try{const status=await request('radio.status');
      if(status.connected&&!state.connected){updateConnection(true,status);state.lastSeq=0;await refreshNodes();}
      else if(!status.connected&&state.connected){updateConnection(false);toast('Соединение с радиоустройством потеряно',true);}
    }catch(error){console.warn('Состояние устройства:',errorText(error));}
  }
  async function send(event) {
    event.preventDefault();if(!state.connected)return;
    const text=$('message-text').value.trim(),bytes=new TextEncoder().encode(text).length;
    if(!bytes||bytes>180){toast('Введите сообщение длиной до 180 байт UTF-8',true);return;}
    $('send').disabled=true;
    try{await request('radio.send',{text,target:$('recipient').value,channel:Number($('channel').value)});
      $('message-text').value='';await poll();}
    catch(error){toast(errorText(error),true);}
    finally{$('send').disabled=false;}
  }
  async function saveSettings(event) {
    event.preventDefault();if(!state.connected)return;
    const payload={};
    if($('device-name').value.trim())payload.name=$('device-name').value.trim();
    if(state.protocol==='meshtastic'&&$('short-name').value.trim())payload.shortName=$('short-name').value.trim();
    if($('tx-power').value)payload.txPower=Number($('tx-power').value);
    if(state.protocol==='meshtastic'&&$('region').value)payload.region=$('region').value;
    if(state.protocol==='meshtastic'&&$('preset').value)payload.preset=$('preset').value;
    if(!Object.keys(payload).length){toast('Укажите хотя бы одну настройку',true);return;}
    $('save-settings').disabled=true;
    try{await request('radio.configure',payload);toast('Настройки сохранены в устройстве');}
    catch(error){toast(errorText(error),true);}
    finally{$('save-settings').disabled=false;}
  }
  async function boot() {
    if(!api){toast('Нужна SimplyOS 26.11-Dev.6 или новее',true);return;}
    const info=await request('system.api.info').catch(()=>null);
    if(!info?.methods?.includes('devices.serial.open')){toast('Обновите SimplyOS до 26.11-Dev.6 и выдайте приложению разрешения',true);return;}
    $('protocol').onchange=updateTransport;$('transport').onchange=()=>{updateTransport();if($('transport').value!=='ip')scan();};
    $('scan').onclick=scan;$('connect').onclick=connect;$('disconnect').onclick=disconnect;
    $('refresh-nodes').onclick=refreshNodes;$('send-form').onsubmit=send;$('settings-form').onsubmit=saveSettings;
    document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{
      document.querySelectorAll('[data-tab]').forEach(item=>item.classList.toggle('active',item===button));
      document.querySelectorAll('.view').forEach(item=>item.classList.toggle('active',item.id===button.dataset.tab+'-view'));
    });
    await restore();await scan();await checkStatus();
    setInterval(poll,2000);setInterval(checkStatus,10000);
  }
  boot().catch(error=>toast(errorText(error),true));
})();
