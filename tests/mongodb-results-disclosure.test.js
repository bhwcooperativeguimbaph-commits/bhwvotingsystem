'use strict';
const assert=require('node:assert/strict');
const {createCustodianPackage}=require('../database/key-custody');
const {encryptBallot}=require('../database/ballot-crypto');
const {discloseElectionResults}=require('../database/results-disclosure');
async function run(){
 const electionId='ELEC-00000000-0000-4000-8000-000000000001',pkg=createCustodianPackage();
 const election={electionId,status:'Active',keyProvisioningState:'Ready',keyDeliveryConfirmed:true,ballotPublicKeyPem:pkg.publicKeyPem};
 const candidates=[
  {candidateId:'c1',name:'One',position:'Kagawad',maxVotes:1,status:'Active'},
  {candidateId:'c2',name:'Two',position:'Kagawad',maxVotes:1,status:'Active'},
  {candidateId:'c3',name:'Three',position:'Kapitan',maxVotes:2,status:'Active'}];
 const envelopes=[
  encryptBallot({Kagawad:['c1'],Kapitan:['c3']},electionId,pkg.publicKeyPem),
  encryptBallot({Kagawad:['c2'],Kapitan:[]},electionId,pkg.publicKeyPem)];
 const ballots=envelopes.map(e=>({encryptedVote:e.ciphertext,voteHash:e.voteHash}));
 let acceptedParticipants=2;
 const saved=[];
 const session={withTransaction:async fn=>fn(),endSession:async()=>{}};
 const connection={client:{startSession:()=>session},db:{collection:name=>{
  if(name==='elections')return {findOne:async()=>election,updateOne:async()=>({modifiedCount:1})};
  if(name==='keyCustodians')return {find:()=>({toArray:async()=>[
   {shareIndex:1,shareHash:pkg.shareHashes[0]},{shareIndex:2,shareHash:pkg.shareHashes[1]}]})};
  if(name==='candidates')return {find:()=>({toArray:async()=>candidates})};
  if(name==='ballots')return {find:()=>({toArray:async()=>ballots})};
  if(name==='voterParticipation')return {countDocuments:async()=>acceptedParticipants};
  if(name==='finalReports')return {insertOne:async doc=>saved.push(doc)};
  if(name==='resultAnnouncements')return {insertOne:async(doc,opts)=>{
   assert.equal(doc.type,'RESULTS_PUBLISHED');assert.match(doc.notificationId,/^NOTICE-/);
   assert.ok(opts?.session);assert.ok(!JSON.stringify(doc).includes('BHW1.'));
  }};
  if(name==='auditLogs')return {insertOne:async(doc,opts)=>{assert.equal(doc.action,'RESULTS_FINALIZED');assert.ok(opts?.session)}};
  throw Error(name);
 }}};
 const now=new Date('2027-02-01T00:00:00Z');
 const report=await discloseElectionResults(connection,{electionId,shares:pkg.shares,now});
 assert.equal(report.ballotsCast,2);
 assert.equal(report.results.find(x=>x.candidateId==='c1').votes,1);
 assert.equal(report.results.find(x=>x.candidateId==='c2').votes,1);
 assert.equal(report.results.find(x=>x.candidateId==='c3').votes,1);
 assert.equal(saved.length,1);
 assert.ok(!JSON.stringify(saved[0]).includes('encryptedVote'));
 await assert.rejects(discloseElectionResults(connection,{electionId,shares:[pkg.shares[0],pkg.shares[0]],now}),e=>e.code==='INVALID_SHARES');
 acceptedParticipants=1;
 await assert.rejects(discloseElectionResults(connection,{electionId,shares:pkg.shares,now}),
  e=>e.code==='INTEGRITY_FAILURE');
 assert.equal(saved.length,1,'Mismatched counts must not produce a final report');
 acceptedParticipants=2;
 ballots[0].voteHash='0'.repeat(64);
 await assert.rejects(discloseElectionResults(connection,{electionId,shares:pkg.shares,now}),e=>e.code==='INTEGRITY_FAILURE');
 console.log('PASS: post-election custodian-authorized, tamper-safe aggregate disclosure');
}
run().catch(e=>{console.error(e);process.exitCode=1});
