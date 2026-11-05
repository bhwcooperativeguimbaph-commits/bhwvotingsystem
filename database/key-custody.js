'use strict';
// v3: independent 12-word BIP39-encoded 128-bit XOR shares. HKDF derives a
// 256-bit wrapping key. Both shares are mandatory to recover the election RSA
// private key, which is never persisted in plaintext. Older v2 short tokens
// and v1 long tokens must remain usable for already provisioned elections.
const crypto=require('node:crypto');
const {entropyToWords,normalizeWords,wordsToEntropy}=require('./custodian-mnemonic');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const xor=(a,b)=>{
 if(a.length!==b.length)throw new Error('Invalid custodian share length');
 const out=Buffer.alloc(a.length);
 for(let i=0;i<out.length;i++)out[i]=a[i]^b[i];
 return out;
};
function deriveKey(material,publicKeyPem){
 const salt=crypto.createHash('sha256').update(publicKeyPem).digest();
 return Buffer.from(crypto.hkdfSync('sha256',material,salt,
  Buffer.from('BHW-2of2-election-wrap-v3','utf8'),32));
}
function createCustodianPackage(){
 const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:3072});
 const publicKeyPem=publicKey.export({type:'spki',format:'pem'});
 const privateDer=privateKey.export({type:'pkcs8',format:'der'});
 const secret=crypto.randomBytes(16),shareA=crypto.randomBytes(16);
 const shareB=xor(secret,shareA);
 let wrapKey=null;
 try{
  const fingerprint=digest(publicKeyPem).slice(0,20);
  wrapKey=deriveKey(secret,publicKeyPem);
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',wrapKey,iv);
  cipher.setAAD(Buffer.from(publicKeyPem,'utf8'));
  const ciphertext=Buffer.concat([cipher.update(privateDer),cipher.final()]);
  const sealedPrivateKey={version:3,algorithm:'aes-256-gcm',
   kdf:'hkdf-sha256',iv:iv.toString('base64url'),
   tag:cipher.getAuthTag().toString('base64url'),
   ciphertext:ciphertext.toString('base64url')};
  const shares=[entropyToWords(shareA),entropyToWords(shareB)];
  return {publicKeyPem,fingerprint,sealedPrivateKey,shares,
   shareHashes:shares.map(digest)};
 }finally{
  privateDer.fill(0);secret.fill(0);shareA.fill(0);shareB.fill(0);
  if(wrapKey)wrapKey.fill(0);
 }
}
function orderCustodianShares(shares,expectedHashes,sealedPrivateKey){
 if(!Array.isArray(shares)||shares.length!==2||!Array.isArray(expectedHashes)||
    expectedHashes.length!==2||shares.some(s=>typeof s!=='string'))
  throw new TypeError('Two custodian shares required');
 const v3=sealedPrivateKey?.version===3;
 const entries=shares.map(s=>v3?normalizeWords(s):s.trim());
 const found=[null,null];
 for(const s of entries){
  const hash=digest(s),index=expectedHashes.indexOf(hash);
  if(index<0||found[index]!==null)throw new Error('Invalid or repeated custodian share');
  found[index]=s;
 }
 if(found.some(x=>x===null))throw new Error('Two distinct custodian shares required');
 return found;
}
function reconstructElectionPrivateKey(publicKeyPem,shares,expectedHashes,sealedPrivateKey){
 if(typeof publicKeyPem!=='string'||!Array.isArray(shares)||shares.length!==2||
    !Array.isArray(expectedHashes)||expectedHashes.length!==2)
  throw new TypeError('Two custodian shares required');
 const fingerprint=digest(publicKeyPem).slice(0,20);
 let der=null,keyMaterial=null,wrapKey=null;
 const decoded=[];
 try{
  const ordered=orderCustodianShares(shares,expectedHashes,sealedPrivateKey);
  if(sealedPrivateKey?.version===3){
   if(sealedPrivateKey.algorithm!=='aes-256-gcm'||sealedPrivateKey.kdf!=='hkdf-sha256')
    throw new Error('Invalid wrapped election key');
   for(const s of ordered)decoded.push(wordsToEntropy(s));
   keyMaterial=xor(decoded[0],decoded[1]);wrapKey=deriveKey(keyMaterial,publicKeyPem);
  }else{
   for(let i=0;i<2;i++){
    const token=ordered[i],prefix='BHW'+(i+1)+'.'+fingerprint+'.';
    if(!token.startsWith(prefix)||!/^[A-Za-z0-9_-]+$/.test(token.slice(prefix.length)))
     throw new Error('Invalid custodian share');
    decoded.push(Buffer.from(token.slice(prefix.length),'base64url'));
   }
   if(decoded[0].length!==decoded[1].length)throw new Error('Invalid custodian share size');
   if(sealedPrivateKey?.version===2){
    if(sealedPrivateKey.algorithm!=='aes-256-gcm'||decoded[0].length!==32)
     throw new Error('Invalid sealed election key');
    keyMaterial=xor(decoded[0],decoded[1]);wrapKey=keyMaterial;
   }else if(sealedPrivateKey==null){
    if(decoded[0].length<1000)throw new Error('Invalid legacy share size');
    der=xor(decoded[0],decoded[1]);
   }else throw new Error('Unsupported election key format');
  }
  if(wrapKey){
   const iv=Buffer.from(sealedPrivateKey.iv||'','base64url');
   const tag=Buffer.from(sealedPrivateKey.tag||'','base64url');
   const payload=Buffer.from(sealedPrivateKey.ciphertext||'','base64url');
   if(iv.length!==12||tag.length!==16||payload.length<1000||payload.length>5000)
    throw new Error('Invalid sealed election key');
   const decipher=crypto.createDecipheriv('aes-256-gcm',wrapKey,iv);
   decipher.setAAD(Buffer.from(publicKeyPem,'utf8'));
   decipher.setAuthTag(tag);
   der=Buffer.concat([decipher.update(payload),decipher.final()]);
  }
  const key=crypto.createPrivateKey({key:der,format:'der',type:'pkcs8'});
  const pem=key.export({type:'pkcs8',format:'pem'});
  const derived=crypto.createPublicKey(key).export({type:'spki',format:'pem'});
  if(derived!==publicKeyPem)throw new Error('Custodian shares do not match election public key');
  return pem;
 }finally{
  if(der)der.fill(0);
  if(keyMaterial)keyMaterial.fill(0);
  if(wrapKey&&wrapKey!==keyMaterial)wrapKey.fill(0);
  for(const s of decoded)s.fill(0);
 }
}
module.exports={createCustodianPackage,orderCustodianShares,reconstructElectionPrivateKey};
