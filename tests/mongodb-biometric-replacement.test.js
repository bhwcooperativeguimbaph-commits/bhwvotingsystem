'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {updateMemberBiometrics}=require('../database/member-biometric-replacement');
const {encryptDescriptor,decryptDescriptor}=require('../database/biometrics');
const memberId='MEM-00000000-0000-4000-8000-000000000001';
const key=crypto.randomBytes(32);
const current=Array(128).fill(.1),other=Array(128).fill(.9);
let frozen=false,duplicate=false,updated=null,audit=null,revoked=false;
const session={withTransaction:async cb=>cb(),endSession:async()=>{}};
const db={collection(name){
 if(name==='elections')return {findOne:async()=>frozen?{_id:1}:null};
 if(name==='members')return {findOne:async()=>({memberId,status:'Active'})};
 if(name==='enrollmentLocks')return {
  findOneAndUpdate:async(q,u)=>({owner:u.$set.owner}),
  deleteOne:async()=>({deletedCount:1})
 };
 if(name==='biometricRegistrations')return {
  find:()=>({toArray:async()=>[{facialEncoding:encryptDescriptor(duplicate?current:other,key)}]}),
  findOne:async()=>({_id:1}),
  updateOne:async(q,u,opts)=>{
   assert.equal(q.memberId,memberId);assert.equal(opts.session,session);
   updated=u.$set;return{matchedCount:1}
  }
 };
 if(name==='auditLogs')return {insertOne:async(row,opts)=>{
  assert.equal(opts.session,session);audit=row
 }};
 if(name==='authSessions')return {deleteMany:async()=>{revoked=true;return{deletedCount:1}}};
 throw Error(name)
}};
const connection={db,client:{startSession:()=>session}};
async function main(){
 const input={memberId,descriptor:current,reason:'Camera changed after repairs',
  operatorId:'ADMIN-001',key,now:new Date('2026-10-01')};
 await assert.rejects(updateMemberBiometrics(connection,{...input,reason:'short'}),
  e=>e.code==='REASON_REQUIRED');
 frozen=true;
 await assert.rejects(updateMemberBiometrics(connection,input),e=>e.code==='ELECTORATE_FROZEN');
 frozen=false;duplicate=true;
 await assert.rejects(updateMemberBiometrics(connection,input),e=>e.code==='DUPLICATE_BIOMETRIC');
 duplicate=false;
 const result=await updateMemberBiometrics(connection,input);
 assert.deepEqual(result,{updated:true});
 assert.equal(audit.action,'MEMBER_BIOMETRICS_UPDATED');
 assert.equal(audit.reason,'Camera changed after repairs');
 assert.equal(audit.memberId,memberId);
 assert.ok(updated.facialEncoding.startsWith('enc:v1:'));
 assert.deepEqual(decryptDescriptor(updated.facialEncoding,key),current);
 assert.equal(revoked,true);
 console.log('PASS: Reason-audited biometric replacement, duplicate guard, frozen election block and session revocation');
}
main().catch(e=>{console.error(e);process.exitCode=1});
