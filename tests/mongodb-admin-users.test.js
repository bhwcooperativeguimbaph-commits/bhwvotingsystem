'use strict';
const assert=require('node:assert/strict');
const {createAdmin,updateAdminStatus,validateAdmin}=require('../database/admin-users');
const {verifyPassword,beginAdminLogin,completeAdminLogin}=require('../database/admin-auth');
async function main(){
 const existing=[],sessions=[{accountId:'x'}],mfa=[],sent=[];
 const transaction={withTransaction:async fn=>fn(),endSession:async()=>{}};
 const db={collection(name){
  if(name==='admins')return {
   insertOne:async a=>existing.push(a),
   findOne:async q=>existing.find(a=>(q.adminId&&a.adminId===q.adminId||q.username&&a.username===q.username)&&a.status===q.status)||null,
   updateOne:async(q,u)=>{const a=existing.find(a=>a.adminId===q.adminId&&a.role==='admin');if(!a)return{matchedCount:0};Object.assign(a,u.$set);return{matchedCount:1}}
  };
  if(name==='authSessions')return {
   insertOne:async x=>{sessions.push(x)},
   deleteMany:async q=>{const before=sessions.length;for(let i=sessions.length-1;i>=0;i--)if(sessions[i].accountId===q.accountId)sessions.splice(i,1);return{deletedCount:before-sessions.length}}
  };
  if(name==='adminMfaCooldowns'){
   let reserved=false;
   return {updateOne:async()=>({}),findOneAndUpdate:async()=>{if(reserved)return null;reserved=true;return{adminId:'x'}}};
  }
  if(name==='adminMfaChallenges')return {
   insertOne:async x=>mfa.push(x),
   findOneAndUpdate:async q=>{const v=mfa.find(x=>x.challengeHash===q.challengeHash&&!x.consumed);if(v){v.attempts++;return v}return null},
   updateOne:async q=>{const v=mfa.find(x=>x.challengeHash===q.challengeHash);if(v&&!v.consumed){v.consumed=true;return{modifiedCount:1}}return{modifiedCount:0}},
   deleteOne:async()=>({})
  };
  if(name==='auditLogs')return {insertOne:async(doc,opts)=>{assert.equal(doc.action,'ADMIN_STATUS_CHANGED');assert.ok(opts?.session)}};
  throw Error(name)
 }};
 assert.throws(()=>validateAdmin({username:'a',email:'invalid',fullName:'Someone',password:'short'}),e=>e.code==='INVALID_ADMIN');
 const admin=await createAdmin(db,{username:'staff.one',fullName:'Test Staff',email:'staff@example.test',password:'Correct-Horse-Battery-2026'});
 assert.equal(admin.username,'staff.one');
 assert.equal(existing[0].role,'admin');
 assert.equal(verifyPassword('Correct-Horse-Battery-2026',existing[0].passwordHash),true);
 assert.equal(verifyPassword('wrong',existing[0].passwordHash),false);
 const at=new Date('2027-01-01T00:00:00Z');
 const started=await beginAdminLogin(db,{username:'staff.one',password:'Correct-Horse-Battery-2026',
  deliverOtp:async(email,code)=>sent.push({email,code}),now:at});
 assert.equal(started.ok,true);assert.equal(sent.length,1);
 const verified=await completeAdminLogin(db,{challenge:started.challenge,code:sent[0].code,now:at});
 assert.equal(verified.ok,true);assert.equal(verified.role,'admin');
 sessions.push({accountId:admin.adminId});
 const activeConnection={db,client:{startSession:()=>transaction}};
 await updateAdminStatus(activeConnection,admin.adminId,'Inactive');
 assert.equal(existing[0].status,'Inactive');
 assert.equal(sessions.filter(s=>s.accountId===admin.adminId).length,0);
 const rejected=await beginAdminLogin(db,{username:'staff.one',password:'Correct-Horse-Battery-2026',
  deliverOtp:async()=>{},now:at});
 assert.equal(rejected.code,'INVALID_CREDENTIALS');
 assert.throws(()=>validateAdmin({username:'superadmin',fullName:'X',email:'a@example.test',password:'short'}),e=>e.code==='INVALID_ADMIN');
 console.log('PASS: Admin creation, scrypt, email OTP, role-bound session, deactivation and revocation');
}
main().catch(e=>{console.error(e);process.exitCode=1});
