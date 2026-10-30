'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {keyFromEnv,encryptDescriptor,decryptDescriptor,enrollMemberBiometric}=require('../database/biometrics');
async function main(){
 const key=crypto.randomBytes(32),descriptor=Array.from({length:128},(_,i)=>i/1000);
 assert.equal(keyFromEnv({BIOMETRIC_KEY:key.toString('hex')}).length,32);
 const encoded=encryptDescriptor(descriptor,key);
 assert.ok(encoded.startsWith('enc:v1:'));
 assert.deepEqual(decryptDescriptor(encoded,key),descriptor);
 assert.throws(()=>decryptDescriptor(encoded,crypto.randomBytes(32)));
 assert.throws(()=>encryptDescriptor([1,2,3],key));
 let saved;
 const db={collection(name){
  if(name==='members')return {findOne:async query=>query.memberId==='M1'?{memberId:'M1'}:null};
  if(name==='biometricRegistrations')return {updateOne:async(query,update,options)=>{
   assert.deepEqual(query,{memberId:'M1'});
   assert.equal(options.upsert,true);
   assert.ok(update.$set.facialEncoding.startsWith('enc:v1:'));
   saved=update.$set;return {acknowledged:true};
  }};
 }};
 assert.deepEqual(await enrollMemberBiometric(db,{memberId:'M1',descriptor,key}),{enrolled:true});
 assert.deepEqual(decryptDescriptor(saved.facialEncoding,key),descriptor);
 await assert.rejects(enrollMemberBiometric(db,{memberId:'M2',descriptor,key}),/Active member not found/);
 console.log('PASS: MongoDB encrypted biometric enrollment and compatibility tests');
}
main().catch(e=>{console.error(e);process.exitCode=1});
