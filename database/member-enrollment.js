'use strict';
// Atomic member + encrypted face enrollment for authenticated administrators.
// PSGC codes must be matched against trusted reference data before calling.
const crypto=require('node:crypto');
const {validateMember}=require('./members');
const {encryptDescriptor}=require('./biometrics');
async function registerMemberWithFace(connection,input,{key,validateLocation,now=new Date()}={}){
 if(!connection?.client||!connection?.db||typeof validateLocation!=='function')throw new TypeError('Missing MongoDB session or trusted geography validator');
 const member=validateMember(input);
 if(!await validateLocation(member.location))throw new TypeError('Geographic codes are not verified as Guimba');
 const encrypted=encryptDescriptor(input.descriptor,key);
 const memberId='MEM-'+crypto.randomUUID(),biometricId='BIO-'+crypto.randomUUID();
 const session=connection.client.startSession();
 try{
  await session.withTransaction(async()=>{
   await connection.db.collection('members').insertOne({memberId,...member,createdAt:now,updatedAt:now},{session});
   await connection.db.collection('biometricRegistrations').insertOne({
    biometricId,memberId,facialEncoding:encrypted,biometricStatus:'Active',createdAt:now,updatedAt:now
   },{session});
  },{writeConcern:{w:'majority'}});
  return {memberId};
 }finally{await session.endSession()}
}
module.exports={registerMemberWithFace};
