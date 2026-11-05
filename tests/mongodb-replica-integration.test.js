'use strict';
// Integration test on localhost ONLY. Uses synthetic members, in-memory email
// captures, and a disposable MongoDB replica-set database. No Atlas/Render secrets.
const assert=require('node:assert/strict');
const {MongoClient}=require('mongodb');
const {initializeMongoIndexes}=require('../database/mongodb');
const {createElection}=require('../database/elections');
const {provisionElectionKeys}=require('../database/key-provisioning');
const {editCandidate}=require('../database/candidate-maintenance');
const {confirmCustodianShare}=require('../database/custodian-confirmation');
const {castEncryptedVote}=require('../database/vote-service');
const {discloseElectionResults}=require('../database/results-disclosure');
const {listMemberReceipts}=require('../database/member-receipts');
const {getElectionTurnout}=require('../database/turnout');
const {getElectionLifecycle}=require('../database/election-lifecycle');
const {getAdminAnalytics}=require('../database/admin-analytics');
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
  await db.collection('members').insertOne({...syntheticMember});
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
  // Candidate changes and protected audit entries must commit together in a
  // real replica-set transaction, before custodians lock the candidate roster.
  const initialCandidates=await db.collection('candidates').find({electionId,status:'Active'}).toArray();
  const toRename=initialCandidates.find(c=>c.name==='Candidate B');
  const editArgs={electionId,operatorId:'SUPERADMIN',actorRole:'superadmin',now};
  await editCandidate({client,db},{...editArgs,operation:'update',
   candidateId:toRename.candidateId,candidateName:'Candidate B Renamed'});
  const extra=await editCandidate({client,db},{...editArgs,operation:'add',
   position:'Kapitan',candidateName:'Candidate F'});
  assert.match(extra.candidateId,/^CAND-/);
  await editCandidate({client,db},{...editArgs,operation:'remove',
   candidateId:extra.candidateId});
  const edits=await db.collection('auditLogs').find({electionId,action:{$in:[
   'CANDIDATE_ADDED','CANDIDATE_UPDATED','CANDIDATE_REMOVED']}}).toArray();
  assert.deepEqual(edits.map(x=>x.action).sort(),
   ['CANDIDATE_ADDED','CANDIDATE_REMOVED','CANDIDATE_UPDATED']);
  assert.ok(edits.every(x=>x.operatorId==='SUPERADMIN'&&x.actorRole==='superadmin'));
  assert.equal(await db.collection('candidates').countDocuments({electionId,status:'Active'}),5);
  const messages=[];
  await provisionElectionKeys({client,db},{electionId,now,operatorId:'SUPERADMIN',
   emails:['custodian1@example.test','custodian2@example.test'],
   deliver:async mail=>messages.push(mail)});
  assert.equal(messages.length,2);
  const keyAudit=await db.collection('auditLogs').findOne({electionId,action:'KEY_SHARES_ISSUED'});
  assert.equal(keyAudit.operatorId,'SUPERADMIN');
  const configured=await db.collection('elections').findOne({electionId});
  assert.equal(configured.eligibleMembersSnapshot,2);
  assert.equal(configured.keyProvisioningState,'Ready');
  assert.equal(configured.sealedPrivateKey?.version,2);
  await assert.rejects(editCandidate({client,db},{...editArgs,operation:'update',
   candidateId:toRename.candidateId,candidateName:'Change After Keys'}),e=>e.code==='ELECTION_LOCKED');
  assert.equal((await db.collection('candidates').findOne({
   candidateId:toRename.candidateId})).name,'Candidate B Renamed');
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
  // Race two simultaneous requests for another synthetic voter.
  const secondChoices={Kagawad:[cand('Kagawad',1)],Kapitan:[cand('Kapitan',2)]};
  const race=await Promise.allSettled([
   castEncryptedVote({client,db},{memberId:fakeId(2),choices:secondChoices,now:voteTime}),
   castEncryptedVote({client,db},{memberId:fakeId(2),choices:secondChoices,now:voteTime})
  ]);
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1,
   'Concurrent duplicate ballots must produce exactly one accepted submission');
  assert.equal(race.filter(x=>x.status==='rejected').length,1);
  assert.equal(await db.collection('ballots').countDocuments({electionId}),2);
  assert.equal(await db.collection('voterParticipation').countDocuments({electionId}),2);
  const ballot=await db.collection('ballots').findOne({electionId});
  assert.equal('memberId' in ballot,false);
  assert.equal('receiptCode' in ballot,false);
  assert.equal('createdAt' in ballot,false);
  assert.equal(ballot._id,ballot.ballotId);
  const receipts=await listMemberReceipts(db,fakeId(1));
  assert.equal(receipts.length,1);assert.equal(receipts[0].receiptNo,accepted.receiptNo);
  assert.equal((await listMemberReceipts(db,fakeId(2))).length,1);
  const turnout=await getElectionTurnout(db,electionId,voteTime);
  assert.equal(turnout.eligibleMembers,2);
  assert.equal(turnout.ballotsCast,2);
  assert.equal(turnout.turnoutPercent,100);
  const analytics=await getAdminAnalytics(db);
  assert.equal(analytics.ballotsCast,2);
  assert.equal(analytics.turnoutPercent,100);
  assert.equal(analytics.daily.reduce((sum,item)=>sum+item.count,0),2);
  assert.deepEqual(analytics.areas,[],'Small member areas must not be disclosed in analytics');
  // Insert a deliberately orphaned synthetic participation record; final
  // report MUST fail rather than silently publishing mismatched totals.
  const orphanMember=fakeId(99);
  await db.collection('voterParticipation').insertOne({
   electionId,memberId:orphanMember,receiptCode:'BHW-'+'F'.repeat(32),
   status:'Valid',createdAt:voteTime
  });
  await assert.rejects(discloseElectionResults({client,db},{
   electionId,shares:keys,now:new Date(end.getTime()+2000)
  }),e=>e.code==='INTEGRITY_FAILURE');
  assert.equal(await db.collection('finalReports').countDocuments({electionId}),0);
  await db.collection('voterParticipation').deleteOne({electionId,memberId:orphanMember});
  const report=await discloseElectionResults({client,db},{
   electionId,shares:keys,now:new Date(end.getTime()+2000)});
  assert.equal(report.ballotsCast,2);
  assert.equal(report.results.find(x=>x.candidateId===cand('Kagawad',0)).votes,1);
  assert.equal(report.results.find(x=>x.candidateId===cand('Kapitan',0)).votes,1);
  assert.equal(report.results.find(x=>x.candidateId===cand('Kapitan',1)).votes,1);
  assert.equal(report.results.find(x=>x.candidateId===cand('Kagawad',1)).votes,1);
  assert.equal(report.results.find(x=>x.candidateId===cand('Kapitan',2)).votes,1);
  assert.equal((await getElectionLifecycle(db,electionId,new Date(end.getTime()+3000))).phase,'Finalized');
  await assert.rejects(discloseElectionResults({client,db},{
   electionId,shares:keys,now:new Date(end.getTime()+4000)}),e=>e.code==='NOT_DISCLOSABLE');
  assert.equal(await revokeSession(db,login.token),true);
  assert.equal(await authenticateSession(db,login.token,now),null);
  console.log('PASS: Real MongoDB transactions, concurrent one-vote guard, orphan participation rejection, two-share finalization and anonymous aggregate tallies');
 }finally{
  await db.dropDatabase().catch(()=>{});
  await client.close();
 }
}
main().catch(e=>{console.error('INTEGRATION_FAILED:',e.code||e.name,e.message);process.exitCode=1});
