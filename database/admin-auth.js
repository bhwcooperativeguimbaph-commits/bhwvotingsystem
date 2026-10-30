'use strict';
// MongoDB superadmin password + email one-time code. No password-only admin sessions.
const crypto=require('node:crypto');
const {issueSession}=require('./sessions');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function verifyPassword(password,stored){
 if(typeof password!=='string'||password.length>256||typeof stored!=='string')return false;
 const parts=stored.split('$');
 if(parts.length!==3||parts[0]!=='scrypt'||!/^[a-f0-9]{32}$/i.test(parts[1])||!/^[a-f0-9]{128}$/i.test(parts[2]))return false;
 const expected=Buffer.from(parts[2],'hex');
 return crypto.timingSafeEqual(expected,crypto.scryptSync(password,parts[1],64));
}
async function beginAdminLogin(db,{username,password,deliverOtp,now=new Date()}){
 if(typeof username!=='string'||typeof deliverOtp!=='function')throw new TypeError('Invalid login request');
 const admin=await db.collection('admins').findOne({username,status:'Active',role:'superadmin'});
 if(!admin||!verifyPassword(password,admin.passwordHash))return {ok:false,code:'INVALID_CREDENTIALS'};
 if(typeof admin.email!=='string'||!admin.email.includes('@'))return {ok:false,code:'MFA_NOT_CONFIGURED'};
 const challenge=crypto.randomBytes(32).toString('hex'),code=String(crypto.randomInt(100000,1000000));
 const challengeHash=sha(challenge);
 const challenges=db.collection('adminMfaChallenges');
 // One live challenge per administrator; atomic cooldown is checked with a conditional update.
 await db.collection('adminMfaCooldowns').updateOne({adminId:admin.adminId},{$setOnInsert:{adminId:admin.adminId,nextAllowed:new Date(0)}},{upsert:true});
 const cooldowns=db.collection('adminMfaCooldowns');
 const reserved=await cooldowns.findOneAndUpdate(
  {adminId:admin.adminId,$or:[{nextAllowed:{$lte:now}},{nextAllowed:{$exists:false}}]},
  {$set:{nextAllowed:new Date(now.getTime()+300000)}},{returnDocument:'after',upsert:false});
 if(!reserved)return {ok:false,code:'MFA_COOLDOWN'};
 await challenges.insertOne({challengeHash,adminId:admin.adminId,codeHash:sha(code),
  expiresAt:new Date(now.getTime()+300000),attempts:0,consumed:false});
 try{await deliverOtp(admin.email,code)}catch(_){
  await challenges.deleteOne({challengeHash});
  // Undo only our own reservation; do not clear a newer attempt's cooldown.
  await cooldowns.updateOne({adminId:admin.adminId,nextAllowed:new Date(now.getTime()+300000)},
    {$set:{nextAllowed:new Date(0)}}).catch(()=>{});
  return {ok:false,code:'MFA_DELIVERY_FAILURE'};
 }
 return {ok:true,mfaRequired:true,challenge};
}
async function completeAdminLogin(db,{challenge,code,now=new Date()}){
 if(!/^[a-f0-9]{64}$/.test(challenge||'')||!/^[0-9]{6}$/.test(code||''))return {ok:false};
 const col=db.collection('adminMfaChallenges'),challengeHash=sha(challenge);
 // Reserve/consume atomically before issuing a session; no OTP replay.
 const stored=await col.findOneAndUpdate({challengeHash,consumed:false,
  expiresAt:{$gt:now},attempts:{$lt:5}},{$inc:{attempts:1}},{returnDocument:'after'});
 if(!stored)return {ok:false};
 if(!crypto.timingSafeEqual(Buffer.from(stored.codeHash,'hex'),Buffer.from(sha(code),'hex')))return {ok:false};
 const consumed=await col.updateOne({challengeHash,consumed:false},{$set:{consumed:true}});
 if(consumed.modifiedCount!==1)return {ok:false};
 const session=await issueSession(db,{accountId:stored.adminId,role:'superadmin'});
 return {ok:true,token:session.token};
}
module.exports={verifyPassword,beginAdminLogin,completeAdminLogin};
