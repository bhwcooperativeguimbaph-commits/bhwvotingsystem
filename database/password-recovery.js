'use strict';
// Server-side, email-verified password recovery. Do not reveal account existence,
// OTPs, challenge secrets, or reset passwords in logs or public responses.
const crypto=require('node:crypto');
const {passwordHash}=require('./admin-users');
const {sendBrevoEmail}=require('../services/brevo-email');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const error=code=>Object.assign(new Error(code),{code});
async function requestPasswordReset(db,{username,send=sendBrevoEmail,now=new Date()}){
 const challenge=crypto.randomBytes(32).toString('hex');
 const generic={ok:true,challenge,message:'If the account exists, a password-reset code has been sent.'};
 if(typeof username!=='string'||username.length>100)return generic;
 const admin=await db.collection('admins').findOne({username:username.trim().toLowerCase(),status:'Active',
  role:{$in:['admin','superadmin']}},{projection:{adminId:1,email:1}});
 if(!admin||typeof admin.email!=='string')return generic;
 const cooldown=db.collection('passwordResetCooldowns');
 await cooldown.updateOne({adminId:admin.adminId},{$setOnInsert:{adminId:admin.adminId,nextAllowed:new Date(0)}},{upsert:true});
 const reservation=await cooldown.findOneAndUpdate(
  {adminId:admin.adminId,nextAllowed:{$lte:now}},
  {$set:{nextAllowed:new Date(now.getTime()+300000)}},{returnDocument:'after'});
 if(!reservation)return generic;
 const code=String(crypto.randomInt(100000,1000000)),challengeHash=sha(challenge);
 await db.collection('passwordResetChallenges').insertOne({
  challengeHash,adminId:admin.adminId,codeHash:sha(code),attempts:0,
  consumed:false,expiresAt:new Date(now.getTime()+300000),createdAt:now});
 try{
  await send({to:admin.email,subject:'BHW administrator password recovery',
   text:'Your BHW password recovery code is '+code+'. It expires in five minutes. If you did not request this, ignore the message.'});
 }catch(_){
  await db.collection('passwordResetChallenges').deleteOne({challengeHash}).catch(()=>{});
  // Avoid storing failed challenges. Do not reveal transport errors to the requester.
 }
 return generic;
}
async function verifyPasswordReset(connection,{challenge,code,newPassword,now=new Date()}){
 if(typeof challenge!=='string'||!/^[a-f0-9]{64}$/.test(challenge)||
   typeof code!=='string'||!/^[0-9]{6}$/.test(code)||
   typeof newPassword!=='string'||newPassword.length<16||newPassword.length>256)
  throw error('INVALID_RESET');
 const db=connection.db,col=db.collection('passwordResetChallenges'),challengeHash=sha(challenge);
 const candidate=await col.findOneAndUpdate({
  challengeHash,consumed:false,expiresAt:{$gt:now},attempts:{$lt:5}
 },{$inc:{attempts:1}},{returnDocument:'after'});
 if(!candidate)throw error('INVALID_RESET');
 const expected=Buffer.from(candidate.codeHash,'hex'),got=Buffer.from(sha(code),'hex');
 if(expected.length!==got.length||!crypto.timingSafeEqual(expected,got))
  throw error('INVALID_RESET');
 const session=connection.client.startSession();
 try{
  await session.withTransaction(async()=>{
   const consumed=await col.updateOne({challengeHash,consumed:false},
    {$set:{consumed:true}},{session});
   if(consumed.modifiedCount!==1)throw error('INVALID_RESET');
   const changed=await db.collection('admins').updateOne(
    {adminId:candidate.adminId,status:'Active',role:{$in:['admin','superadmin']}},
    {$set:{passwordHash:passwordHash(newPassword),updatedAt:now}},{session});
   if(changed.modifiedCount!==1)throw error('INVALID_RESET');
   await db.collection('authSessions').deleteMany({accountId:candidate.adminId},{session});
   await db.collection('auditLogs').insertOne({eventId:'AUD-'+crypto.randomUUID(),
    actorRole:'account_owner',action:'ADMIN_PASSWORD_RESET',createdAt:now},{session});
  },{writeConcern:{w:'majority'}});
  return {ok:true};
 }finally{await session.endSession()}
}
module.exports={requestPasswordReset,verifyPasswordReset};
