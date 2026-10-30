'use strict';
// HTTPS email transport for Render Free, where outbound SMTP ports are blocked.
// Credentials and verification codes are never logged.
async function sendVerificationEmail({to,code},config=process.env){
 const apiKey=config.RESEND_API_KEY;
 const from=config.RESEND_FROM_EMAIL;
 if(!apiKey||!from)throw Object.assign(new Error('Email API not configured'),{code:'EMAIL_API_NOT_CONFIGURED'});
 if(typeof to!=='string'||!/^\S+@\S+\.\S+$/.test(to)||!/^\d{6}$/.test(code))
  throw new TypeError('Invalid email request');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch('https://api.resend.com/emails',{
   method:'POST',
   headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
   body:JSON.stringify({from,to:[to],subject:'BHW administrator verification',
    text:'Your verification code is '+code+'. It expires in five minutes.'}),
   signal:controller.signal
  });
  if(!response.ok){
   const error=new Error('Email API rejected request');
   error.code=response.status===401?'EMAIL_API_INVALID_KEY':
     response.status===403?'EMAIL_API_FORBIDDEN':
     response.status===422?'EMAIL_API_SENDER_OR_RECIPIENT':'EMAIL_API_HTTP';
   error.httpStatus=response.status;
   throw error;
  }
  return true;
 }catch(error){
  if(error.name==='AbortError')throw Object.assign(new Error('Email API timeout'),{code:'EMAIL_API_TIMEOUT'});
  throw error;
 }finally{clearTimeout(timer)}
}
module.exports={sendVerificationEmail};
