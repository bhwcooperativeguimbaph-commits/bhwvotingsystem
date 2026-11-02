'use strict';
// Privacy-oriented synthetic member cleanup. Staging only, Super Admin only.
// Never remove a member with ballots or whose identity was captured in a frozen
// electorate. Delete related enrollment material atomically.
const crypto=require('node:crypto');
function codeError(code){return Object.assign(new Error(code),{code})}
async function deleteUnusedStagingMember(connection,memberId,{now=new Date()}={}){
 if(!/_(?:Staging|Test)$/i.test(connection?.db?.databaseName||''))
  throw codeError('STAGING_ONLY');
 if(!/^MEM-[a-f0-9-]{36}$/i.test(memberId||''))throw codeError('INVALID_MEMBER');
 const {db,client}=connection,session=client.startSession();
 try{
  let result;
  await session.withTransaction(async()=>{
   const member=await db.collection('members').findOne({memberId},{session});
   if(!member)throw codeError('NOT_FOUND');
   const votes=await db.collection('voterParticipation').findOne({memberId},{session,projection:{_id:1}});
   if(votes)throw codeError('MEMBER_HAS_VOTED');
   // Cannot change a frozen electorate retrospectively or invalidate turnout.
   const frozen=await db.collection('elections').findOne({
    eligibilityFrozenAt:{$exists:true,$gte:member.createdAt}
   },{session,projection:{_id:1}});
   if(frozen)throw codeError('ELECTORATE_FROZEN');
   await db.collection('biometricRegistrations').deleteMany({memberId},{session});
   await db.collection('authSessions').deleteMany({accountId:memberId},{session});
   await db.collection('memberInbox').deleteMany({memberId},{session});
   await db.collection('receiptCodes').deleteMany({memberId},{session});
   // Remove any stored member ID from historical enrollment events.
   await db.collection('auditLogs').updateMany({memberId},{$unset:{memberId:'',operatorId:''}},{session});
   const removed=await db.collection('members').deleteOne({memberId},{session});
   if(removed.deletedCount!==1)throw codeError('NOT_FOUND');
   await db.collection('auditLogs').insertOne({
    eventId:'AUD-'+crypto.randomUUID(),actorRole:'superadmin',
    action:'UNUSED_TEST_MEMBER_PURGED',createdAt:now
   },{session});
   result={deleted:true,biometricDataPurged:true};
  },{writeConcern:{w:'majority'}});
  return result;
 }finally{await session.endSession()}
}
module.exports={deleteUnusedStagingMember};
