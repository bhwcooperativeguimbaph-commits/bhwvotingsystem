'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {getAdminAnalytics}=require('../database/admin-analytics');

const page=fs.readFileSync(path.join(__dirname,'..','public','mongo-admin-console.html'),'utf8');
for(const id of ['currentElectionTitle','currentElectionStatus','currentBallots','currentEligible','currentTurnout','turnoutExplanation']){
 assert.match(page,new RegExp('id="'+id+'"'),id+' must be displayed');
}
assert.match(page,/Total votes/);
assert.match(page,/Votes cast/);
assert.match(page,/Number\.isInteger\(eligible\)/);
assert.match(page,/eligible===0/);
assert.match(page,/No active election/);
assert.match(page,/Votes by area/);

(async()=>{
 const empty=await getAdminAnalytics({collection(name){
  assert.equal(name,'elections');
  return {findOne:async()=>null};
 }});
 assert.equal(empty.election,null);
 assert.equal(empty.ballotsCast,0);
 assert.equal(empty.turnoutPercent,0);
 assert.deepEqual(empty.daily,[]);

 const queries=[];
 const election={electionId:'ELEC-TEST',title:'Example election',status:'Scheduled',
  eligibleMembersSnapshot:8,startTime:new Date(),endTime:new Date()};
 const db={collection(name){
  if(name==='elections')return {findOne:async query=>{
   assert.equal(query.status,'Active');
   assert.ok(query.endTime.$gt instanceof Date);
   return election;
  }};
  assert.equal(name,'voterParticipation');
  return {
   aggregate(pipeline){
    queries.push(pipeline);
    const area=pipeline.some(stage=>stage.$lookup);
    return {toArray:async()=>area?
     [{_id:'Area A',count:3},{_id:null,count:3}]:
     [{_id:'2026-11-02',count:3}]};
   },
   async countDocuments(filter){queries.push(filter);return 3}
  };
 }};
 const actual=await getAdminAnalytics(db);
 assert.equal(actual.election.title,election.title);
 assert.equal(actual.election.eligibleMembers,8);
 assert.equal(actual.ballotsCast,3);
 assert.equal(actual.turnoutPercent,37.5);
 assert.deepEqual(actual.daily,[{date:'2026-11-02',count:3}]);
 assert.deepEqual(actual.areas,[{area:'Area A',count:3}]);
 for(const query of queries){
  const filter=Array.isArray(query)?query[0].$match:query;
  assert.deepEqual(filter,{electionId:'ELEC-TEST',status:'Valid'});
 }
 const areaPipeline=queries.find(q=>Array.isArray(q)&&q.some(stage=>stage.$lookup));
 assert.ok(areaPipeline.some(s=>s.$match&&s.$match.count&&s.$match.count.$gte===3),
  'Suppress area groups with fewer than three recorded voters');
 assert.ok(!('memberId' in actual)&&!('selections' in actual));
 console.log('PASS: dashboard separates lifetime totals from latest-election turnout and safely handles empty/zero-roster states');
})().catch(err=>{console.error(err);process.exitCode=1});
