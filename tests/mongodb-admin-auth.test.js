'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verifyPassword,beginAdminLogin,completeAdminLogin}=require('../database/admin-auth');
async function run(){
 const password='Passw0rd!secure-123',salt=crypto.randomBytes(16).toString('hex');
 const passwordHash='scrypt$'+salt+'$'+crypto.scryptSync(password,salt,64).toString('hex');
 assert.equal(verifyPassword(password,passwordHash),true);
 assert.equal(verifyPassword('incorrect',passwordHash),false);
 assert.equal(verifyPassword(password,'incorrect'),false);
 const admin={adminId:'SUPERADMIN',username:'superadmin',role:'superadmin',status:'Active',email:'admin@example.test',passwordHash};
 let reservation={adminId:'SUPERADMIN',nextAllowed:new Date(0)},otp='',entries=[];
 const db={collection(name){
  if(name==='admins')return {findOne:async q=>q.username==='superadmin'?admin:null};
  if(name==='adminMfaCooldowns')return {
   updateOne:async()=>({acknowledged:true}),
   findOneAndUpdate:async(q,u)=>{if(reservation.nextAllowed>q.$or[0].nextAllowed.$lte)return null;reservation.nextAllowed=u.$set.nextAllowed;return reservation}
  };
  if(name==='adminMfaChallenges')return {
   insertOne:async x=>{entries.push(x)},
   deleteOne:async q=>{entries=entries.filter(x=>x.challengeHash!==q.challengeHash)},
   findOneAndUpdate:async(q,u)=>{const x=entries.find(x=>x.challengeHash===q.challengeHash&&!x.consumed&&x.attempts<5&&x.expiresAt>q.expiresAt.$gt);if(!x)return null;x.attempts++;return x},
   updateOne:async(q,u)=>{const x=entries.find(x=>x.challengeHash===q.challengeHash&&!x.consumed);if(!x)return {modifiedCount:0};x.consumed=u.$set.consumed;return {modifiedCount:1}}
  };
  if(name==='authSessions')return {insertOne:async()=>({acknowledged:true})};
 }};
 const now=new Date('2027-01-01T00:00:00Z');
 const first=await beginAdminLogin(db,{username:'superadmin',password,deliverOtp:async(_,code)=>{otp=code},now});
 assert.equal(first.ok,true);assert.equal(first.mfaRequired,true);
 const second=await beginAdminLogin(db,{username:'superadmin',password,deliverOtp:async()=>{},now});
 assert.equal(second.code,'MFA_COOLDOWN');
 assert.equal((await completeAdminLogin(db,{challenge:first.challenge,code:'000000',now})).ok,false);
 const verified=await completeAdminLogin(db,{challenge:first.challenge,code:otp,now});
 assert.equal(verified.ok,true);assert.match(verified.token,/^[0-9a-f]{64}$/);
 assert.equal((await completeAdminLogin(db,{challenge:first.challenge,code:otp,now})).ok,false);
 console.log('PASS: MongoDB admin MFA password, cooldown, OTP and replay protection');
}
run().catch(e=>{console.error(e);process.exitCode=1});
