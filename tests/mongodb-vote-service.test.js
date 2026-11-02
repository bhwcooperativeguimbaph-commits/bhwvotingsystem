'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {encryptBallot,decryptBallot}=require('../database/ballot-crypto');
const {castEncryptedVote}=require('../database/vote-service');
async function main(){
 const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:3072,
  publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 const choices={Kagawad:['c1'],Kapitan:['c2','c3']};
 const e=encryptBallot(choices,'E1',publicKey);
 assert.deepEqual(decryptBallot(e.ciphertext,'E1',privateKey),choices);
 assert.throws(()=>decryptBallot(e.ciphertext,'E2',privateKey));
 assert.equal(e.voteHash,crypto.createHash('sha256').update(e.ciphertext).digest('hex'));
 let member={memberId:'M1',createdAt:new Date('2026-12-01T00:00:00Z')},election={electionId:'E1',ballotPublicKeyPem:publicKey,keyDeliveryConfirmed:true,keyProvisioningState:'Ready',eligibilityFrozenAt:new Date('2027-01-01T00:00:00Z'),eligibleMembersSnapshot:3},voteCount=0,receiptCount=0;
 const candidates=[
  {candidateId:'c1',position:'Kagawad',maxVotes:1,status:'Active'},
  {candidateId:'c2',position:'Kapitan',maxVotes:2,status:'Active'},
  {candidateId:'c3',position:'Kapitan',maxVotes:2,status:'Active'}];
 let savedVote;
 const session={endSession:async()=>{},withTransaction:async fn=>fn()};
 const db={collection:name=>{
  if(name==='members')return {findOne:async q=>member&&member.memberId===q.memberId&&member.createdAt<=q.createdAt.$lte?member:null};
  if(name==='elections')return {findOne:async()=>election};
  if(name==='candidates')return {find:()=>({toArray:async()=>candidates})};
  if(name==='voterParticipation')return {insertOne:async(doc,opt)=>{
   assert.equal(opt.session,session);assert.equal(doc.memberId,'M1');
   assert.equal('ballotId' in doc,false);
   if(voteCount)throw Object.assign(new Error('duplicate'),{code:11000});
  }};
  if(name==='ballots')return {insertOne:async(doc,opt)=>{
   assert.equal(opt.session,session);
   savedVote=doc;voteCount++;
  }};
  if(name==='receiptCodes')return {insertOne:async(doc,opt)=>{
   assert.equal(opt.session,session);
   assert.equal(doc.memberId,'M1');
   assert.equal('ballotId' in doc,false);
   assert.equal(doc.receiptCode.startsWith('BHW-'),true);receiptCount++;
  }};
  if(name==='auditLogs')return {insertOne:async(doc,opt)=>{
   assert.equal(opt.session,session);assert.equal(doc.action,'BALLOT_CAST');
   assert.equal('memberId' in doc,false);
  }};
  if(name==='memberInbox')return {insertOne:async(doc,opt)=>{
   assert.equal(opt.session,session);assert.equal(doc.memberId,'M1');
   assert.equal(doc.receiptCode.startsWith('BHW-'),true);
   assert.equal(doc.message,'Your ballot was securely recorded.');
  }};
  throw Error(name);
 }};
 const connection={db,client:{startSession:()=>session}};
 const first=await castEncryptedVote(connection,{memberId:'M1',choices});
 assert.match(first.receiptNo,/^BHW-/);
 assert.equal(receiptCount,1);assert.equal(voteCount,1);
 assert.equal('choices' in savedVote,false);
 assert.equal('candidateId' in savedVote,false);
 assert.equal('memberId' in savedVote,false);
 assert.equal('receiptCode' in savedVote,false);
 assert.deepEqual(decryptBallot(savedVote.encryptedVote,'E1',privateKey),choices);
 await assert.rejects(castEncryptedVote(connection,{memberId:'M1',choices}),e=>e.code==='DUPLICATE_BALLOT');
 member={memberId:'M1',createdAt:new Date('2027-01-02T00:00:00Z')};
 await assert.rejects(castEncryptedVote(connection,{memberId:'M1',choices}),e=>e.code==='NOT_AUTHORIZED');
 member={memberId:'M1',createdAt:new Date('2026-12-01T00:00:00Z')};
 await assert.rejects(castEncryptedVote(connection,{memberId:'M1',choices:{Kagawad:['c1','c2'],Kapitan:[]}}),e=>e.code==='INVALID_BALLOT');
 member=null;
 await assert.rejects(castEncryptedVote(connection,{memberId:'M1',choices}),e=>e.code==='NOT_AUTHORIZED');
 member={memberId:'M1',createdAt:new Date('2026-12-01T00:00:00Z')};election=null;
 await assert.rejects(castEncryptedVote(connection,{memberId:'M1',choices}),e=>e.code==='VOTING_CLOSED');
 election={electionId:'E1'};
 await assert.rejects(castEncryptedVote(connection,{memberId:'M1',choices}),e=>e.code==='ENCRYPTION_UNAVAILABLE');
 console.log('PASS: RSA ballot encryption, tamper protection, transactional receipt and duplicate guard');
}
main().catch(e=>{console.error(e);process.exitCode=1});
