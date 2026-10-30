'use strict';
// Isolated MongoDB authentication server. Voting and administration intentionally disabled.
// Existing browser-reported facial actions are retained; they are NOT trusted PAD.
const express=require('express');
const crypto=require('node:crypto');
const {connectMongo,initializeMongoIndexes}=require('./database/mongodb');
const {findFaceMatch,validDescriptor}=require('./database/face-matching');
const {issueSession,authenticateSession,revokeSession}=require('./database/sessions');
const {getPublicElectionInfo}=require('./database/election-read');
const {keyFromEnv,decryptDescriptor}=require('./database/biometrics');
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
app.get('/api/session',async(req,res)=>{
 try{
  const auth=await authenticateSession(connection.db,token(req));
  if(!auth)return res.status(401).json({success:false,message:'Session expired'});
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
