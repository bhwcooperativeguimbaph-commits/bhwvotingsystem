'use strict';
const assert=require('node:assert/strict');
const {getElectionTurnout}=require('../database/turnout');
async function run(){
 let election={electionId:'E-1',title:'Election',status:'Active'};
 let eligible=20,cast=5;
 const db={collection(name){
  if(name==='elections')return {findOne:async()=>election,updateOne:async(q,u)=>{if(election.eligibleMembersSnapshot===undefined)election.eligibleMembersSnapshot=u.$set.eligibleMembersSnapshot;return {modifiedCount:1}}};
  if(name==='members')return {countDocuments:async q=>{assert.equal(q.status,'Active');return eligible}};
  if(name==='ballots')return {countDocuments:async q=>{assert.deepEqual(q,{electionId:'E-1',status:'Valid'});return cast}};
 }};
 assert.equal((await getElectionTurnout(db,'E-1')).turnoutPercent,25);
 eligible=0;cast=0;assert.equal((await getElectionTurnout(db,'E-1')).turnoutPercent,0);
 election={electionId:'E-1',title:'Past Election',status:'Active',
  startTime:new Date('2026-01-01T00:00:00Z'),eligibleMembersSnapshot:20};
 eligible=20;cast=10;
 const frozen=await getElectionTurnout(db,'E-1',new Date('2026-02-01T00:00:00Z'));
 assert.equal(frozen.eligibleMembers,20);assert.equal(frozen.turnoutPercent,50);
 eligible=5;
 const later=await getElectionTurnout(db,'E-1',new Date('2026-03-01T00:00:00Z'));
 assert.equal(later.eligibleMembers,20);assert.equal(later.turnoutPercent,50);
 election=null;assert.equal(await getElectionTurnout(db,'E-1'),null);
 console.log('PASS: Frozen electorate turnout stays stable after member status changes');
}
run().catch(e=>{console.error(e);process.exitCode=1});
