'use strict';
// Atomic biometric enrollment with a MongoDB-wide short-lived enrollment lease.
// Lock serializes face comparison across instances; no biometric plaintext stored.
const crypto=require('node:crypto');
const {validateMember}=require('./members');
const {encryptDescriptor,decryptDescriptor}=require('./biometrics');
const {validDescriptor}=require('./face-matching');
function enrollmentError(code){return Object.assign(new Error(code),{code})}
async function registerMemberWithFace(connection,input,{key,validateLocation,now=new Date()}={}){
 if(!connection?.client||!connection?.db||typeof validateLocation!=='function')
  throw new TypeError('Missing MongoDB session or trusted geography validator');
 const member=validateMember(input);
 if(!await validateLocation(member.location))throw new TypeError('Geographic codes are not verified as Guimba');
 const encrypted=encryptDescriptor(input.descriptor,key),db=connection.db;
 const memberId='MEM-'+crypto.randomUUID(),biometricId='BIO-'+crypto.randomUUID();
 const lockId='member-biometric-enrollment',owner=crypto.randomUUID();
 let locked=false;
 try{
  try{
   const claim=await db.collection('enrollmentLocks').findOneAndUpdate(
    {_id:lockId,expiresAt:{$lte:new Date()}},
    {$set:{owner,expiresAt:new Date(Date.now()+120000)}},
    {upsert:true,returnDocument:'after'});
   if(claim?.owner!==owner)throw enrollmentError('ENROLLMENT_BUSY');
   locked=true;
  }catch(e){if(e.code===11000||e.code==='ENROLLMENT_BUSY')throw enrollmentError('ENROLLMENT_BUSY');throw e}
  // Compare against all stored identities, including deactivated ones.
  // Corrupt biometric data blocks enrollment instead of allowing a duplicate.
  const registered=await db.collection('biometricRegistrations').find(
   {facialEncoding:{$exists:true}},{projection:{_id:0,facialEncoding:1}}).toArray();
  for(const item of registered){
   let other;
   try{other=decryptDescriptor(item.facialEncoding,key)}
   catch(_){throw enrollmentError('UNREADABLE_BIOMETRIC')}
   if(!validDescriptor(other))throw enrollmentError('UNREADABLE_BIOMETRIC');
   let sq=0;
   for(let i=0;i<128;i++)sq+=(other[i]-input.descriptor[i])**2;
   if(Math.sqrt(sq)<0.42)throw enrollmentError('DUPLICATE_BIOMETRIC');
  }
  const session=connection.client.startSession();
  try{
   await session.withTransaction(async()=>{
    await db.collection('members').insertOne({memberId,...member,createdAt:now,updatedAt:now},{session});
    await db.collection('biometricRegistrations').insertOne({
     biometricId,memberId,facialEncoding:encrypted,biometricStatus:'Active',createdAt:now,updatedAt:now
    },{session});
   },{writeConcern:{w:'majority'}});
  }finally{await session.endSession()}
  return {memberId};
 }finally{
  if(locked)await db.collection('enrollmentLocks').deleteOne({_id:lockId,owner}).catch(()=>{});
 }
}
module.exports={registerMemberWithFace};
