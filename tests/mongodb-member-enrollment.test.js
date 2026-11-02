'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {registerMemberWithFace}=require('../database/member-enrollment');
async function main(){
 const calls=[],biometrics=[];let owner;
 const session={withTransaction:async fn=>fn(),endSession:async()=>{}};
 const connection={client:{startSession:()=>session},db:{collection:name=>{
  if(name==='enrollmentLocks')return {
   findOneAndUpdate:async(q,u)=>{if(owner)throw Object.assign(new Error('busy'),{code:11000});owner=u.$set.owner;return {owner}},
   deleteOne:async q=>{if(owner===q.owner)owner=null}
  };
  if(name==='biometricRegistrations')return {
   find:()=>({toArray:async()=>biometrics}),
   insertOne:async(doc,opts)=>{assert.equal(opts.session,session);biometrics.push(doc);calls.push({name,doc})}
  };
  if(name==='members')return {insertOne:async(doc,opts)=>{assert.equal(opts.session,session);calls.push({name,doc})}};
  if(name==='auditLogs')return {insertOne:async(doc,opts)=>{assert.equal(doc.action,'MEMBER_ENROLLED');assert.ok(opts?.session)}};
  throw Error(name);
 }}};
 const input={firstName:'Test',middleName:'',lastName:'Member',area:'Area 1',address:'House 1, Sample Street',birthdate:'2000-01-01',gender:'Male',location:{
  country:'Philippines',province:'Nueva Ecija',city:'Guimba',
  regionCode:'0300000000',provinceCode:'0304900000',cityCode:'0304911000',barangayCode:'0304911001'
 },descriptor:Array(128).fill(.01),biometricConsent:true};
 const key=crypto.randomBytes(32);
 await assert.rejects(registerMemberWithFace(connection,{...input,firstName:' '},{key,validateLocation:async()=>true}),/First name/);
 await assert.rejects(registerMemberWithFace(connection,{...input,lastName:''},{key,validateLocation:async()=>true}),/First name/);
 await assert.rejects(registerMemberWithFace(connection,{...input,birthdate:'2012-12-01'},{key,validateLocation:async()=>true}),/18 years/);
 await assert.rejects(registerMemberWithFace(connection,input,{key,validateLocation:async()=>false}),/Geographic/);
 assert.equal(calls.length,0);
 const result=await registerMemberWithFace(connection,input,{key,validateLocation:async()=>true});
 assert.match(result.memberId,/^MEM-/);assert.equal(calls.length,2);
 assert.equal(calls[0].doc.memberId,calls[1].doc.memberId);
 assert.equal(calls[0].doc.biometricConsent.granted,true);
 assert.equal(calls[0].doc.fullName,'Test Member');
 assert.equal(calls[0].doc.firstName,'Test');
 assert.equal(calls[0].doc.middleName,null);
 assert.equal(calls[0].doc.lastName,'Member');
 assert.equal(calls[0].doc.birthdate,'2000-01-01');
 assert.match(calls[1].doc.facialEncoding,/^enc:v1:/);
 await assert.rejects(registerMemberWithFace(connection,input,{key,validateLocation:async()=>true}),
  e=>e.code==='DUPLICATE_BIOMETRIC');
 assert.equal(calls.length,2);
 assert.equal(owner,null);
 console.log('PASS: Transactional biometric enrollment, PSGC restrictions and duplicate-face protection');
}
main().catch(e=>{console.error(e);process.exitCode=1});
