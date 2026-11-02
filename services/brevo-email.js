'use strict';
// Brevo transactional email HTTPS transport. Secrets and message content are never logged.
async function sendBrevoEmail({to,subject,text},config=process.env){
 const apiKey=config.BREVO_API_KEY,from=config.BREVO_FROM_EMAIL;
 if(!apiKey||!from)throw Object.assign(new Error('Brevo configuration missing'),{code:'BREVO_NOT_CONFIGURED'});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to||'')||!subject||!text)
  throw new TypeError('Invalid email parameters');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch('https://api.brevo.com/v3/smtp/email',{
   method:'POST',headers:{'api-key':apiKey,'Content-Type':'application/json','accept':'application/json'},
   body:JSON.stringify({sender:{name:'BHW Guimba Voting System',email:from},
    to:[{email:to}],subject,textContent:text}),
   signal:controller.signal
  });
  if(!r.ok){const e=new Error('Brevo request rejected');e.code='BREVO_HTTP_'+r.status;throw e}
  // Provider acceptance is not inbox delivery; store only the opaque provider ID.
  const receipt=await r.json().catch(()=>({}));
  const messageId=typeof receipt?.messageId==='string'&&receipt.messageId.length<=256?
   receipt.messageId:null;
  return {messageId};
 }catch(e){
  if(e.name==='AbortError')throw Object.assign(new Error('Brevo timeout'),{code:'BREVO_TIMEOUT'});
  throw e;
 }finally{clearTimeout(timer)}
}
module.exports={sendBrevoEmail};
