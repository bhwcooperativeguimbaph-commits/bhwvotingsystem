'use strict';
// Integration test on localhost ONLY. Uses synthetic members, in-memory email
// captures, and a disposable MongoDB replica-set database. No Atlas/Render secrets.
const assert=require('node:assert/strict');
const {MongoClient}=require('mongodb');
const {initializeMongoIndexes}=require('../database/mongodb');
const {createElection}=require('../database/elections');
const {provisionElectionKeys}=require('../database/key-provisioning');
const {confirmCustodianShare}=require('../database/custodian-confirmation');
const {castEncryptedVote}=require('../database/vote-service');
const {discloseElectionResults}=require('../database/results-disclosure');
const {listMemberReceipts}=require('../database/member-receipts');
const {getElectionTurnout}=require('../database/turnout');
const {getElectionLifecycle}=require('../database/election-lifecycle');
const {issueSession,authenticateSession,revokeSession}=require('../database/sessions');
const localUri='mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true';
const dbName='BHWVotingDB_Integration';
const fakeId=n=>'MEM-00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function main(){
 const client=new MongoClient(localUri,{serverSelectionTimeoutMS:15000});
 await client.connect();
 const db=client.db(dbName);
 try{
  await db.dropDatabase();
  await initializeMongoIndexes(db);
  const now=new Date();
  const initial=new Date(now.getTime()-600000);
  const start=new Date(now.getTime()+120000);
  const end=new Date(now.getTime()+240000);
  const candidates={
   kagawad:['Candidate A','Candidate B'],
   kapitan:['Candidate C','Candidate D','Candidate E']
  };
  const syntheticMember={memberId:fakeId(1),firstName:'Synthetic',lastName:'Person',
   fullName:'Synthetic Person',status:'Active',createdAt:initial};
  await db.collection('members').insertOne(syntheticMember);
  await db.collection('members').insertOne({...syntheticMember,memberId:fakeId(2),fullName:'Other Synthetic'});
  const login=await issueSession(db,{accountId:fakeId(1),role:'member',now});
  assert.equal((await authenticateSession(db,login.token,now)).accountId,fakeId(1));
  const {electionId}=await createElection({client,db},{
   title:'Offline Synthetic Election',startTime:start.toISOString(),endTime:end.toISOString(),
   config:[
    {title:'Kagawad',maxVotes:1,candidates:candidates.kagawad.map(name=>({name}))},
    {title:'Kapitan',maxVotes:2,candidates:candidates.kapitan.map(name=>({name}))}
   ]
  },{now});
  const messages=[];
  await provisionElectionKeys({client,db},{electionId,now,
   emails:['custodian1@example.test','custodian2@example.test'],
   deliver:async mail=>messages.push(mail)});
  assert.equal(messages.length,2);
  const configured=await db.collection('elections').findOne({electionId});
  assert.equal(configured.eligibleMembersSnapshot,2);
  assert.equal(configured.keyProvisioningState,'Ready');
  const keys=messages.map((m,i)=>{
   const match=m.text.match(new RegExp('BHW'+(i+1)+'\\.[a-f0-9]{20}\\.[A-Za-z0-9_-]+'));
   assert.ok(match,'Missing mock custodian share');
   return match[0];
  });
  assert.equal(await confirmCustodianShare(db,{electionId,shareIndex:1,share:keys[0]}),true);
  assert.equal(await confirmCustodianShare(db,{electionId,shareIndex:2,share:keys[1]}),true);
  const ready=await getElectionLifecycle(db,electionId,now);
  assert.equal(ready.phase,'Ready');
  const docs=await db.collection('candidates').find({electionId,status:'Active'}).toArray();
  const cand=(position,i)=>docs.filter(c=>c.position===position)[i].candidateId;
  const choices={Kagawad:[cand('Kagawad',0)],
   Kapitan:[cand('Kapitan',0),cand('Kapitan',1)]};
  const voteTime=new Date(start.getTime()+1000);
  const accepted=await castEncryptedVote({client,db},{memberId:fakeId(1),choices,now:voteTime});
  assert.match(accepted.receiptNo,/^BHW-[A-F0-9]{32}$/);
  await assert.rejects(castEncryptedVote({client,db},{memberId:fakeId(1),choices,now:voteTime}),
    e=>e.code==='DUPLICATE_BALLOT');
  assert.equal(await db.collection('ballots').countDocuments({electionId}),1);
  assert.equal(await db.collection('voterParticipation').countDocuments({electionId}),1);
  const ballot=await db.collection('ballots').findOne({electionId});
  assert.equal('memberId' in ballot,false);
  assert.equal('receiptCode' in ballot,false);
  assert.equal('createdAt' in ballot,false);
  assert.equal(ballot._id,ballot.ballotId);
  const receipts=await listMemberReceipts(db,fakeId(1));
  assert.equal(receipts.length,1);assert.equal(receipts[0].receiptNo,accepted.receiptNo);
  assert.equal((await listMemberReceipts(db,fakeId(2))).length,0);
  const turnout=await getElectionTurnout(db,electionId,voteTime);
  assert.equal(turnout.eligibleMembers,2);
  assert.equal(turnout.ballotsCast,1);
  assert.equal(turnout.turnoutPercent,50);
  const report=await discloseElectionResults({client,db},{
   electionId,shares:keys,now:new Date(end.getTime()+2000)});
  assert.equal(report.ballotsCast,1);
  assert.equal(report.results.find(x=>x.candidateId===cand('Kagawad',0)).votes,1);
  assert.equal(report.results.find(x=>x.candidateId===cand('Kapitan',0)).votes,1);
  assert.equal(report.results.find(x=>x.candidateId===cand('Kapitan',1)).votes,1);
  assert.equal((await getElectionLifecycle(db,electionId,new Date(end.getTime()+3000))).phase,'Finalized');
  await assert.rejects(discloseElectionResults({client,db},{
   electionId,shares:keys,now:new Date(end.getTime()+4000)}),e=>e.code==='NOT_DISCLOSABLE');
  assert.equal(await revokeSession(db,login.token),true);
  assert.equal(await authenticateSession(db,login.token,now),null);
  console.log('PASS: Real MongoDB replica-set transactions, isolated voter, key custody, encrypted ballot, unique receipt, duplicate rejection, final aggregate report');
 }finally{
  await db.dropDatabase().catch(()=>{});
  await client.close();
 }
}
main().catch(e=>{console.error('INTEGRATION_FAILED:',e.code||e.name,e.message);process.exitCode=1});
