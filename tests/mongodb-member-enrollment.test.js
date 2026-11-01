'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {registerMemberWithFace}=require('../database/member-enrollment');
async function main(){
 const calls=[];
 const session={withTransaction:async fn=>fn(),endSession:async()=>{}};
 const connection={client:{startSession:()=>session},db:{collection:name=>({
  insertOne:async (doc,opts)=>{assert.equal(opts.session,session);calls.push({name,doc})}
 })}};
 const input={fullName:'Test Member',area:'Area 1',location:{
  country:'Philippines',province:'Nueva Ecija',city:'Guimba',
  regionCode:'03',provinceCode:'0349',cityCode:'034913',barangayCode:'034913001'
 },descriptor:Array(128).fill(.01)};
 const key=crypto.randomBytes(32);
 await assert.rejects(registerMemberWithFace(connection,input,{key,validateLocation:async()=>false}),/Geographic/);
 assert.equal(calls.length,0);
 const result=await registerMemberWithFace(connection,input,{key,validateLocation:async()=>true});
 assert.match(result.memberId,/^MEM-/);assert.equal(calls.length,2);
 assert.equal(calls[0].doc.memberId,calls[1].doc.memberId);
 assert.match(calls[1].doc.facialEncoding,/^enc:v1:/);
 assert.equal(JSON.stringify(calls).includes('0.01,0.01'),false);
 console.log('PASS: Transactional member enrollment tests');
}
main().catch(e=>{console.error(e);process.exitCode=1});
