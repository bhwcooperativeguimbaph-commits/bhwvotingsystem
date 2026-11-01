'use strict';
// Confidential ballots: envelope encryption using the election RSA public key.
// Never log ballot plaintext, AES keys, encrypted envelopes or private keys.
const crypto=require('node:crypto');

function encryptBallot(choices,electionId,publicKeyPem){
 if(typeof electionId!=='string'||!electionId||typeof publicKeyPem!=='string')throw new TypeError('Missing election encryption configuration');
 const key=crypto.createPublicKey(publicKeyPem);
 if(key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength||0)<3072)
  throw new TypeError('Election ballot key must be RSA 3072 bits or stronger');
 const aes=crypto.randomBytes(32),iv=crypto.randomBytes(12);
 try{
  const cipher=crypto.createCipheriv('aes-256-gcm',aes,iv);
  cipher.setAAD(Buffer.from('BHW-BALLOT-v1:'+electionId));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(choices),'utf8'),cipher.final()]);
  const wrappedKey=crypto.publicEncrypt({key,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},aes);
  const serialized=JSON.stringify({version:1,scheme:'RSA-OAEP-SHA256+AES-256-GCM',
   iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),
   key:wrappedKey.toString('base64'),data:ciphertext.toString('base64')});
  return {ciphertext:serialized,voteHash:crypto.createHash('sha256').update(serialized).digest('hex')};
 }finally{aes.fill(0)}
}
function decryptBallot(envelope,electionId,privateKeyPem){
 const obj=JSON.parse(envelope);
 if(!obj||obj.version!==1||obj.scheme!=='RSA-OAEP-SHA256+AES-256-GCM')
  throw new Error('Unsupported encrypted ballot');
 const aes=crypto.privateDecrypt({key:privateKeyPem,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(obj.key,'base64'));
 try{
  const decipher=crypto.createDecipheriv('aes-256-gcm',aes,Buffer.from(obj.iv,'base64'));
  decipher.setAAD(Buffer.from('BHW-BALLOT-v1:'+electionId));
  decipher.setAuthTag(Buffer.from(obj.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(obj.data,'base64')),decipher.final()]).toString('utf8'));
 }finally{aes.fill(0)}
}
module.exports={encryptBallot,decryptBallot};
