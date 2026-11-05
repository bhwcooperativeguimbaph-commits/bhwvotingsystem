'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createCustodianPackage,reconstructElectionPrivateKey}=require('../database/key-custody');
const {encryptBallot,decryptBallot}=require('../database/ballot-crypto');
const pkg=createCustodianPackage();
assert.equal(pkg.shares.length,2);
assert.equal(pkg.shareHashes.length,2);
assert.notEqual(pkg.shares[0],pkg.shares[1]);
assert.ok(pkg.shares.every(s=>s.length<90),'Each new share must be short enough to type/copy');
assert.equal(pkg.sealedPrivateKey.version,2);
assert.ok(!pkg.publicKeyPem.includes('PRIVATE KEY'));
assert.ok(!JSON.stringify(pkg.sealedPrivateKey).includes('PRIVATE KEY'));
const key=reconstructElectionPrivateKey(pkg.publicKeyPem,pkg.shares,pkg.shareHashes,pkg.sealedPrivateKey);
const choices={Kagawad:['candidate1'],Kapitan:[]};
const encrypted=encryptBallot(choices,'ELECTION',pkg.publicKeyPem);
assert.deepEqual(decryptBallot(encrypted.ciphertext,'ELECTION',key),choices);
const unseal=shares=>reconstructElectionPrivateKey(pkg.publicKeyPem,shares,pkg.shareHashes,pkg.sealedPrivateKey);
assert.throws(()=>unseal([pkg.shares[1],pkg.shares[0]]),/Invalid/);
assert.throws(()=>unseal([pkg.shares[0],pkg.shares[0]]),/Invalid/);
const changed=pkg.shares[0].slice(0,-1)+(pkg.shares[0].endsWith('a')?'b':'a');
assert.throws(()=>unseal([changed,pkg.shares[1]]),/Invalid/);
assert.throws(()=>reconstructElectionPrivateKey(pkg.publicKeyPem,pkg.shares,pkg.shareHashes),/Invalid legacy share size/);
assert.throws(()=>unseal([pkg.shares[0],pkg.shares[1]].reverse()),/Invalid/);
assert.throws(()=>reconstructElectionPrivateKey(pkg.publicKeyPem,pkg.shares,pkg.shareHashes,
 {...pkg.sealedPrivateKey,tag:'AAAAAAAAAAAAAAAAAAAAAA'}),/Unsupported state or unable to authenticate data|authenticate|Invalid/);
// Existing elections use long v1 shares. Their stored hash/fingerprint format
// must still reconstruct the pre-existing RSA key without re-provisioning.
const oldPair=crypto.generateKeyPairSync('rsa',{modulusLength:3072});
const oldPublic=oldPair.publicKey.export({type:'spki',format:'pem'});
const oldDer=oldPair.privateKey.export({type:'pkcs8',format:'der'});
const oldPad=crypto.randomBytes(oldDer.length),oldXor=Buffer.alloc(oldDer.length);
for(let i=0;i<oldXor.length;i++)oldXor[i]=oldDer[i]^oldPad[i];
const oldFingerprint=crypto.createHash('sha256').update(oldPublic).digest('hex').slice(0,20);
const oldShares=['BHW1.'+oldFingerprint+'.'+oldPad.toString('base64url'),
                 'BHW2.'+oldFingerprint+'.'+oldXor.toString('base64url')];
const hashes=oldShares.map(s=>crypto.createHash('sha256').update(s).digest('hex'));
const oldRecovered=reconstructElectionPrivateKey(oldPublic,oldShares,hashes);
assert.deepEqual(crypto.createPublicKey(oldRecovered).export({type:'spki',format:'pem'}),oldPublic);
oldDer.fill(0);oldPad.fill(0);oldXor.fill(0);
console.log('PASS: Short AES-wrapped 2-of-2 shares, tamper detection and legacy long-share compatibility');
