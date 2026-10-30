'use strict';
// Compatible with server.js AES-256-GCM biometric format.
// Never accept plaintext biometric templates for permanent storage.
const crypto=require('node:crypto');
const {validDescriptor}=require('./face-matching');
function keyFromEnv(config=process.env){
 const hex=config.BIOMETRIC_KEY||'';
 if(!/^[a-f0-9]{64}$/i.test(hex))throw new Error('BIOMETRIC_KEY must contain 64 hex characters');
 return Buffer.from(hex,'hex');
}
function encryptDescriptor(descriptor,key){
 if(!validDescriptor(descriptor))throw new TypeError('Invalid 128-dimensional facial descriptor');
 if(!Buffer.isBuffer(key)||key.length!==32)throw new TypeError('Invalid biometric encryption key');
 const iv=crypto.randomBytes(12);
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(descriptor),'utf8'),cipher.final()]);
 return 'enc:v1:'+iv.toString('base64')+':'+cipher.getAuthTag().toString('base64')+':'+encrypted.toString('base64');
}
function decryptDescriptor(value,key){
 if(typeof value!=='string'||!value.startsWith('enc:v1:'))throw new TypeError('Encrypted biometric descriptor required');
 if(!Buffer.isBuffer(key)||key.length!==32)throw new TypeError('Invalid biometric encryption key');
 const parts=value.split(':');
 if(parts.length!==5)throw new Error('Malformed biometric template');
 const iv=Buffer.from(parts[2],'base64'),tag=Buffer.from(parts[3],'base64');
 if(iv.length!==12||tag.length!==16)throw new Error('Malformed biometric template');
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);
 decipher.setAuthTag(tag);
 const plain=Buffer.concat([decipher.update(Buffer.from(parts[4],'base64')),decipher.final()]).toString('utf8');
 const descriptor=JSON.parse(plain);
 if(!validDescriptor(descriptor))throw new Error('Decrypted biometric descriptor invalid');
 return descriptor;
}
async function enrollMemberBiometric(db,{memberId,descriptor,key,now=new Date()}){
 if(typeof memberId!=='string'||!memberId.trim())throw new TypeError('Member ID required');
 const template=encryptDescriptor(descriptor,key);
 const member=await db.collection('members').findOne({memberId,status:'Active'});
 if(!member)throw new Error('Active member not found');
 const result=await db.collection('biometricRegistrations').updateOne(
  {memberId},{$set:{facialEncoding:template,biometricStatus:'Active',updatedAt:now},$setOnInsert:{biometricId:'BIO-'+crypto.randomUUID(),memberId,createdAt:now}},
  {upsert:true});
 return {enrolled:result.acknowledged===true};
}
module.exports={keyFromEnv,encryptDescriptor,decryptDescriptor,enrollMemberBiometric};
