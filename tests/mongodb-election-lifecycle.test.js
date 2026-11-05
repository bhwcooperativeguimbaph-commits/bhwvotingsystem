'use strict';
const assert=require('node:assert/strict');
const {getElectionLifecycle}=require('../database/election-lifecycle');
const electionId='ELEC-00000000-0000-4000-8000-000000000001';
const start=new Date('2027-01-02T12:00:00Z'),end=new Date('2027-01-03T12:00:00Z');
let election={electionId,title:'Synthetic election',startTime:start,endTime:end,status:'Active'};
let confirmations=0,votes=0,candidates=4;
const db={collection(name){
 if(name==='elections')return {findOne:async()=>election};
 if(name==='keyCustodians')return {countDocuments:async()=>confirmations};
 if(name==='voterParticipation')return {countDocuments:async()=>votes};
 if(name==='candidates')return {countDocuments:async()=>candidates};
 throw Error(name)
}};
async function run(){
 await assert.rejects(getElectionLifecycle(db,'invalid',start),/Invalid/);
 let value=await getElectionLifecycle(db,electionId,new Date('2027-01-01'));
 assert.equal(value.phase,'Setup');assert.equal(value.canEditCandidates,true);
 assert.equal(value.canProvision,true);assert.equal(value.keysReady,false);
 election.keyProvisioningState='Initializing';
 value=await getElectionLifecycle(db,electionId,new Date('2027-01-01'));
 assert.equal(value.canEditCandidates,false);
 assert.equal(value.canProvision,false);
 election.keyProvisioningState='Ready';
 election.eligibilityFrozenAt=new Date('2027-01-01');
 election.eligibleMembersSnapshot=15;
 value=await getElectionLifecycle(db,electionId,new Date('2027-01-01'));
 assert.equal(value.phase,'Ready');assert.equal(value.eligibleMembers,15);
 value=await getElectionLifecycle(db,electionId,new Date('2027-01-02T13:00:00Z'));
 assert.equal(value.phase,'Open','Voting is open without custody receipt confirmations');
 confirmations=2;election.keyDeliveryConfirmed=true;
 value=await getElectionLifecycle(db,electionId,new Date('2027-01-01'));
 assert.equal(value.phase,'Ready');assert.equal(value.confirmedCustodians,2);
 value=await getElectionLifecycle(db,electionId,new Date('2027-01-02T13:00:00Z'));
 assert.equal(value.phase,'Open');assert.equal(value.canEditCandidates,false);
 votes=4;
 value=await getElectionLifecycle(db,electionId,new Date('2027-01-04'));
 assert.equal(value.phase,'Closed');assert.equal(value.canFinalize,true);
 assert.equal(value.ballotsCast,4);assert.equal('shareHash' in value,false);
 election.status='Finalized';election.finalizedAt=new Date('2027-01-04');
 value=await getElectionLifecycle(db,electionId,new Date('2027-01-05'));
 assert.equal(value.phase,'Finalized');assert.equal(value.canFinalize,false);
 election=null;
 assert.equal(await getElectionLifecycle(db,electionId,new Date('2027-01-05')),null);
 console.log('PASS: Election setup, custody, open/closed/finalized phases and secret-free readiness');
}
run().catch(e=>{console.error(e);process.exitCode=1});
