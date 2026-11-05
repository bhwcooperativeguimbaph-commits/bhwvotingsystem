'use strict';
// Two independent custodian shares protect each election's private RSA key.
// v2: seal the private DER with a random AES-256-GCM key and split ONLY that
// 32-byte sealing key with XOR (2-of-2). Neither share nor plaintext private
// material is stored in MongoDB. The sealed private key is safe to persist.
// Legacy v1 (long shares splitting DER directly) remains decryptable unchanged.
const crypto=require('node:crypto');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const xor=(a,b)=>{
 if(a.length!==b.length)throw new Error('Invalid custodian share length');
 const out=Buffer.alloc(a.length);
 for(let i=0;i<out.length;i++)out[i]=a[i]^b[i];
 return out;
};
function createCustodianPackage(){
 const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:3072});
 const publicKeyPem=publicKey.export({type:'spki',format:'pem'});
 const privateDer=privateKey.export({type:'pkcs8',format:'der'});
 const sealingKey=crypto.randomBytes(32);
 const random=crypto.randomBytes(32);
 const second=xor(sealingKey,random);
 try{
  const fingerprint=digest(publicKeyPem).slice(0,20);
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',sealingKey,iv);
  cipher.setAAD(Buffer.from(publicKeyPem,'utf8'));
  const ciphertext=Buffer.concat([cipher.update(privateDer),cipher.final()]);
  const sealedPrivateKey={version:2,algorithm:'aes-256-gcm',
   iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),
   ciphertext:ciphertext.toString('base64url')};
  const share1='BHW1.'+fingerprint+'.'+random.toString('base64url');
  const share2='BHW2.'+fingerprint+'.'+second.toString('base64url');
  return {publicKeyPem,fingerprint,sealedPrivateKey,shares:[share1,share2],
   shareHashes:[digest(share1),digest(share2)]};
 }finally{privateDer.fill(0);sealingKey.fill(0);random.fill(0);second.fill(0)}
}
function reconstructElectionPrivateKey(publicKeyPem,shares,expectedHashes,sealedPrivateKey){
 if(typeof publicKeyPem!=='string'||!Array.isArray(shares)||shares.length!==2||
    !Array.isArray(expectedHashes)||expectedHashes.length!==2)
  throw new TypeError('Two custodian shares required');
 const fingerprint=digest(publicKeyPem).slice(0,20),decoded=[];
 let der=null,keyMaterial=null;
 try{
  for(let i=0;i<2;i++){
   const token=shares[i],prefix='BHW'+(i+1)+'.'+fingerprint+'.';
   if(typeof token!=='string'||!token.startsWith(prefix)||
      !/^[A-Za-z0-9_-]+$/.test(token.slice(prefix.length))||
      digest(token)!==expectedHashes[i])throw new Error('Invalid custodian share');
   decoded.push(Buffer.from(token.slice(prefix.length),'base64url'));
  }
  if(decoded[0].length!==decoded[1].length)
   throw new Error('Invalid custodian share size');
  if(sealedPrivateKey!==undefined&&sealedPrivateKey!==null){
   if(sealedPrivateKey.version!==2||sealedPrivateKey.algorithm!=='aes-256-gcm'||
      decoded[0].length!==32)throw new Error('Invalid sealed election key');
   const iv=Buffer.from(sealedPrivateKey.iv||'','base64url');
   const tag=Buffer.from(sealedPrivateKey.tag||'','base64url');
   const payload=Buffer.from(sealedPrivateKey.ciphertext||'','base64url');
   if(iv.length!==12||tag.length!==16||payload.length<1000||payload.length>5000)
    throw new Error('Invalid sealed election key');
   keyMaterial=xor(decoded[0],decoded[1]);
   const decipher=crypto.createDecipheriv('aes-256-gcm',keyMaterial,iv);
   decipher.setAAD(Buffer.from(publicKeyPem,'utf8'));
   decipher.setAuthTag(tag);
   der=Buffer.concat([decipher.update(payload),decipher.final()]);
  }else{
   // Backward-compatible legacy v1: both shares were as long as the private DER.
   if(decoded[0].length<1000)throw new Error('Invalid legacy share size');
   der=xor(decoded[0],decoded[1]);
  }
  const key=crypto.createPrivateKey({key:der,format:'der',type:'pkcs8'});
  const pem=key.export({type:'pkcs8',format:'pem'});
  const derived=crypto.createPublicKey(key).export({type:'spki',format:'pem'});
  if(derived!==publicKeyPem)throw new Error('Custodian shares do not match election public key');
  return pem;
 }finally{
  if(der)der.fill(0);
  if(keyMaterial)keyMaterial.fill(0);
  for(const share of decoded)share.fill(0);
 }
}
module.exports={createCustodianPackage,reconstructElectionPrivateKey};
