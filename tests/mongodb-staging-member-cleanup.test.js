'use strict';
const assert=require('node:assert/strict');
const {deleteUnusedStagingMember}=require('../database/staging-member-cleanup');
async function run(){
 const memberId='MEM-00000000-0000-4000-8000-000000000001';
 const member={memberId,createdAt:new Date('2026-10-01T00:00:00Z')};
 let voted=false,frozen=false,removed=false,cleaned=0;
 const session={withTransaction:async fn=>fn(),endSession:async()=>{}};
 const connection={client:{startSession:()=>session},db:{
  databaseName:'BHWVotingDB_Staging',
  collection:name=>{
   if(name==='members')return {findOne:async()=>removed?null:member,
    deleteOne:async(_,o)=>{assert.equal(o.session,session);removed=true;return{deletedCount:1}}};
   if(name==='voterParticipation')return {findOne:async()=>voted?{_id:1}:null};
   if(name==='elections')return {findOne:async()=>frozen?{_id:1}:null};
   if(name==='biometricRegistrations'||name==='authSessions'||name==='memberInbox'||name==='receiptCodes')
    return {deleteMany:async(_,o)=>{assert.equal(o.session,session);cleaned++;return{deletedCount:1}}};
   if(name==='auditLogs')return {updateMany:async()=>({modifiedCount:1}),
     insertOne:async(doc,o)=>{assert.equal(o.session,session);assert.equal(doc.action,'UNUSED_TEST_MEMBER_PURGED');assert.equal('memberId' in doc,false)}};
   throw Error('Unknown collection '+name);
  }
 }};
 await assert.rejects(deleteUnusedStagingMember({...connection,db:{...connection.db,databaseName:'BHWVotingDB'}},memberId),e=>e.code==='STAGING_ONLY');
 voted=true;
 await assert.rejects(deleteUnusedStagingMember(connection,memberId),e=>e.code==='MEMBER_HAS_VOTED');
 voted=false;frozen=true;
 await assert.rejects(deleteUnusedStagingMember(connection,memberId),e=>e.code==='ELECTORATE_FROZEN');
 frozen=false;
 const result=await deleteUnusedStagingMember(connection,memberId);
 assert.deepEqual(result,{deleted:true,biometricDataPurged:true});
 assert.equal(removed,true);assert.equal(cleaned,4);
 await assert.rejects(deleteUnusedStagingMember(connection,memberId),e=>e.code==='NOT_FOUND');
 console.log('PASS: Staging-only unused biometric cleanup and frozen/voted member protection');
}
run().catch(e=>{console.error(e);process.exitCode=1});
