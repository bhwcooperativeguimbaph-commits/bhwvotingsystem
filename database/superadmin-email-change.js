'use strict';
// Changing a Super Admin's recovery/MFA recipient requires authorization,
// separate verification of the old AND new email, and atomic session revocation.
const crypto=require('node:crypto');
const {sendBrevoEmail}=require('../services/brevo-email');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=code=>Object.assign(new Error(code),{code});
const safeEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const timingMatch=(actual,guess)=>typeof actual==='string'&&
 crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(digest(guess),'hex'));
async function requestSuperadminEmailChange(db,{adminId,newEmail,deliver=sendBrevoEmail,now=new Date()}){
 const email=safeEmail(newEmail);
 if(adminId!=='SUPERADMIN'||!EMAIL.test(email)||email.length>254||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw fail('INVALID_EMAIL_CHANGE');
 const admin=await db.collection('admins').findOne(
  {adminId,role:'superadmin',status:'Active'}, {projection:{email:1,adminId:1}});
 if(!admin||!admin.email||safeEmail(admin.email)===email)throw fail('INVALID_EMAIL_CHANGE');
 if(await db.collection('admins').findOne({email},{projection:{_id:1}}))
  throw fail('INVALID_EMAIL_CHANGE');
 const cooldowns=db.collection('adminEmailChangeCooldowns');
 await cooldowns.updateOne({adminId},{$setOnInsert:{adminId,nextAllowed:new Date(0)}},{upsert:true});
 const held=await cooldowns.findOneAndUpdate(
  {adminId,nextAllowed:{$lte:now}},{$set:{nextAllowed:new Date(now.getTime()+300000)}},
  {returnDocument:'after'});
 if(!held)throw fail('EMAIL_CHANGE_COOLDOWN');
 const challenge=crypto.randomBytes(32).toString('hex');
 const oldCode=String(crypto.randomInt(100000,1000000));
 const newCode=String(crypto.randomInt(100000,1000000));
 const challengeHash=digest(challenge);
 const collection=db.collection('adminEmailChangeChallenges');
 await collection.insertOne({challengeHash,adminId,oldEmail:admin.email,newEmail:email,
  oldCodeHash:digest(oldCode),newCodeHash:digest(newCode),
  attempts:0,consumed:false,createdAt:now,expiresAt:new Date(now.getTime()+300000)});
 try{
  await deliver({to:admin.email,subject:'BHW old email confirmation',
   text:oldCode});
  await deliver({to:email,subject:'BHW new email confirmation',
   text:newCode});
 }catch(_){
  await collection.deleteOne({challengeHash}).catch(()=>{});
  throw fail('EMAIL_DELIVERY_UNAVAILABLE');
 }
 return {challenge,expiresInSeconds:300};
}
async function completeSuperadminEmailChange(connection,{adminId,challenge,oldCode,newCode,now=new Date()}){
 if(adminId!=='SUPERADMIN'||
    !/^[a-f0-9]{64}$/.test(challenge||'')||!/^[0-9]{6}$/.test(oldCode||'')||
    !/^[0-9]{6}$/.test(newCode||'')||!(now instanceof Date))
  throw fail('INVALID_EMAIL_CHANGE');
 const {db,client}=connection,challengeHash=digest(challenge);
 const record=await db.collection('adminEmailChangeChallenges').findOneAndUpdate(
  {challengeHash,adminId,consumed:false,expiresAt:{$gt:now},attempts:{$lt:5}},
  {$inc:{attempts:1}},{returnDocument:'after'});
 if(!record||!timingMatch(record.oldCodeHash,oldCode)||!timingMatch(record.newCodeHash,newCode))
  throw fail('INVALID_EMAIL_CHANGE');
 const session=client.startSession();
 try{
  await session.withTransaction(async()=>{
   const used=await db.collection('adminEmailChangeChallenges').updateOne(
    {challengeHash,adminId,consumed:false,attempts:{$lte:5}},{$set:{consumed:true}},{session});
   if(used.modifiedCount!==1)throw fail('INVALID_EMAIL_CHANGE');
   const changed=await db.collection('admins').updateOne({
    adminId,role:'superadmin',status:'Active',email:record.oldEmail
   },{$set:{email:record.newEmail,updatedAt:now}},{session});
   if(changed.matchedCount!==1)throw fail('INVALID_EMAIL_CHANGE');
   await db.collection('authSessions').deleteMany({accountId:adminId},{session});
   await db.collection('auditLogs').insertOne({
    eventId:'AUD-'+crypto.randomUUID(),actorRole:'superadmin',
    actorId:adminId,action:'SUPERADMIN_EMAIL_CHANGED',outcome:'success',createdAt:now
   },{session});
  },{writeConcern:{w:'majority'}});
 }catch(e){
  if(e?.code===11000)throw fail('INVALID_EMAIL_CHANGE');
  throw e;
 }finally{await session.endSession()}
 return {ok:true};
}
module.exports={requestSuperadminEmailChange,completeSuperadminEmailChange};
