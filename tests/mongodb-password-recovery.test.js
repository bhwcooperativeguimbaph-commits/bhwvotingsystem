'use strict';
const assert=require('node:assert/strict');
const {requestPasswordReset,verifyPasswordReset}=require('../database/password-recovery');
const {verifyPassword}=require('../database/admin-auth');
async function main(){
 const admin={adminId:'SUPERADMIN',username:'admin',email:'owner@example.test',
  role:'superadmin',status:'Active',passwordHash:'',updatedAt:null};
 const challenges=[],sent=[],events=[],sessionTokens=[{accountId:'SUPERADMIN'}];
 let reservation=new Date(0);
 const db={collection(name){
  if(name==='admins')return{
   findOne:async q=>q.username==='admin'&&admin.status==='Active'?admin:null,
   updateOne:async(q,u)=>{if(q.adminId!==admin.adminId)return{modifiedCount:0};
    Object.assign(admin,u.$set);return{modifiedCount:1}}
  };
  if(name==='passwordResetCooldowns')return{
   updateOne:async()=>({acknowledged:true}),
   findOneAndUpdate:async(q,u)=>{if(reservation>q.nextAllowed.$lte)return null;
    reservation=u.$set.nextAllowed;return{adminId:'SUPERADMIN'}}
  };
  if(name==='passwordResetChallenges')return{
   insertOne:async c=>challenges.push(c),
   deleteOne:async()=>({}),
   findOneAndUpdate:async q=>{const c=challenges.find(c=>c.challengeHash===q.challengeHash&&!c.consumed&&c.expiresAt>q.expiresAt.$gt);
    if(!c)return null;c.attempts++;return c},
   updateOne:async(q,u)=>{const c=challenges.find(c=>c.challengeHash===q.challengeHash&&!c.consumed);if(!c)return{modifiedCount:0};c.consumed=u.$set.consumed;return{modifiedCount:1}}
  };
  if(name==='authSessions')return{deleteMany:async()=>{sessionTokens.length=0;return{deletedCount:1}}};
  if(name==='auditLogs')return{insertOne:async e=>events.push(e)};
  throw Error(name)
 }};
 const now=new Date('2027-01-01T00:00:00Z');
 const fake=await requestPasswordReset(db,{username:'unknown',send:async x=>sent.push(x),now});
 assert.equal(fake.ok,true);assert.equal(sent.length,0);
 const real=await requestPasswordReset(db,{username:'admin',send:async x=>sent.push(x),now});
 assert.equal(real.ok,true);assert.equal(real.message,fake.message);
 assert.equal(sent.length,1);assert.ok(sent[0].text.includes('expires in five minutes'));
 const code=sent[0].text.match(/[0-9]{6}/)?.[0];
 assert.ok(code);
 const connection={db,client:{startSession:()=>({withTransaction:async f=>f(),endSession:async()=>{}})}};
 await assert.rejects(verifyPasswordReset(connection,{challenge:real.challenge,code:'000000',
  newPassword:'A-different-long-password-2027',now}),e=>e.code==='INVALID_RESET');
 const good=await verifyPasswordReset(connection,{challenge:real.challenge,code,
  newPassword:'A-different-long-password-2027',now});
 assert.equal(good.ok,true);
 assert.equal(verifyPassword('A-different-long-password-2027',admin.passwordHash),true);
 assert.equal(sessionTokens.length,0);
 assert.equal(events[0].action,'ADMIN_PASSWORD_RESET');
 await assert.rejects(verifyPasswordReset(connection,{challenge:real.challenge,code,
  newPassword:'A-different-long-password-2027',now}),e=>e.code==='INVALID_RESET');
 console.log('PASS: Generic recovery response, Brevo OTP, hashed replacement, session revocation and replay prevention');
}
main().catch(e=>{console.error(e);process.exitCode=1});
