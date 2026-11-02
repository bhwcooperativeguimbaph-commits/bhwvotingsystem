'use strict';
const crypto=require('node:crypto');
const {encryptDescriptor,decryptDescriptor}=require('./biometrics');
const {validDescriptor}=require('./face-matching');
const error=code=>Object.assign(new Error(code),{code});
// Sensitive identity re-enrollment may only happen before an electorate freeze.
async function updateMemberBiometrics(connection,{memberId,descriptor,reason,operatorId,key,now=new Date()}){
 if(!connection?.db||!connection?.client)throw new TypeError('MongoDB transaction connection required');
 if(typeof memberId!=='string'||!/^MEM-[0-9a-f-]{36}$/i.test(memberId)||
    !validDescriptor(descriptor))throw error('INVALID_BIOMETRIC');
 const normalized=typeof reason==='string'?reason.trim().replace(/\s+/g,' '):'';
 if(normalized.length<12||normalized.length>500)throw error('REASON_REQUIRED');
 if(typeof operatorId!=='string'||!operatorId)throw error('NOT_AUTHORIZED');
 const db=connection.db,lockId='member-biometric-enrollment',owner=crypto.randomUUID();
 const frozen=await db.collection('elections').findOne({
  status:'Active',eligibilityFrozenAt:{$exists:true},endTime:{$gt:now}
 },{projection:{_id:1}});
 if(frozen)throw error('ELECTORATE_FROZEN');
 const member=await db.collection('members').findOne({memberId,status:'Active'});
 if(!member)throw error('MEMBER_NOT_FOUND');
 const encrypted=encryptDescriptor(descriptor,key);
 let locked=false;
 try{
  try{
   const claim=await db.collection('enrollmentLocks').findOneAndUpdate(
    {_id:lockId,expiresAt:{$lte:new Date()}},
    {$set:{owner,expiresAt:new Date(Date.now()+120000)}},
    {upsert:true,returnDocument:'after'});
   if(claim?.owner!==owner)throw error('ENROLLMENT_BUSY');
   locked=true;
  }catch(e){if(e.code===11000||e.code==='ENROLLMENT_BUSY')throw error('ENROLLMENT_BUSY');throw e}
  const records=await db.collection('biometricRegistrations').find(
   {memberId:{$ne:memberId},facialEncoding:{$exists:true}},
   {projection:{_id:0,facialEncoding:1}}).toArray();
  for(const record of records){
   let other;
   try{other=decryptDescriptor(record.facialEncoding,key)}
   catch(_){throw error('UNREADABLE_BIOMETRIC')}
   if(!validDescriptor(other))throw error('UNREADABLE_BIOMETRIC');
   let sq=0;
   for(let i=0;i<128;i++)sq+=(descriptor[i]-other[i])**2;
   if(Math.sqrt(sq)<0.42)throw error('DUPLICATE_BIOMETRIC');
  }
  const session=connection.client.startSession();
  try{
   await session.withTransaction(async()=>{
    const existing=await db.collection('biometricRegistrations').findOne({
     memberId,biometricStatus:'Active'},{session,projection:{_id:1}});
    if(!existing)throw error('MEMBER_NOT_FOUND');
    const changed=await db.collection('biometricRegistrations').updateOne({
     memberId,biometricStatus:'Active'},{$set:{facialEncoding:encrypted,updatedAt:now,
      replacedAt:now,replacedBy:operatorId}},{session});
    if(changed.matchedCount!==1)throw error('MEMBER_NOT_FOUND');
    await db.collection('auditLogs').insertOne({
     eventId:'AUD-'+crypto.randomUUID(),action:'MEMBER_BIOMETRICS_UPDATED',
     actorRole:'staff',operatorId,memberId,reason:normalized,createdAt:now
    },{session});
    await db.collection('authSessions').deleteMany({accountId:memberId},{session});
   },{writeConcern:{w:'majority'}});
  }finally{await session.endSession()}
  return {updated:true};
 }finally{
  if(locked)await db.collection('enrollmentLocks').deleteOne({_id:lockId,owner}).catch(()=>{});
 }
}
module.exports={updateMemberBiometrics};
