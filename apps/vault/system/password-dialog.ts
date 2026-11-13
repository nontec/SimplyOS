// SimplyOS shell dialog. Uses the shell accessibility and HTML-escaping helpers.
function systemDialog(title: string, label: string, initial = "", inputType="text") {
  return new Promise<string | null>((resolve) => {
    const modal=makeSystemModal(`<form class="system-dialog"><h3>${escapeHtml(title)}</h3><label>${escapeHtml(label)}<input value="" autocomplete="off" autofocus/></label><div><button type="button" data-cancel>Отмена</button><button type="submit">Готово</button></div></form>`,()=>finish(null));
    const input = modal.querySelector("input") as HTMLInputElement; input.value = initial; input.type=inputType;
    const finish = (value: string | null) => { if(!modal.open)return;modal.close();modal.remove();resolve(value); };
    modal.querySelector("[data-cancel]")!.addEventListener("click",()=>finish(null));
    modal.querySelector("form")!.addEventListener("submit",e=>{e.preventDefault();finish(inputType==="password"?input.value:input.value.trim())});
    document.querySelector(".scene")!.append(modal);modal.showModal();input.select();
  });
}
