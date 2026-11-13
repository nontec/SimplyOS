// Extracted from the SimplyOS Electron host. Uses its existing clipboard, IPC and shell bindings.
let vaultClipboardTimer,vaultClipboardValue;
function clearVaultClipboard(){
 clearTimeout(vaultClipboardTimer);
 if(typeof vaultClipboardValue==='string'&&clipboard.readText()===vaultClipboardValue)clipboard.clear();
 vaultClipboardValue=undefined;
}
ipcMain.handle('simplyos:vault-clipboard',(event,value)=>{
 const owner=shellWindow;
 if(!owner||owner.webContents!==event.sender||event.senderFrame!==event.sender.mainFrame||
    new URL(event.senderFrame.url).origin!==shellOrigin||!(value===null||typeof value==='string'&&value.length<=65536))
  throw Error('Недопустимый запрос буфера обмена');
 clearVaultClipboard();
 if(value!==null){
  clipboard.writeText(value);
  vaultClipboardValue=value;
  vaultClipboardTimer=setTimeout(clearVaultClipboard,30000);
 }
});
