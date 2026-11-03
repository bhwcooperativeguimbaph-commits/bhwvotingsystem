'use strict';
/* Accessible, non-blocking alternatives to browser confirm()/alert().
   Never print secrets, tokens, passwords or code values in dialog text. */
(function(){
 const build=(title,message,choices,inputPlaceholder)=>{
  const dialog=document.createElement('dialog');dialog.className='bhw-message-dialog';
  dialog.setAttribute('aria-label',title);
  const h=document.createElement('h2');h.textContent=title;
  const p=document.createElement('p');p.textContent=String(message||'');
  const actions=document.createElement('div');actions.className='bhw-message-actions';
  let field=null;
  if(inputPlaceholder!==undefined){
   field=document.createElement('input');field.type='text';field.maxLength=100;
   field.placeholder=inputPlaceholder;field.setAttribute('aria-label',inputPlaceholder);
   field.autocomplete='off';dialog.append(h,p,field);
  }else dialog.append(h,p);
  const buttons=choices.map(({label,primary,value})=>{
   const button=document.createElement('button');button.type='button';
   button.className=primary?'bhw-message-primary':'bhw-message-secondary';
   button.textContent=label;actions.appendChild(button);
   return {button,value};
  });
  dialog.appendChild(actions);document.body.appendChild(dialog);
  return new Promise(resolve=>{
   let settled=false;
   function finish(value){
    if(settled)return;settled=true;
    dialog.close();dialog.remove();resolve(value);
   }
   for(const {button,value} of buttons)button.addEventListener('click',()=>finish(value==='input'?field.value.trim():value));
   dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null)});
   dialog.showModal();
   (field||buttons.find(x=>x.value===null)?.button||buttons[0].button).focus();
  });
 };
 window.BHWDialog={
  notice:(message,title='Notice')=>build(title,message,[{label:'OK',primary:true,value:true}]),
  confirm:(message,title='Please confirm')=>build(title,message,[
   {label:'Cancel',value:null},{label:'Confirm',primary:true,value:true}
  ]).then(Boolean),
  prompt:(message,placeholder='Enter value',title='Enter information')=>build(title,message,[
   {label:'Cancel',value:null},{label:'Save',primary:true,value:'input'}
  ],placeholder)
 };
})();
