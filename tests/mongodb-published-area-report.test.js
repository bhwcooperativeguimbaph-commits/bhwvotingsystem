'use strict';
const assert=require('node:assert/strict');
const {publishedAreaTurnout}=require('../database/published-area-report');
const id='ELEC-00000000-0000-4000-8000-000000000001';
(async()=>{
 const pipeline=[];
 let published=false;
 const db={collection(name){
  if(name==='elections')return {findOne:async q=>published?
    {electionId:id,eligibleMembersSnapshot:11}:null};
  if(name==='finalReports')return {findOne:async()=>published?
    {ballotsCast:5,publishedAt:new Date('2026-11-03T12:00:00Z')}:null};
  if(name==='voterParticipation')return {aggregate:q=>{
   pipeline.push(q);return {toArray:async()=>[
    {_id:'Area 1',votesCast:3},{_id:'Area 2',votesCast:2},{_id:null,votesCast:4}
   ]};
  }};
  throw Error(name);
 }};
 await assert.rejects(publishedAreaTurnout(db,'not-an-id'),TypeError);
 assert.equal(await publishedAreaTurnout(db,id),null);
 published=true;
 // MongoDB applies the suppression match in real queries. Check this test
 // fixture's stage contract as well as the report's response fields.
 const result=await publishedAreaTurnout(db,id);
 assert.equal(result.ballotsCast,5);
 assert.equal(result.eligibleMembers,11);
 assert.equal(result.minimumPublishedAreaSize,3);
 assert.ok(!('results' in result)&&!('choices' in result));
 assert.ok(pipeline[0].some(stage=>stage.$match?.votesCast?.$gte===3));
 assert.ok(pipeline[0].some(stage=>stage.$lookup?.from==='members'));
 assert.equal(result.areas[0].area,'Area 1');
 assert.equal(result.areas[0].votesCast,3);
 console.log('PASS: area turnout is published-only and suppresses small groups, never candidate choices');
})().catch(e=>{console.error(e);process.exitCode=1});
