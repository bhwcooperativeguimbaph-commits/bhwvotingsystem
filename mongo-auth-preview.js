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
const {sendBrevoEmail}=require('./services/brevo-email');
const {createFaceBinding,issueFaceChallenge,consumeFaceChallenge}=require('./database/face-challenges');
const app=express();
app.disable('x-powered-by');
app.set('trust proxy',1);
// Allow one resized 500 KB JPG/PNG candidate image as base64 while rejecting oversized payloads.
app.use(express.json({limit:'850kb'}));
const attempts=new Map();
function decodeStoredTemplate(value){return decryptDescriptor(value,keyFromEnv());}
function token(req){return /(?:^|; )bhw_session=([0-9a-f]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1]||null}
function cookie(res,value,maxAge){res.cookie('bhw_session',value,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge});}
const faceBindingCookie='bhw_face_bind';
function faceBinding(req){
 const match=/(?:^|;\s*)bhw_face_bind=([0-9a-f]{64})(?:;|$)/.exec(req.headers.cookie||'');
 return match?.[1]||null;
}
function setFaceBinding(res,binding){
 res.cookie(faceBindingCookie,binding,{
  httpOnly:true,secure:true,sameSite:'strict',path:'/api',maxAge:120000
 });
}
function clearFaceBinding(res){
 res.clearCookie(faceBindingCookie,{httpOnly:true,secure:true,sameSite:'strict',path:'/api'});
}

