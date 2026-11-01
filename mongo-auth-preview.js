'use strict';
// Isolated MongoDB authentication server. Voting and administration intentionally disabled.
// Existing browser-reported facial actions are retained; they are NOT trusted PAD.
const express=require('express');
const crypto=require('node:crypto');
const path=require('node:path');
const {connectMongo,initializeMongoIndexes}=require('./database/mongodb');
const {findFaceMatch,validDescriptor}=require('./database/face-matching');
const {issueSession,authenticateSession,revokeSession}=require('./database/sessions');
const {getPublicElectionInfo}=require('./database/election-read');
const {keyFromEnv,decryptDescriptor}=require('./database/biometrics');
const {beginAdminLogin,completeAdminLogin}=require('./database/admin-auth');
const {createElection}=require('./database/elections');
const nodemailer=require('nodemailer');
const {sendVerificationEmail}=require('./services/email-api');
const {sendBrevoEmail}=require('./services/brevo-email');
const app=express();
app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(express.json({limit:'256kb'}));
const challenges=new Map(),attempts=new Map();
const challengeTTL=120000;
function decodeStoredTemplate(value){return decryptDescriptor(value,keyFromEnv());}
function token(req){return /(?:^|; )bhw_session=([0-9a-f]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1]||null}
function cookie(res,value,maxAge){res.cookie('bhw_session',value,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge});}
function rateLimit(req,res,next){
 const key=req.ip+':'+req.path,now=Date.now(),prior=attempts.get(key)||{until:now+900000,count:0};
 if(now>prior.until){prior.until=now+900000;prior.count=0}
 if(++prior.count>8){attempts.set(key,prior);return res.status(429).json({success:false,message:'Too many attempts'})}
 attempts.set(key,prior);next();
}
function originCheck(req,res,next){
 if(req.method!=='GET'&&req.method!=='HEAD'){
  const origin=req.get('origin'),expected=req.protocol+'://'+req.get('host');
  if(origin&&origin!==expected)return res.status(403).json({success:false,message:'Cross-origin request rejected'});
 }
 next();
}
app.use(originCheck);
let connection;
app.get('/health',(req,res)=>res.json({status:'ok',database:'mongodb',mode:'auth-preview'}));
app.get('/admin-auth-preview',(req,res)=>{
 res.set('Cache-Control','no-store');
 res.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'");
 res.sendFile(path.join(__dirname,'public','admin-auth-preview.html'));
});
app.get('/api/election-info',async(req,res)=>{
 try{return res.json(await getPublicElectionInfo(connection.db))}
 catch(_){return res.status(503).json({active:false,error:'Election information unavailable'})}
});
app.post('/api/face-challenge',rateLimit,(req,res)=>{
 const now=Date.now();
 for(const [id,c]of challenges)if(c.expires<=now)challenges.delete(id);
 if(challenges.size>=1000)return res.status(503).json({success:false,message:'Challenge service busy'});
 const id=crypto.randomBytes(24).toString('hex');
 const actions=crypto.randomInt(2)===0?['turn-left','turn-right','blink']:['turn-right','turn-left','blink'];
 challenges.set(id,{actions,expires:now+challengeTTL,ip:req.ip});
 res.set('Cache-Control','no-store');
 res.json({success:true,challengeId:id,actions,expiresInSeconds:120});
});
app.post('/api/face-prescan',rateLimit,async(req,res)=>{
 if(!validDescriptor(req.body?.descriptor))return res.status(400).json({success:false,message:'Invalid face data'});
 try{
  const result=await findFaceMatch(connection.db,req.body.descriptor,decodeStoredTemplate);
  res.set('Cache-Control','no-store');
  return res.json({success:true,recognized:!!result.match&&!result.ambiguous,
    message:result.ambiguous?'Face match is ambiguous':result.match?'Face recognized. Continue with the facial challenge.':'Face not recognized'});
 }catch(_){return res.status(503).json({success:false,message:'Face verification unavailable'})}
});
app.post('/api/login-face',rateLimit,async(req,res)=>{
 if(!validDescriptor(req.body?.descriptor))return res.status(400).json({success:false,message:'Invalid face data'});
 const id=req.body?.challengeId,c=typeof id==='string'?challenges.get(id):null;
 if(c)challenges.delete(id);
 if(!c||c.expires<=Date.now()||c.ip!==req.ip||!Array.isArray(req.body?.completedActions)||
  JSON.stringify(req.body.completedActions)!==JSON.stringify(c.actions))
  return res.status(401).json({success:false,message:'Facial challenge expired or incomplete'});
 try{
  const found=await findFaceMatch(connection.db,req.body.descriptor,decodeStoredTemplate);
  if(found.ambiguous)return res.status(409).json({success:false,message:'Ambiguous face match'});
  if(!found.match)return res.status(401).json({success:false,message:'Face not recognized'});
  if(found.match.role!=='member')return res.status(403).json({success:false,message:'Admin facial login not enabled in preview'});
  const session=await issueSession(connection.db,{accountId:found.match.accountId,role:'member'});
  cookie(res,session.token,8*3600000);
  const parts=found.match.fullName.split(' ');
  res.set('Cache-Control','no-store');
  res.json({success:true,role:'member',memberId:found.match.accountId,firstName:parts[0],lastName:parts.slice(1).join(' ')});
 }catch(_){return res.status(503).json({success:false,message:'Login temporarily unavailable'})}
});
app.post('/api/admin/login-password',rateLimit,async(req,res)=>{
  const {password,username}=req.body||{};
  if(typeof password!=='string'||password.length>256)return res.status(400).json({success:false,message:'Invalid credentials'});
  const smtpUser=process.env.SMTP_USER,smtpPassword=process.env.SMTP_APP_PASSWORD;
  const useBrevo=Boolean(process.env.BREVO_API_KEY&&process.env.BREVO_FROM_EMAIL);
  const useEmailApi=Boolean(process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL);
  console.log('Admin MFA email provider selected:',useBrevo?'brevo':useEmailApi?'resend':'smtp');
  if(!useBrevo&&!useEmailApi&&(!smtpUser||!smtpPassword))return res.status(503).json({success:false,message:'Administrator MFA email is unavailable'});
  const transport=(useBrevo||useEmailApi)?null:nodemailer.createTransport({service:'gmail',auth:{user:smtpUser,pass:smtpPassword},connectionTimeout:12000,greetingTimeout:12000,socketTimeout:15000});
  try{
    const result=await beginAdminLogin(connection.db,{
      username:typeof username==='string'?username:(process.env.INITIAL_SUPERADMIN_USERNAME||'superadmin'),
      password,
      deliverOtp:async(email,code)=>{
        try {
          if(useBrevo){
            await sendBrevoEmail({to:email,subject:'BHW administrator verification',text:'Your verification code is '+code+'. It expires in five minutes.'});
          }else if(useEmailApi){
            await sendVerificationEmail({to:email,code});
          }else{
            const info=await transport.sendMail({from:smtpUser,to:email,subject:'BHW administrator verification',text:'Your verification code is '+code+'. It expires in five minutes.'});
            if(!Array.isArray(info.accepted)||info.accepted.length===0)throw Object.assign(new Error('Not accepted'),{code:'NOT_ACCEPTED'});
          }
        } catch(e) {
          const allowed=new Set(['EAUTH','ECONNECTION','ETIMEDOUT','ESOCKET','EDNS','EENVELOPE','EMESSAGE','NOT_ACCEPTED']);
          const category=allowed.has(e?.code)?e.code:'OTHER_SMTP_ERROR';
          const responseCode=Number.isInteger(e?.responseCode)&&e.responseCode>=400&&e.responseCode<=599?e.responseCode:'none';
          console.error('Admin MFA email transport failure:',useBrevo?String(e?.code||'BREVO_ERROR').replace(/[^A-Z0-9_]/g,'').slice(0,40):useEmailApi?String(e?.code||'EMAIL_API_ERROR').replace(/[^A-Z_]/g,'').slice(0,40):category, (useBrevo||useEmailApi)?'HTTP status:':'SMTP status:',useBrevo?'see code':useEmailApi?(Number.isInteger(e?.httpStatus)?e.httpStatus:'none'):responseCode);
          throw new Error('SMTP_DELIVERY_FAILED');
        }
      }
    });
    if(result.code==='INVALID_CREDENTIALS')return res.status(401).json({success:false,message:'Invalid credentials'});
    if(!result.ok){
      console.error('Admin MFA failure category:',result.code);
      if(result.code==='MFA_COOLDOWN'){
        res.set('Retry-After','300');
        return res.status(429).json({success:false,code:'MFA_COOLDOWN',message:'Verification code recently requested. Check your email or retry after five minutes.'});
      }
      return res.status(503).json({success:false,message:'Admin verification temporarily unavailable',code:result.code});
    }
    res.set('Cache-Control','no-store');
    return res.json({success:false,mfaRequired:true,challenge:result.challenge,message:'Enter the verification code emailed to you.'});
  }catch(e){
    const category=e?.code===11000?'duplicate-key':e?.name==='MongoServerSelectionError'?'database-network':
      e?.name==='MongoServerError'?'database-server':e?.code==='ETIMEDOUT'?'timeout':'other';
    console.error('Admin login failure stage: MFA initialization; category:',category);
    return res.status(503).json({success:false,message:'Admin verification temporarily unavailable',code:'MFA_INITIALIZATION_FAILED'});
  }
});
app.post('/api/admin/login-otp',rateLimit,async(req,res)=>{
  try{
    const result=await completeAdminLogin(connection.db,req.body||{});
    if(!result.ok)return res.status(401).json({success:false,message:'Invalid or expired verification code'});
    cookie(res,result.token,8*3600000);
    res.set('Cache-Control','no-store');
    return res.json({success:true,role:'superadmin'});
  }catch(_){return res.status(503).json({success:false,message:'Admin verification temporarily unavailable'})}
});
async function superadminOnly(req,res,next){
 try{
  const auth=await authenticateSession(connection.db,token(req));
  if(!auth||auth.role!=='superadmin')return res.status(403).json({success:false,message:'Superadmin session required'});
  next();
 }catch(_){res.status(503).json({success:false,message:'Authorization unavailable'})}
}
app.post('/api/admin/register-member',superadminOnly,async(req,res)=>{
  const challengeId=req.body?.challengeId;
  const ch=typeof challengeId==='string'?challenges.get(challengeId):null;
  if(ch)challenges.delete(challengeId);
  if(!ch||ch.expires<=Date.now()||ch.ip!==req.ip||
     !Array.isArray(req.body?.completedActions)||
     JSON.stringify(req.body.completedActions)!==JSON.stringify(ch.actions))
    return res.status(401).json({success:false,message:'Enrollment facial challenge expired or incomplete'});
  const {registerMemberWithFace}=require('./database/member-enrollment');
  const {verifyGuimbaLocation}=require('./database/guimba-location');
  try{
    const clean=v=>typeof v==='string'?v.trim().replace(/\\s+/g,' '):'';
    const input={fullName:clean(req.body?.fullName)||[req.body?.firstName,req.body?.middleName,req.body?.lastName].map(clean).filter(Boolean).join(' '),
      area:req.body?.area,location:req.body?.location,descriptor:req.body?.descriptor};
    if(req.body?.consent!==true)return res.status(400).json({success:false,message:'Member biometric consent required'});
    const {memberId}=await registerMemberWithFace(connection,input,{key:keyFromEnv(),validateLocation:verifyGuimbaLocation});
    res.set('Cache-Control','no-store');
    return res.status(201).json({success:true,memberId});
  }catch(e){
    if(e instanceof TypeError)return res.status(400).json({success:false,message:'Invalid enrollment data or unverified Guimba address'});
    return res.status(503).json({success:false,message:'Enrollment unavailable'});
  }
});
app.get('/api/admin/members',superadminOnly,async(req,res)=>{
 try {
  const members=await connection.db.collection('members').find({},{
    projection:{_id:0,memberId:1,fullName:1,area:1,status:1,createdAt:1},
    sort:{createdAt:-1},limit:100
  }).toArray();
  res.set('Cache-Control','no-store');
  return res.json({success:true,members});
 }catch(_){return res.status(503).json({success:false,message:'Member directory unavailable'})}
});
app.patch('/api/admin/members/:memberId/status',superadminOnly,async(req,res)=>{
 const memberId=req.params.memberId,status=req.body?.status;
 if(!/^MEM-[0-9a-f-]{36}$/i.test(memberId)||!['Active','Inactive'].includes(status))
  return res.status(400).json({success:false,message:'Invalid member or status'});
 try {
  const {setMemberStatus}=require('./database/members');
  const updated=await setMemberStatus(connection.db,memberId,status);
  if(!updated)return res.status(404).json({success:false,message:'Member not found'});
  res.set('Cache-Control','no-store');
  return res.json({success:true});
 }catch(_){return res.status(503).json({success:false,message:'Member update unavailable'})}
});
app.post('/api/admin/initialize-election',superadminOnly,async(req,res)=>{
 // Administrative preview only; no voting route is enabled.
 try{
  const {electionId}=await createElection(connection,req.body||{});
  res.set('Cache-Control','no-store');
  res.status(201).json({success:true,electionId,message:'Election created'});
 }catch(e){
  if(e.code==='ACTIVE_ELECTION')return res.status(409).json({success:false,message:'An election is already active'});
  if(e instanceof TypeError)return res.status(400).json({success:false,message:e.message});
  return res.status(503).json({success:false,message:'Election creation unavailable'});
 }
});
app.get('/api/session',async(req,res)=>{
 try{
  const auth=await authenticateSession(connection.db,token(req));
  if(!auth)return res.status(401).json({success:false,message:'Session expired'});
  if(auth.role==='superadmin'){
    const admin=await connection.db.collection('admins').findOne({adminId:auth.accountId,status:'Active'});
    if(!admin)return res.status(401).json({success:false,message:'Session expired'});
    res.set('Cache-Control','no-store');
    return res.json({success:true,role:'superadmin',memberId:auth.accountId,fullName:admin.fullName});
  }
  const member=await connection.db.collection('members').findOne({memberId:auth.accountId,status:'Active'});
  if(!member)return res.status(401).json({success:false,message:'Session expired'});
  const election=await connection.db.collection('elections').findOne({status:'Active',endTime:{$gt:new Date()}},{sort:{createdAt:-1}});
  const hasVoted=!!(election&&await connection.db.collection('ballots').findOne({electionId:election.electionId,memberId:auth.accountId}));
  res.set('Cache-Control','no-store');
  res.json({success:true,role:'member',memberId:auth.accountId,fullName:member.fullName,hasVoted});
 }catch(_){res.status(503).json({success:false,message:'Session temporarily unavailable'})}
});
app.post('/api/logout',async(req,res)=>{
 try{await revokeSession(connection.db,token(req));res.clearCookie('bhw_session',{path:'/',secure:true,sameSite:'strict'});
  res.set('Cache-Control','no-store');res.json({success:true});}
 catch(_){res.status(503).json({success:false,message:'Logout unavailable'})}
});
app.use('/api',(req,res)=>res.status(403).json({success:false,message:'This API is not available in authentication preview'}));
app.use((req,res)=>res.status(404).json({error:'Not found'}));
async function main(){
 if(process.env.ENABLE_MONGODB_AUTH_PREVIEW!=='true')throw new Error('Explicit ENABLE_MONGODB_AUTH_PREVIEW=true required');
 keyFromEnv();
 connection=await connectMongo();
 await initializeMongoIndexes(connection.db);
 app.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('MongoDB authentication preview listening; voting disabled'));
}
main().catch(()=>{console.error('MongoDB authentication preview failed to start; check configuration');process.exitCode=1});
