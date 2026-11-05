'use strict';
const assert=require('node:assert/strict');
const {setResultsArchived}=require('../database/results-archive');
async function run(){
 const electionId='ELEC-00000000-0000-4000-8000-000000000001';
 const election={electionId,status:'Finalized'};
 const audits=[];
 const session={withTransaction:async fn=>fn(),endSession:async()=>{}};
 const db={collection(name){
  if(name==='elections')return {
   findOne:async()=>election,
   updateOne:async(q,update)=>{
    assert.equal(q.status,'Finalized');
    if(update.$set){Object.assign(election,update.$set);return{modifiedCount:1}}
    if(update.$unset){delete election.archivedAt;delete election.archivedBy;return{modifiedCount:1}}
    throw Error('bad update');
   }
  };
  if(name==='finalReports')return {findOne:async()=>({electionId})};
  if(name==='auditLogs')return {insertOne:async(doc,opt)=>{
   assert.ok(opt.session);assert.equal(doc.actorRole,'superadmin');
   assert.equal(doc.operatorId,'SUPERADMIN');audits.push(doc);
  }};
  throw Error('Archive unexpectedly accessed '+name);
 }};
 const connection={db,client:{startSession:()=>session}};
 await assert.rejects(setResultsArchived(connection,{electionId,archived:true,operatorId:''}),TypeError);
 const result=await setResultsArchived(connection,{electionId,archived:true,operatorId:'SUPERADMIN'});
 assert.equal(result.archived,true);assert.ok(election.archivedAt instanceof Date);
 assert.equal(audits[0].action,'RESULTS_ARCHIVED');
 await assert.rejects(setResultsArchived(connection,{electionId,archived:true,operatorId:'SUPERADMIN'}),e=>e.code==='ARCHIVE_UNCHANGED');
 const restored=await setResultsArchived(connection,{electionId,archived:false,operatorId:'SUPERADMIN'});
 assert.equal(restored.archived,false);assert.equal(election.archivedAt,undefined);
 assert.equal(audits[1].action,'RESULTS_RESTORED');
 election.status='Active';
 await assert.rejects(setResultsArchived(connection,{electionId,archived:true,operatorId:'SUPERADMIN'}),e=>e.code==='RESULTS_NOT_PUBLISHED');
 assert.equal(audits.length,2);
 console.log('PASS: Published-result archiving/restoration is reversible, role-audited, non-destructive');
}
run().catch(e=>{console.error(e);process.exitCode=1});