function rateLimit(req,res,next){
 const key=req.ip+':'+req.path,now=Date.now(),prior=attempts.get(key)||{until:now+900000,count:0};
 if(now>prior.until){prior.until=now+900000;prior.count=0}
 if(++prior.count>8){attempts.set(key,prior);return res.status(429).json({success:false,message:'Too many attempts'})}
 attempts.set(key,prior);next();
}
const {originCheck}=require('./database/request-origin');
app.use(originCheck);
let connection;
app.get('/health',(req,res)=>res.json({status:'ok',database:'mongodb',mode:'auth-preview'}));
app.get('/',(req,res)=>{
 res.set('Cache-Control','no-store');
 res.set('Content-Security-Policy',"default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'");
 return res.sendFile(path.join(__dirname,'public','mongo-portal.html'));
});
app.get('/assets/logo.svg',(req,res)=>{
 res.set('Cache-Control','public,max-age=1d');
 return res.type('image/svg+xml').sendFile(path.join(__dirname,'public','assets','logo.svg'));
});
app.get('/css/mongo-portal.css',(req,res)=>{
 res.set('Cache-Control','public,max-age=3600');
 return res.type('text/css').sendFile(path.join(__dirname,'public','css','mongo-portal.css'));
});
app.get('/admin-password-recovery',(req,res)=>{
 res.set('Cache-Control','no-store');
 res.set('Content-Security-Policy',"default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'");
 return res.sendFile(path.join(__dirname,'public','mongo-password-recovery.html'));
});
app.get('/admin-auth-preview',(req,res)=>{
 res.set('Cache-Control','no-store');
 res.set('Content-Security-Policy',"default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'");
 res.sendFile(path.join(__dirname,'public','admin-auth-preview.html'));
});
app.get(['/api/geo/:level','/api/geo/:level/:code'],(req,res)=>{
 try{
  const {getGuimbaGeography}=require('./database/guimba-geo-api');
  res.set('Cache-Control','public, max-age=3600');
  res.json(getGuimbaGeography(req.params.level,req.params.code));
 }catch(e){
  const status=e.status===400?400:503;
  res.status(status).json({success:false,message:status===400?'Invalid Guimba location selection':'Geographic reference data unavailable'});
 }
});
app.use('/models',express.static(path.join(__dirname,'public','models'),{
 index:false,etag:true,maxAge:'1d'
}));
app.get('/js/report-integrity.js',(req,res)=>{
 res.set('Cache-Control','public,max-age=3600');
 return res.type('application/javascript').sendFile(
  path.join(__dirname,'public','js','report-integrity.js'));
});
app.get('/js/receipt-pdf.js',(req,res)=>{
 res.set('Cache-Control','public,max-age=3600');
 res.type('application/javascript');
 return res.sendFile(path.join(__dirname,'public','js','receipt-pdf.js'));
});
app.get('/js/admin-workspace.js',staffOnly,(req,res)=>{res.set('Cache-Control','no-store');return res.type('application/javascript').sendFile(path.join(__dirname,'public','js','admin-workspace.js'))});
app.get('/js/mongo-face-challenge.js',(req,res)=>{
 res.set('Cache-Control','no-store');
 res.type('application/javascript');
 return res.sendFile(path.join(__dirname,'public','js','mongo-face-challenge.js'));
});
app.get('/member-preview',(req,res)=>{
 res.set('Cache-Control','no-store');
 res.set('Content-Security-Policy',"default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; form-action 'self'; base-uri 'none'");
 return res.sendFile(path.join(__dirname,'public','mongo-member-preview.html'));
});
app.get('/member-enrollment-preview',staffOnly,(req,res)=>{
 res.set('Cache-Control','no-store');
 res.set('Content-Security-Policy',"default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; form-action 'self'; base-uri 'none'");
 return res.sendFile(path.join(__dirname,'public','mongo-enrollment-preview.html'));
});
app.get('/admin-console',staffOnly,(req,res)=>{
 res.set('Cache-Control','no-store');
 res.set('Content-Security-Policy',"default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'");
 return res.sendFile(path.join(__dirname,'public','mongo-admin-console.html'));
});
app.get('/results',(req,res)=>{
 res.set('Cache-Control','no-store');
 res.set('Content-Security-Policy',"default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'");
 return res.sendFile(path.join(__dirname,'public','mongo-results.html'));
});
app.get('/custodian-confirm',(req,res)=>{
 res.set('Cache-Control','no-store');
 res.set('Content-Security-Policy',"default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'");
 return res.sendFile(path.join(__dirname,'public','custodian-confirm.html'));
});
app.get('/api/election-info',async(req,res)=>{
 try{const data=await getPublicElectionInfo(connection.db);return res.json({...data,voteSubmissionEnabled:process.env.ENABLE_MONGODB_VOTE_TEST==='true'})}
 catch(_){return res.status(503).json({active:false,error:'Election information unavailable'})}
});
app.post('/api/face-challenge',rateLimit,async(req,res)=>{
 try{
  const binding=createFaceBinding();
  const challenge=await issueFaceChallenge(connection.db,binding);
  setFaceBinding(res,binding);
  res.set('Cache-Control','no-store');
  return res.json({success:true,...challenge});
 }catch(_){return res.status(503).json({success:false,message:'Facial challenge temporarily unavailable'})}
});
app.post('/api/login-face',rateLimit,async(req,res)=>{
 if(!validDescriptor(req.body?.descriptor))return res.status(400).json({success:false,message:'Invalid face data'});
 let verified=false;
 try{verified=await consumeFaceChallenge(connection.db,{challengeId:req.body?.challengeId,
  completedActions:req.body?.completedActions,binding:faceBinding(req)})}
 catch(_){return res.status(503).json({success:false,message:'Facial challenge verification unavailable'})}
 clearFaceBinding(res);
 if(!verified)return res.status(401).json({success:false,message:'Facial challenge expired, incomplete, or from another browser'});
 try{
  const found=await findFaceMatch(connection.db,req.body.descriptor,decodeStoredTemplate);
  if(found.ambiguous)return res.status(409).json({success:false,message:'Ambiguous face match'});
  if(!found.match)return res.status(401).json({success:false,message:'Face not recognized'});
  if(found.match.role!=='member')return res.status(403).json({success:false,message:'Admin facial login not enabled in preview'});
  const session=await issueSession(connection.db,{accountId:found.match.accountId,role:'member'});
  cookie(res,session.token,8*3600000);
  res.set('Cache-Control','no-store');
  res.json({success:true,role:'member',memberId:found.match.accountId,
   fullName:found.match.fullName});
 }catch(_){return res.status(503).json({success:false,message:'Login temporarily unavailable'})}
});
app.post('/api/admin/reset/request',rateLimit,async(req,res)=>{
 try{
  if(!process.env.BREVO_API_KEY||!process.env.BREVO_FROM_EMAIL)
   return res.status(503).json({success:false,message:'Email recovery unavailable'});
  const {requestPasswordReset}=require('./database/password-recovery');
  const result=await requestPasswordReset(connection.db,{username:req.body?.username});
  res.set('Cache-Control','no-store');
  return res.json(result);
 }catch(_){return res.status(503).json({success:false,message:'Password recovery temporarily unavailable'})}
});
app.post('/api/admin/reset/verify',rateLimit,async(req,res)=>{
 try{
  const {verifyPasswordReset}=require('./database/password-recovery');
  await verifyPasswordReset(connection,{challenge:req.body?.challenge,code:req.body?.code,
   newPassword:req.body?.newPassword});
  res.set('Cache-Control','no-store');
  return res.json({success:true,message:'Password updated. Please sign in again.'});
 }catch(e){
  if(e?.code==='INVALID_RESET')return res.status(400).json({success:false,message:'Invalid or expired recovery code or password'});
  return res.status(503).json({success:false,message:'Password recovery temporarily unavailable'});
 }
});
app.post('/api/admin/login-password',rateLimit,async(req,res)=>{
  const {password,username}=req.body||{};
  if(typeof password!=='string'||password.length>256)return res.status(400).json({success:false,message:'Invalid credentials'});
  if(!process.env.BREVO_API_KEY||!process.env.BREVO_FROM_EMAIL)
   return res.status(503).json({success:false,message:'Brevo administrator MFA is not configured'});
  try{
    const result=await beginAdminLogin(connection.db,{
      username:typeof username==='string'?username:(process.env.INITIAL_SUPERADMIN_USERNAME||'superadmin'),
      password,
      deliverOtp:async(email,code)=>{
        try{
          await sendBrevoEmail({to:email,subject:'BHW administrator verification',
           text:'Your verification code is '+code+'. It expires in five minutes.'});
        }catch(e){
          const category=String(e?.code||'BREVO_ERROR').replace(/[^A-Z0-9_]/g,'').slice(0,40);
          console.error('Admin MFA email transport failure:',category);
          throw new Error('BREVO_DELIVERY_FAILED');
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
    return res.json({success:true,role:result.role});
  }catch(_){return res.status(503).json({success:false,message:'Admin verification temporarily unavailable'})}
});
async function staffOnly(req,res,next){
 try{
  const auth=await authenticateSession(connection.db,token(req));
  if(!auth||!['admin','superadmin'].includes(auth.role))
   return res.status(403).json({success:false,message:'Administrator session required'});
  req.staff=auth;next();
 }catch(_){res.status(503).json({success:false,message:'Authorization unavailable'})}
}
async function superadminOnly(req,res,next){
 try{
  const auth=await authenticateSession(connection.db,token(req));
  if(!auth||auth.role!=='superadmin')return res.status(403).json({success:false,message:'Superadmin session required'});
  req.staff=auth;next();
 }catch(_){res.status(503).json({success:false,message:'Authorization unavailable'})}
}
app.get('/api/admin/areas',staffOnly,async(req,res)=>{
 try{
  const {listAreas}=require('./database/member-areas');
  const areas=await listAreas(connection.db);res.set('Cache-Control','no-store');
  return res.json({success:true,areas});
 }catch(_){return res.status(503).json({success:false,message:'Areas unavailable'})}
});
app.post('/api/admin/areas',staffOnly,async(req,res)=>{
 try{
  const {createArea}=require('./database/member-areas');
  const area=await createArea(connection.db,req.body?.name,
   {operatorId:req.staff.accountId,actorRole:req.staff.role});
  res.set('Cache-Control','no-store');return res.status(201).json({success:true,area});
 }catch(e){
  if(e?.code==='AREA_EXISTS')return res.status(409).json({success:false,message:'Area already exists'});
  if(e instanceof TypeError)return res.status(400).json({success:false,message:e.message});
  return res.status(503).json({success:false,message:'Could not save area'});
 }
});
app.post('/api/admin/register-member',staffOnly,async(req,res)=>{
 const {registerMemberWithFace}=require('./database/member-enrollment');
 const {validateMember}=require('./database/members');
 const {verifyGuimbaLocation}=require('./database/guimba-location');
 const clean=v=>typeof v==='string'?v.trim().replace(/\s+/g,' '):'';
 const input={
  firstName:clean(req.body?.firstName),middleName:clean(req.body?.middleName),
  lastName:clean(req.body?.lastName),area:clean(req.body?.area),
  address:clean(req.body?.address),birthdate:req.body?.birthdate,
  gender:req.body?.gender,location:req.body?.location,
  descriptor:req.body?.descriptor,biometricConsent:req.body?.consent===true
 };
 // Validate everything possible before consuming a single-use challenge,
 // so a form error never forces the user to repeat the camera gestures.
 if(!input.biometricConsent)
  return res.status(400).json({success:false,message:'Member biometric consent is required'});
 try{
  const checked=validateMember(input);
  if(!checked.firstName||!checked.lastName||!checked.address||!checked.birthdate||!checked.gender)
   throw new TypeError('First name, last name, address, adult birthdate and gender are required');
  if(!verifyGuimbaLocation(checked.location))
   throw new TypeError('Select a valid barangay in Guimba, Nueva Ecija');
  if(!validDescriptor(input.descriptor))
   throw new TypeError('A valid facial descriptor is required');
 }catch(e){
  return res.status(400).json({success:false,message:e instanceof TypeError?
   e.message:'Invalid member registration form'});
 }
 let verified=false;
 try{
  verified=await consumeFaceChallenge(connection.db,{
   challengeId:req.body?.challengeId,completedActions:req.body?.completedActions,
   binding:faceBinding(req)
  });
 }catch(_){return res.status(503).json({success:false,message:'Enrollment facial challenge unavailable'})}
 clearFaceBinding(res);
 if(!verified)return res.status(401).json({
  success:false,message:'Enrollment facial challenge expired, incomplete, or from another browser'
 });
 try{
  const {memberId}=await registerMemberWithFace(connection,input,{
   key:keyFromEnv(),validateLocation:verifyGuimbaLocation,operatorId:req.staff?.accountId
  });
  res.set('Cache-Control','no-store');
  return res.status(201).json({success:true,memberId});
 }catch(e){
  if(e.code==='DUPLICATE_BIOMETRIC')
   return res.status(409).json({success:false,message:'This face is already enrolled'});
  if(e.code==='ENROLLMENT_BUSY')
   return res.status(423).json({success:false,message:'Biometric registration is busy; retry later'});
  if(e instanceof TypeError)return res.status(400).json({success:false,message:e.message});
  return res.status(503).json({success:false,message:'Enrollment unavailable'});
 }
});
app.get('/api/superadmin/admins',superadminOnly,async(req,res)=>{
 try{
  const admins=await connection.db.collection('admins').find(
   {role:'admin'},
   {projection:{_id:0,adminId:1,username:1,fullName:1,email:1,status:1,createdAt:1},
    sort:{createdAt:-1},limit:100}).toArray();
  res.set('Cache-Control','no-store');
  return res.json({success:true,admins});
 }catch(_){return res.status(503).json({success:false,message:'Administrator directory unavailable'})}
});
app.post('/api/superadmin/admins',superadminOnly,async(req,res)=>{
 try{
  const {createAdmin}=require('./database/admin-users');
  const admin=await createAdmin(connection,req.body||{},{operatorId:req.staff.accountId});
  res.set('Cache-Control','no-store');
  return res.status(201).json({success:true,admin});
 }catch(e){
  if(e?.code==='INVALID_ADMIN')return res.status(400).json({success:false,message:'Valid username, full name, email, and 16+ character password are required'});
  if(e?.code==='ADMIN_EXISTS')return res.status(409).json({success:false,message:'Administrator username already exists'});
  return res.status(503).json({success:false,message:'Unable to register administrator'});
 }
});
app.patch('/api/superadmin/admins/:adminId/status',superadminOnly,async(req,res)=>{
 try{
  const {updateAdminStatus}=require('./database/admin-users');
  await updateAdminStatus(connection,req.params.adminId,req.body?.status);
  res.set('Cache-Control','no-store');
  return res.json({success:true});
 }catch(e){
  if(e?.code==='INVALID_ADMIN')return res.status(400).json({success:false,message:'Invalid administrator'});
  if(e?.code==='ADMIN_NOT_FOUND')return res.status(404).json({success:false,message:'Administrator not found'});
  return res.status(503).json({success:false,message:'Administrator status change unavailable'});
 }
});
app.post('/api/superadmin/email-change/request',superadminOnly,rateLimit,async(req,res)=>{
 try{
  if(!process.env.BREVO_API_KEY||!process.env.BREVO_FROM_EMAIL)
   return res.status(503).json({success:false,message:'Email verification temporarily unavailable'});
  const {requestSuperadminEmailChange}=require('./database/superadmin-email-change');
  const data=await requestSuperadminEmailChange(connection.db,{
   adminId:req.staff.accountId,newEmail:req.body?.newEmail
  });
  res.set('Cache-Control','no-store');
  return res.json({success:true,...data,message:'Separate confirmation codes sent to your current and proposed email addresses'});
 }catch(e){
  if(e?.code==='INVALID_EMAIL_CHANGE')
   return res.status(400).json({success:false,message:'Invalid or already registered email address'});
  if(e?.code==='EMAIL_CHANGE_COOLDOWN'){
   res.set('Retry-After','300');
   return res.status(429).json({success:false,message:'Email verification recently requested. Retry after five minutes.'});
  }
  return res.status(503).json({success:false,message:'Cannot deliver both email confirmations'});
 }
});
app.post('/api/superadmin/email-change/confirm',superadminOnly,rateLimit,async(req,res)=>{
 try{
  const {completeSuperadminEmailChange}=require('./database/superadmin-email-change');
  await completeSuperadminEmailChange(connection,{
   adminId:req.staff.accountId,challenge:req.body?.challenge,
   oldCode:req.body?.oldCode,newCode:req.body?.newCode
  });
  res.clearCookie('bhw_session',{httpOnly:true,secure:true,sameSite:'strict',path:'/'});
  res.set('Cache-Control','no-store');
  return res.json({success:true,message:'Email updated and existing sessions revoked. Sign in using a new OTP.'});
 }catch(e){
  if(e?.code==='INVALID_EMAIL_CHANGE')
   return res.status(400).json({success:false,message:'Invalid or expired confirmation codes. Request a new change if needed.'});
  return res.status(503).json({success:false,message:'Email change unavailable'});
 }
});
app.get('/api/admin/overview',staffOnly,async(req,res)=>{
 try{
  const db=connection.db;
  const [members,activeMembers,staff,elections,ballots]=await Promise.all([
   db.collection('members').countDocuments({}),
   db.collection('members').countDocuments({status:'Active'}),
   db.collection('admins').countDocuments({role:'admin',status:'Active'}),
   db.collection('elections').countDocuments({}),
   db.collection('ballots').countDocuments({status:'Valid'})
  ]);
  res.set('Cache-Control','no-store');
  return res.json({success:true,summary:{members,activeMembers,staff,elections,ballots}});
 }catch(_){return res.status(503).json({success:false,message:'Dashboard temporarily unavailable'})}
});
app.get('/api/admin/announcements',staffOnly,async(req,res)=>{
 try{
  const announcements=await connection.db.collection('resultAnnouncements').find({},{
   projection:{_id:0,notificationId:1,electionId:1,message:1,createdAt:1},
   sort:{createdAt:-1},limit:5}).toArray();
  res.set('Cache-Control','no-store');
  return res.json({success:true,announcements});
 }catch(_){return res.status(503).json({success:false,message:'Announcements unavailable'})}
});
app.get('/api/admin/analytics',staffOnly,async(req,res)=>{
 try{
  const {getAdminAnalytics}=require('./database/admin-analytics');
  const data=await getAdminAnalytics(connection.db);
  res.set('Cache-Control','no-store');
  return res.json({success:true,...data});
 }catch(_){return res.status(503).json({success:false,message:'Election analytics unavailable'})}
});
app.get('/api/admin/elections/:electionId/lifecycle',staffOnly,async(req,res)=>{
 try{
  const {getElectionLifecycle}=require('./database/election-lifecycle');
  const state=await getElectionLifecycle(connection.db,req.params.electionId);
  if(!state)return res.status(404).json({success:false,message:'Election not found'});
  res.set('Cache-Control','no-store');
  return res.json({success:true,election:state});
 }catch(e){
  if(e instanceof TypeError)return res.status(400).json({success:false,message:'Invalid election ID'});
  return res.status(503).json({success:false,message:'Election status temporarily unavailable'});
 }
});
app.get('/api/admin/history',staffOnly,async(req,res)=>{
 try{
  const {listElectionHistory}=require('./database/election-history');
  const elections=await listElectionHistory(connection.db);
  res.set('Cache-Control','no-store');
  return res.json({success:true,elections});
 }catch(_){return res.status(503).json({success:false,message:'Election history unavailable'})}
});
app.get('/api/admin/logs',staffOnly,async(req,res)=>{
 try{
  const actor=String(req.query.actor||'all').toLowerCase();
  const action=String(req.query.action||'').trim().toUpperCase();
  const page=Number.parseInt(String(req.query.page||'1'),10);
  if(!['all','member','admin','superadmin'].includes(actor)||
    !/^[A-Z0-9_]{0,60}$/.test(action)||
    !Number.isInteger(page)||page<1||page>1000)
   return res.status(400).json({success:false,message:'Invalid audit filters'});
  const filter={};
  if(actor==='member')filter.actorRole='member';
  if(actor==='admin')filter.actorRole={$in:['admin','staff']};
  if(actor==='superadmin')filter.actorRole='superadmin';
  if(action)filter.action=action;
  const rawFrom=req.query.from,rawTo=req.query.to;
  if(rawFrom||rawTo){
   const datePattern=/^\d{4}-\d{2}-\d{2}$/;
   if((rawFrom&&!datePattern.test(String(rawFrom)))||(rawTo&&!datePattern.test(String(rawTo))))
    return res.status(400).json({success:false,message:'Invalid audit date range'});
   filter.createdAt={};
   if(rawFrom)filter.createdAt.$gte=new Date(String(rawFrom)+'T00:00:00+08:00');
   if(rawTo)filter.createdAt.$lt=new Date(new Date(String(rawTo)+'T00:00:00+08:00').getTime()+86400000);
   if(Object.values(filter.createdAt).some(v=>!Number.isFinite(v.getTime())))
    return res.status(400).json({success:false,message:'Invalid audit dates'});
  }
  const perPage=40,db=connection.db;
  const [logs,total]=await Promise.all([
   db.collection('auditLogs').find(filter,{projection:{
    _id:0,eventId:1,actorRole:1,action:1,electionId:1,memberId:1,
    candidateId:1,targetAdminId:1,outcome:1,
    operatorId:1,actorId:1,reason:1,createdAt:1},
    sort:{createdAt:-1},skip:(page-1)*perPage,limit:perPage}).toArray(),
   db.collection('auditLogs').countDocuments(filter)
  ]);
  res.set('Cache-Control','no-store');
  return res.json({success:true,logs,page,perPage,total,pages:Math.ceil(total/perPage)});
 }catch(_){return res.status(503).json({success:false,message:'Audit logs unavailable'})}
});
app.get('/api/admin/turnout/:electionId',staffOnly,async(req,res)=>{
 const electionId=req.params.electionId;
 if(!/^ELEC-[a-f0-9-]{36}$/i.test(electionId))
  return res.status(400).json({success:false,message:'Invalid election ID'});
 try{
  const {getElectionTurnout}=require('./database/turnout');
  const stats=await getElectionTurnout(connection.db,electionId);
  if(!stats)return res.status(404).json({success:false,message:'Election not found'});
  res.set('Cache-Control','no-store');
  return res.json({success:true,...stats});
 }catch(_){return res.status(503).json({success:false,message:'Turnout report unavailable'})}
});
app.get('/api/admin/members',staffOnly,async(req,res)=>{
 try {
  const page=Math.min(1000,Math.max(1,Number.parseInt(String(req.query.page||'1'),10)||1));
  const {directoryFilter}=require('./database/member-directory');
  let filter;
  try{filter=directoryFilter(req.query.q||'')}
  catch(_){return res.status(400).json({success:false,message:'Search must contain at most 80 printable characters'})}
  const perPage=25;
  const [members,total]=await Promise.all([
    connection.db.collection('members').find(filter,{
      projection:{_id:0,memberId:1,fullName:1,firstName:1,middleName:1,lastName:1,area:1,address:1,birthdate:1,gender:1,location:1,status:1,createdAt:1},
      sort:{createdAt:-1,memberId:1},skip:(page-1)*perPage,limit:perPage
    }).toArray(),
    connection.db.collection('members').countDocuments(filter)
  ]);
  res.set('Cache-Control','no-store');
  return res.json({success:true,members,page,perPage,total,pages:Math.ceil(total/perPage)});
 }catch(_){return res.status(503).json({success:false,message:'Member directory unavailable'})}
});
app.delete('/api/superadmin/staging-members/:memberId',superadminOnly,async(req,res)=>{
 try{
  const {deleteUnusedStagingMember}=require('./database/staging-member-cleanup');
  const result=await deleteUnusedStagingMember(connection,req.params.memberId);
  res.set('Cache-Control','no-store');
  return res.json({success:true,...result});
 }catch(e){
  const known={STAGING_ONLY:[403,'Available only in isolated staging'],
   INVALID_MEMBER:[400,'Invalid member ID'],NOT_FOUND:[404,'Member not found'],
   MEMBER_HAS_VOTED:[409,'Cannot delete member with a recorded ballot'],
   ELECTORATE_FROZEN:[409,'Member is part of an already frozen electorate']};
  const [status,message]=known[e?.code]||[503,'Staging member cleanup unavailable'];
  return res.status(status).json({success:false,message});
 }
});
app.patch('/api/admin/members/:memberId',staffOnly,async(req,res)=>{
 try{
  const {updateMemberProfileWithAudit}=require('./database/members');
  const {verifyGuimbaLocation}=require('./database/guimba-location');
  const member=await updateMemberProfileWithAudit(connection,req.params.memberId,req.body||{},
   {validateLocation:verifyGuimbaLocation,operatorId:req.staff.accountId,actorRole:req.staff.role});
  if(!member)return res.status(404).json({success:false,message:'Member not found'});
  res.set('Cache-Control','no-store');
  return res.json({success:true,member});
 }catch(e){
  if(e instanceof TypeError)return res.status(400).json({success:false,message:'Invalid name, area, or Guimba barangay'});
  return res.status(503).json({success:false,message:'Member profile update unavailable'});
 }
});
app.post('/api/admin/members/:memberId/biometrics',staffOnly,async(req,res)=>{
 const {updateMemberBiometrics}=require('./database/member-biometric-replacement');
 if(req.body?.consent!==true)
  return res.status(400).json({success:false,message:'Explicit consent to biometric replacement is required'});
 if(typeof req.body?.reason!=='string'||req.body.reason.trim().length<12||
    req.body.reason.trim().length>500)
  return res.status(400).json({success:false,message:'A reason of 12–500 characters is required'});
 if(!validDescriptor(req.body?.descriptor))
  return res.status(400).json({success:false,message:'Valid biometric descriptor required'});
 let verified=false;
 try{
  verified=await consumeFaceChallenge(connection.db,{
   challengeId:req.body?.challengeId,completedActions:req.body?.completedActions,
   binding:faceBinding(req)
  });
 }catch(_){return res.status(503).json({success:false,message:'Biometric challenge unavailable'})}
 clearFaceBinding(res);
 if(!verified)return res.status(401).json({success:false,message:'Facial challenge expired or incomplete'});
 try{
  const result=await updateMemberBiometrics(connection,{
   memberId:req.params.memberId,descriptor:req.body.descriptor,
   reason:req.body.reason,operatorId:req.staff?.accountId,key:keyFromEnv()
  });
  res.set('Cache-Control','no-store');
  return res.json({success:true,...result});
 }catch(e){
  const codes={REASON_REQUIRED:[400,'Reason is required'],
   INVALID_BIOMETRIC:[400,'Invalid biometric data'],
   MEMBER_NOT_FOUND:[404,'Active member with biometric enrollment not found'],
   ENROLLMENT_BUSY:[423,'Another biometric update is in progress'],
   ELECTORATE_FROZEN:[409,'Cannot replace a biometric template during a frozen election'],
   DUPLICATE_BIOMETRIC:[409,'This face is enrolled to another member'],
   UNREADABLE_BIOMETRIC:[503,'Biometric verification is unavailable']};
  const [status,message]=codes[e.code]||[503,'Biometric update unavailable'];
  return res.status(status).json({success:false,message});
 }
});
app.patch('/api/admin/members/:memberId/status',staffOnly,async(req,res)=>{
 const memberId=req.params.memberId,status=req.body?.status;
 if(!/^MEM-[0-9a-f-]{36}$/i.test(memberId)||!['Active','Inactive'].includes(status))
  return res.status(400).json({success:false,message:'Invalid member or status'});
 try {
  const {setMemberStatusWithAudit}=require('./database/members');
  const updated=await setMemberStatusWithAudit(connection,memberId,status,
   {operatorId:req.staff.accountId,actorRole:req.staff.role});
  if(!updated)return res.status(404).json({success:false,message:'Member not found'});
  res.set('Cache-Control','no-store');
  return res.json({success:true});
 }catch(e){
  if(e?.code==='ELECTORATE_FROZEN')
   return res.status(409).json({success:false,message:'Cannot activate members while the election roster is frozen'});
  return res.status(503).json({success:false,message:'Member update unavailable'});
 }
});
app.get('/api/superadmin/elections/:electionId/custodians',superadminOnly,async(req,res)=>{
 try{
  const {getCustodianDeliveryStatus}=require('./database/custodian-status');
  const status=await getCustodianDeliveryStatus(connection.db,req.params.electionId);
  if(!status)return res.status(404).json({success:false,message:'Election not found'});
  res.set('Cache-Control','no-store');
  return res.json({success:true,...status});
 }catch(e){
  if(e instanceof TypeError)return res.status(400).json({success:false,message:'Invalid election ID'});
  return res.status(503).json({success:false,message:'Custodian status temporarily unavailable'});
 }
});
app.post('/api/admin/elections/:electionId/provision-keys',superadminOnly,async(req,res)=>{
 try{
  if(!process.env.BREVO_API_KEY||!process.env.BREVO_FROM_EMAIL)
   return res.status(503).json({success:false,message:'Brevo is not configured'});
  const {provisionElectionKeys}=require('./database/key-provisioning');
  const result=await provisionElectionKeys(connection,{
   electionId:req.params.electionId,emails:req.body?.emails});
  res.set('Cache-Control','no-store');
  return res.json({success:true,electionId:result.electionId,
   custodians:result.custodians,keyFingerprint:result.keyFingerprint,
   message:'Shares accepted for sending. Both custodians must independently confirm receipt.'});
 }catch(e){
  if(e?.code==='INVALID_CUSTODIANS')return res.status(400).json({success:false,message:'Two different valid custodian emails required'});
  if(e?.code==='KEY_PROVISION_NOT_ALLOWED')return res.status(409).json({success:false,message:'Election must be scheduled, not started, and have no previous key'});
  return res.status(503).json({success:false,message:'Key provisioning unavailable; do not vote until both custodians confirm'});
 }
});
app.post('/api/key-custody/confirm',rateLimit,async(req,res)=>{
 try{
  const {confirmCustodianShare}=require('./database/custodian-confirmation');
  const ok=await confirmCustodianShare(connection.db,{
   electionId:req.body?.electionId,shareIndex:req.body?.shareIndex,share:req.body?.share});
  res.set('Cache-Control','no-store');
  if(!ok)return res.status(400).json({success:false,message:'Invalid or expired custodian share'});
  return res.json({success:true,message:'Custodian receipt confirmed'});
 }catch(_){return res.status(503).json({success:false,message:'Custodian confirmation unavailable'})}
});
app.post('/api/admin/elections/:electionId/disclose-results',superadminOnly,async(req,res)=>{
 try{
  const {discloseElectionResults}=require('./database/results-disclosure');
  const report=await discloseElectionResults(connection,{
   electionId:req.params.electionId,shares:req.body?.shares});
  res.set('Cache-Control','no-store');
  return res.json({success:true,report});
 }catch(e){
  if(e.code==='INVALID_DISCLOSURE'||e.code==='INVALID_SHARES')return res.status(400).json({success:false,message:'Two valid custodian shares are required'});
  if(e.code==='NOT_DISCLOSABLE')return res.status(409).json({success:false,message:'Results cannot be disclosed before the election ends'});
  if(e.code==='ALREADY_FINALIZED')return res.status(409).json({success:false,message:'Results already finalized'});
  return res.status(503).json({success:false,message:'Result disclosure unavailable; review ballot integrity before retrying'});
 }
});
app.get('/api/elections/recent-finalized',async(req,res)=>{
 try{
  const elections=await connection.db.collection('elections').find(
   {status:'Finalized'},
   {projection:{_id:0,electionId:1,title:1,finalizedAt:1},sort:{finalizedAt:-1},limit:10}).toArray();
  res.set('Cache-Control','no-store');
  return res.json({success:true,elections});
 }catch(_){return res.status(503).json({success:false,message:'Election archive temporarily unavailable'})}
});
app.get('/api/elections/:electionId/results',async(req,res)=>{
 const id=req.params.electionId;
 if(!/^ELEC-[0-9a-f-]{36}$/i.test(id))return res.status(400).json({success:false,message:'Invalid election ID'});
 try{
  const report=await connection.db.collection('finalReports').findOne({electionId:id},
   {projection:{_id:0,electionId:1,ballotsCast:1,results:1,publishedAt:1,reportHash:1}});
  if(!report)return res.status(404).json({success:false,message:'Final results are not yet published'});
  const expected=crypto.createHash('sha256').update(JSON.stringify({electionId:report.electionId,
    ballotsCast:report.ballotsCast,results:report.results,publishedAt:report.publishedAt})).digest('hex');
  if(typeof report.reportHash!=='string'||expected!==report.reportHash)
   return res.status(503).json({success:false,message:'Report integrity verification failed'});
  res.set('Cache-Control','no-store');
  return res.json({success:true,report});
 }catch(_){return res.status(503).json({success:false,message:'Report unavailable'})}
});
app.get('/api/admin/elections/:electionId/candidates',staffOnly,async(req,res)=>{
 try{
  const id=req.params.electionId;
  if(!/^ELEC-[0-9a-f-]{36}$/i.test(id))return res.status(400).json({success:false,message:'Invalid election ID'});
  const candidates=await connection.db.collection('candidates').find({electionId:id,status:'Active'},
   {projection:{_id:0,candidateId:1,name:1,position:1,maxVotes:1}}).toArray();
  res.set('Cache-Control','no-store');
  return res.json({success:true,candidates});
 }catch(_){return res.status(503).json({success:false,message:'Candidate list unavailable'})}
});
app.post('/api/admin/elections/:electionId/candidates',staffOnly,async(req,res)=>{
 try{
  const {editCandidate}=require('./database/candidate-maintenance');
  const result=await editCandidate(connection,{operatorId:req.staff.accountId,actorRole:req.staff.role,electionId:req.params.electionId,
    operation:'add',position:req.body?.position,candidateName:req.body?.name,photo:req.body?.photo});
  return res.status(201).json({success:true,...result});
 }catch(e){
  const errors={INVALID_CANDIDATE:[400,'Invalid candidate or photo'],
    ELECTION_LOCKED:[409,'Candidate editing is locked after key provisioning begins, after voting starts, or during another edit'],
    DUPLICATE_CANDIDATE:[409,'Candidate already exists'],UNKNOWN_POSITION:[400,'Unknown election position']};
  const [status,message]=errors[e?.code]||[503,'Candidate update unavailable'];
  return res.status(status).json({success:false,message});
 }
});
app.patch('/api/admin/elections/:electionId/candidates/:candidateId',staffOnly,async(req,res)=>{
 try{
  const {editCandidate}=require('./database/candidate-maintenance');
  const result=await editCandidate(connection,{operatorId:req.staff.accountId,actorRole:req.staff.role,
   electionId:req.params.electionId,candidateId:req.params.candidateId,
   operation:'update',candidateName:req.body?.name,photo:req.body?.photo
  });
  res.set('Cache-Control','no-store');
  return res.json({success:true,...result});
 }catch(e){
  const errors={
   INVALID_CANDIDATE:[400,'Invalid candidate details or JPG/PNG photo'],
   ELECTION_LOCKED:[409,'Candidate changes are locked once key provisioning starts, voting begins, or another edit is underway'],
   CANDIDATE_NOT_FOUND:[404,'Candidate not found'],
   DUPLICATE_CANDIDATE:[409,'Another candidate in this position already has that name']
  };
  const [status,message]=errors[e?.code]||[503,'Candidate update unavailable'];
  return res.status(status).json({success:false,message});
 }
});
app.delete('/api/admin/elections/:electionId/candidates/:candidateId',staffOnly,async(req,res)=>{
 try{
  const {editCandidate}=require('./database/candidate-maintenance');
  const result=await editCandidate(connection,{operatorId:req.staff.accountId,actorRole:req.staff.role,electionId:req.params.electionId,
    candidateId:req.params.candidateId,operation:'remove'});
  return res.json({success:true,...result});
 }catch(e){
  const errors={INVALID_CANDIDATE:[400,'Invalid candidate ID'],
   ELECTION_LOCKED:[409,'Candidate editing is locked after key provisioning begins, after voting starts, or during another edit'],
   CANDIDATE_NOT_FOUND:[404,'Candidate not found'],
   INSUFFICIENT_CANDIDATES:[409,'Cannot leave fewer candidates than the position limit']};
  const [status,message]=errors[e?.code]||[503,'Candidate removal unavailable'];
  return res.status(status).json({success:false,message});
 }
});
app.post('/api/admin/initialize-election',staffOnly,async(req,res)=>{
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
// Voting is disabled by default. Enable only for synthetic staging rehearsals.
app.post('/api/vote',async(req,res)=>{
 if(process.env.ENABLE_MONGODB_VOTE_TEST!=='true')
  return res.status(403).json({success:false,message:'Voting is disabled until the system is approved for launch'});
 try{
  const auth=await authenticateSession(connection.db,token(req));
  if(!auth||auth.role!=='member')return res.status(403).json({success:false,message:'Voter session required'});
  const {castEncryptedVote}=require('./database/vote-service');
  const result=await castEncryptedVote(connection,{memberId:auth.accountId,choices:req.body?.choices});
  res.set('Cache-Control','no-store');
  return res.json({success:true,receiptNo:result.receiptNo});
 }catch(e){
  const responses={NOT_AUTHORIZED:[403,'Voter is not active'],VOTING_CLOSED:[403,'Voting is not open'],
   INVALID_BALLOT:[400,'Invalid candidate selection'],DUPLICATE_BALLOT:[409,'A vote was already recorded'],
   ENCRYPTION_UNAVAILABLE:[503,'Election encryption keys are not configured']};
  const [status,message]=responses[e?.code]||[503,'Secure voting is unavailable'];
  return res.status(status).json({success:false,message});
 }
});
app.get('/api/member/notifications',async(req,res)=>{
 try{
  const auth=await authenticateSession(connection.db,token(req));
  if(!auth||auth.role!=='member')return res.status(403).json({success:false,message:'Member session required'});
  const {listMemberNotifications}=require('./database/member-notifications');
  const notifications=await listMemberNotifications(connection.db,auth.accountId);
  res.set('Cache-Control','no-store');
  return res.json({success:true,notifications});
 }catch(_){return res.status(503).json({success:false,message:'Notifications unavailable'})}
});
app.post('/api/member/notifications/:notificationId/read',async(req,res)=>{
 try{
  const auth=await authenticateSession(connection.db,token(req));
  if(!auth||auth.role!=='member')return res.status(403).json({success:false,message:'Member session required'});
  const {markMemberNotificationRead}=require('./database/member-notifications');
  let updated;
  try{updated=await markMemberNotificationRead(connection.db,auth.accountId,req.params.notificationId)}
  catch(e){if(e instanceof TypeError)return res.status(400).json({success:false,message:'Invalid notification'});throw e}
  if(!updated)return res.status(404).json({success:false,message:'Notification not found'});
  res.set('Cache-Control','no-store');return res.json({success:true});
 }catch(_){return res.status(503).json({success:false,message:'Notification update unavailable'})}
});
app.get('/api/member/receipts',async(req,res)=>{
 try{
  const auth=await authenticateSession(connection.db,token(req));
  if(!auth||auth.role!=='member')
   return res.status(403).json({success:false,message:'Member session required'});
  const {listMemberReceipts}=require('./database/member-receipts');
  const receipts=await listMemberReceipts(connection.db,auth.accountId);
  res.set('Cache-Control','no-store');
  return res.json({success:true,receipts});
 }catch(_){return res.status(503).json({success:false,message:'Receipt history unavailable'})}
});
app.get('/api/receipts/:code',async(req,res)=>{
 try{
  const auth=await authenticateSession(connection.db,token(req));
  if(!auth||auth.role!=='member')return res.status(403).json({success:false,message:'Voter session required'});
  const code=req.params.code;
  if(!/^BHW-[A-F0-9]{32}$/.test(code))return res.status(400).json({success:false,message:'Invalid receipt number'});
  const receipt=await connection.db.collection('receiptCodes').findOne(
    {receiptCode:code,memberId:auth.accountId});
  if(!receipt)return res.status(404).json({success:false,message:'Receipt not found'});
  const participation=await connection.db.collection('voterParticipation').findOne({
    electionId:receipt.electionId,memberId:auth.accountId,receiptCode:code,status:'Valid'
  },{projection:{_id:0,createdAt:1}});
  if(!participation)return res.status(404).json({success:false,message:'Receipt not found'});
  res.set('Cache-Control','no-store');
  return res.json({success:true,receiptNo:code,electionId:receipt.electionId,
    recordedAt:participation.createdAt,message:'Participation confirmed. Ballot contents remain anonymous.'});
 }catch(_){return res.status(503).json({success:false,message:'Receipt verification unavailable'})}
});
app.get('/api/session',async(req,res)=>{
 try{
  const auth=await authenticateSession(connection.db,token(req));
  if(!auth)return res.status(401).json({success:false,message:'Session expired'});
  if(auth.role==='superadmin'||auth.role==='admin'){
    const admin=await connection.db.collection('admins').findOne({adminId:auth.accountId,status:'Active'});
    if(!admin)return res.status(401).json({success:false,message:'Session expired'});
    res.set('Cache-Control','no-store');
    return res.json({success:true,role:auth.role,memberId:auth.accountId,fullName:admin.fullName,
      staging:/_(?:Staging|Test)$/i.test(connection.db.databaseName)});
  }
  const member=await connection.db.collection('members').findOne({memberId:auth.accountId,status:'Active'});
  if(!member)return res.status(401).json({success:false,message:'Session expired'});
  const election=await connection.db.collection('elections').findOne({status:'Active',endTime:{$gt:new Date()}},{sort:{createdAt:-1}});
  const hasVoted=!!(election&&await connection.db.collection('voterParticipation').findOne({electionId:election.electionId,memberId:auth.accountId,status:'Valid'}));
  const eligibleThisElection=!!(election&&election.eligibilityFrozenAt instanceof Date&&
    member.createdAt instanceof Date&&member.createdAt<=election.eligibilityFrozenAt);
  res.set('Cache-Control','no-store');
  res.json({success:true,role:'member',memberId:auth.accountId,fullName:member.fullName,
    hasVoted,eligibleThisElection});
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
 if(process.env.ENABLE_MONGODB_VOTE_TEST==='true'&&
   !/_(?:Staging|Test)$/i.test(process.env.MONGODB_DB_NAME||''))
  throw new Error('Synthetic vote testing requires a separate _Staging or _Test MongoDB database');
 if(process.env.ENABLE_MONGODB_AUTH_PREVIEW!=='true')throw new Error('Explicit ENABLE_MONGODB_AUTH_PREVIEW=true required');
 keyFromEnv();
 connection=await connectMongo();
 await initializeMongoIndexes(connection.db);
 if(/_(?:Staging|Test)$/i.test(connection.db.databaseName)){
  const {ensureStagingSuperadmin}=require('./database/staging-bootstrap');
  const result=await ensureStagingSuperadmin(connection.db);
  console.log('Isolated staging Super Admin bootstrap:',result.status);
 }
 app.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('MongoDB authentication preview listening; voting disabled'));
}
main().catch(()=>{console.error('MongoDB authentication preview failed to start; check configuration');process.exitCode=1});
