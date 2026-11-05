'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createCustodianPackage,reconstructElectionPrivateKey}=require('../database/key-custody');
const {entropyToWords,wordsToEntropy}=require('../database/custodian-mnemonic');
const {encryptBallot,decryptBallot}=require('../database/ballot-crypto');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const pkg=createCustodianPackage();
assert.equal(pkg.shares.length,2);
assert.equal(pkg.shareHashes.length,2);
assert.notEqual(pkg.shares[0],pkg.shares[1]);
assert.ok(pkg.shares.every(s=>s.trim().split(' ').length===12),'Each new share is 12 words');
assert.equal(pkg.sealedPrivateKey.version,3);
assert.equal(pkg.sealedPrivateKey.kdf,'hkdf-sha256');
assert.ok(!pkg.publicKeyPem.includes('PRIVATE KEY'));
assert.ok(!JSON.stringify(pkg.sealedPrivateKey).includes('PRIVATE KEY'));
assert.equal(entropyToWords(wordsToEntropy(pkg.shares[0])),pkg.shares[0]);
assert.equal(entropyToWords(wordsToEntropy(pkg.shares[1])),pkg.shares[1]);
const unseal=shares=>reconstructElectionPrivateKey(pkg.publicKeyPem,shares,pkg.shareHashes,pkg.sealedPrivateKey);
const key=unseal(pkg.shares);
const choices={Kagawad:['candidate1'],Kapitan:[]};
const encrypted=encryptBallot(choices,'ELECTION',pkg.publicKeyPem);
assert.deepEqual(decryptBallot(encrypted.ciphertext,'ELECTION',key),choices);
assert.equal(unseal([pkg.shares[1],pkg.shares[0]]),key,'Swapped fields must work');
assert.equal(unseal([pkg.shares[0].toUpperCase(),pkg.shares[1]]),key,'Case-insensitive words');
assert.throws(()=>unseal([pkg.shares[0],pkg.shares[0]]),/Invalid|distinct|repeated/);
assert.throws(()=>unseal([pkg.shares[0].replace(/^\w+/,'notaword'),pkg.shares[1]]),/Invalid/);
assert.throws(()=>reconstructElectionPrivateKey(pkg.publicKeyPem,pkg.shares,pkg.shareHashes),/Invalid legacy share size|Invalid custodian/);
assert.throws(()=>reconstructElectionPrivateKey(pkg.publicKeyPem,pkg.shares,pkg.shareHashes,
 {...pkg.sealedPrivateKey,tag:'AAAAAAAAAAAAAAAAAAAAAA'}),/authenticate|Invalid/);

// Previously issued v2 short tokens still decrypt with the original 32-byte
// XOR wrapping key; do not rekey or invalidate elections already in progress.
const v2Pair=crypto.generateKeyPairSync('rsa',{modulusLength:3072});
const v2Pub=v2Pair.publicKey.export({type:'spki',format:'pem'});
const v2Der=v2Pair.privateKey.export({type:'pkcs8',format:'der'});
const v2Key=crypto.randomBytes(32),v2Pad=crypto.randomBytes(32),v2Other=Buffer.alloc(32);
for(let i=0;i<32;i++)v2Other[i]=v2Key[i]^v2Pad[i];
const v2IV=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',v2Key,v2IV);
c.setAAD(Buffer.from(v2Pub));
const v2Cipher=Buffer.concat([c.update(v2Der),c.final()]);
const v2Envelope={version:2,algorithm:'aes-256-gcm',iv:v2IV.toString('base64url'),
 tag:c.getAuthTag().toString('base64url'),ciphertext:v2Cipher.toString('base64url')};
const fp=digest(v2Pub).slice(0,20);
const v2Shares=['BHW1.'+fp+'.'+v2Pad.toString('base64url'),
 'BHW2.'+fp+'.'+v2Other.toString('base64url')];
const v2Hashes=v2Shares.map(digest);
const v2Recovered=reconstructElectionPrivateKey(v2Pub,[v2Shares[1],v2Shares[0]],
 v2Hashes,v2Envelope);
assert.deepEqual(crypto.createPublicKey(v2Recovered).export({type:'spki',format:'pem'}),v2Pub);
v2Key.fill(0);v2Pad.fill(0);v2Other.fill(0);v2Der.fill(0);

// Original v1 long tokens remain usable even when supplied in reverse order.
const oldPair=crypto.generateKeyPairSync('rsa',{modulusLength:3072});
const oldPublic=oldPair.publicKey.export({type:'spki',format:'pem'});
const oldDer=oldPair.privateKey.export({type:'pkcs8',format:'der'});
const oldPad=crypto.randomBytes(oldDer.length),oldXor=Buffer.alloc(oldDer.length);
for(let i=0;i<oldXor.length;i++)oldXor[i]=oldDer[i]^oldPad[i];
const oldFingerprint=digest(oldPublic).slice(0,20);
const oldShares=['BHW1.'+oldFingerprint+'.'+oldPad.toString('base64url'),
 'BHW2.'+oldFingerprint+'.'+oldXor.toString('base64url')];
const oldRecovered=reconstructElectionPrivateKey(oldPublic,[oldShares[1],oldShares[0]],
 oldShares.map(digest));
assert.deepEqual(crypto.createPublicKey(oldRecovered).export({type:'spki',format:'pem'}),oldPublic);
oldDer.fill(0);oldPad.fill(0);oldXor.fill(0);
console.log('PASS: 12-word two-custodian shares, either order, tamper rejection and v1/v2 backwards compatibility');
