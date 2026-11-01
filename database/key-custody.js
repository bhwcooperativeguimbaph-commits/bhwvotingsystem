'use strict';
// Two-of-two custody for election RSA private keys. Only the public key
// and SHA-256 hashes of the individual emailed shares belong in MongoDB.
const crypto=require('node:crypto');
function digest(s){return crypto.createHash('sha256').update(s).digest('hex')}
function createCustodianPackage(){
 const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:3072});
 const publicKeyPem=publicKey.export({type:'spki',format:'pem'});
 const privateDer=privateKey.export({type:'pkcs8',format:'der'});
 const random=crypto.randomBytes(privateDer.length);
 const second=Buffer.alloc(privateDer.length);
 try{
  for(let i=0;i<privateDer.length;i++)second[i]=privateDer[i]^random[i];
  const fingerprint=digest(publicKeyPem).slice(0,20);
  const share1='BHW1.'+fingerprint+'.'+random.toString('base64url');
  const share2='BHW2.'+fingerprint+'.'+second.toString('base64url');
  return {publicKeyPem,fingerprint,shares:[share1,share2],shareHashes:[digest(share1),digest(share2)]};
 }finally{privateDer.fill(0);random.fill(0);second.fill(0)}
}
function reconstructElectionPrivateKey(publicKeyPem,shares,expectedHashes){
 if(typeof publicKeyPem!=='string'||!Array.isArray(shares)||shares.length!==2||
    !Array.isArray(expectedHashes)||expectedHashes.length!==2)throw new TypeError('Two custodian shares required');
 const fingerprint=digest(publicKeyPem).slice(0,20);
 const decoded=[];
 for(let i=0;i<2;i++){
  const token=shares[i],prefix='BHW'+(i+1)+'.'+fingerprint+'.';
  if(typeof token!=='string'||!token.startsWith(prefix)||
    !/^[A-Za-z0-9_-]+$/.test(token.slice(prefix.length))||
    digest(token)!==expectedHashes[i])throw new Error('Invalid custodian share');
  decoded.push(Buffer.from(token.slice(prefix.length),'base64url'));
 }
 if(decoded[0].length!==decoded[1].length||decoded[0].length<1000)throw new Error('Invalid custodian share size');
 const der=Buffer.alloc(decoded[0].length);
 try{
  for(let i=0;i<der.length;i++)der[i]=decoded[0][i]^decoded[1][i];
  const key=crypto.createPrivateKey({key:der,format:'der',type:'pkcs8'});
  const pem=key.export({type:'pkcs8',format:'pem'});
  const derived=crypto.createPublicKey(key).export({type:'spki',format:'pem'});
  if(derived!==publicKeyPem)throw new Error('Custodian shares do not match election public key');
  return pem;
 }finally{der.fill(0);for(const part of decoded)part.fill(0)}
}
module.exports={createCustodianPackage,reconstructElectionPrivateKey};
