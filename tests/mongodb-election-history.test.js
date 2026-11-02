'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {listElectionHistory}=require('../database/election-history');

const page=fs.readFileSync(path.join(__dirname,'..','public','mongo-admin-console.html'),'utf8');
assert.match(page,/e\.published\?/);
assert.match(page,/View report & verify integrity/);
assert.match(page,/Pending roster freeze/);
assert.match(page,/N\/A \(no eligible voters\)/);
assert.match(page,/timeZone:'Asia\/Manila'/);
const server=fs.readFileSync(path.join(__dirname,'..','mongo-auth-preview.js'),'utf8');
assert.match(server,/listElectionHistory\(connection\.db\)/);

(async()=>{
 const empty=await listElectionHistory({collection(name){
  assert.equal(name,'elections');
  return {find:()=>({toArray:async()=>[]})};
 }});
 assert.deepEqual(empty,[]);
 const requested=[];
 const electionA={electionId:'ELEC-A',title:'First Election',status:'Finalized',
  eligibleMembersSnapshot:8,startTime:new Date(),endTime:new Date()};
 const electionB={electionId:'ELEC-B',title:'Second Election',status:'Active',
  eligibleMembersSnapshot:0,startTime:new Date(),endTime:new Date()};
 const electionC={electionId:'ELEC-C',title:'Upcoming',status:'Active',
  startTime:new Date(),endTime:new Date()};
 const db={collection(name){
  if(name==='elections')return {find:(filter,options)=>{
   assert.deepEqual(filter,{});
   assert.equal(options.limit,30);
   assert.equal(options.projection.eligibleMembersSnapshot,1);
   return {toArray:async()=>[electionA,electionB,electionC]};
  }};
  if(name==='voterParticipation')return {aggregate:pipeline=>{
   requested.push({type:'participation',pipeline});
   return {toArray:async()=>[{_id:'ELEC-A',ballotsCast:5}]};
  }};
  if(name==='finalReports')return {find:(filter,options)=>{
   requested.push({type:'reports',filter,options});
   return {toArray:async()=>[
    {electionId:'ELEC-A',publishedAt:new Date('2026-11-02T02:00:00Z')},
    // A stray report without Finalized status is insufficient to mark it published.
    {electionId:'ELEC-B',publishedAt:new Date('2026-11-02T02:00:00Z')}
   ]};
  }};
  throw Error('Unexpected collection '+name);
 }};
 const history=await listElectionHistory(db);
 assert.equal(history.length,3);
 assert.deepEqual(history[0].published,true);
 assert.equal(history[0].ballotsCast,5);
 assert.equal(history[0].eligibleMembers,8);
 assert.equal(history[0].turnoutPercent,62.5);
 assert.equal(history[1].published,false);
 assert.equal(history[1].turnoutPercent,null);
 assert.equal(history[1].eligibleMembers,0);
 assert.equal(history[2].turnoutPercent,null);
 assert.equal(history[2].eligibleMembers,null);
 assert.equal(history[2].ballotsCast,0);
 assert.ok(history.every(item=>!('memberId' in item)&&!('selections' in item)));
 const participation=requested.find(item=>item.type==='participation').pipeline;
 assert.equal(participation[0].$match.status,'Valid');
 assert.deepEqual(participation[0].$match.electionId.$in,['ELEC-A','ELEC-B','ELEC-C']);
 assert.equal(participation[1].$group._id,'$electionId');
 const reports=requested.find(item=>item.type==='reports');
 assert.deepEqual(reports.filter.electionId.$in,['ELEC-A','ELEC-B','ELEC-C']);
 assert.equal(reports.options.projection.publishedAt,1);
 console.log('PASS: protected election history is publication-aware, scoped, and contains aggregate turnout only');
})().catch(error=>{console.error(error);process.exitCode=1});
