'use strict';
// Archiving changes only protected navigation metadata. It never removes,
// alters, republishes, or hides the immutable public aggregate results.
const crypto=require('node:crypto');
const ID=/^ELEC-[0-9a-f-]{36}$/i;
function error(code){return Object.assign(new Error(code),{code})}
async function setResultsArchived(connection,{electionId,archived,operatorId,now=new Date()}){
 if(!connection?.client||!connection?.db||!ID.test(electionId||'')||
    typeof archived!=='boolean'||typeof operatorId!=='string'||!operatorId||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw new TypeError('Invalid archive request');
 const {client,db}=connection,session=client.startSession();
 try{
  let result;
  await session.withTransaction(async()=>{
   const election=await db.collection('elections').findOne({electionId},{session});
   if(!election)throw error('ELECTION_NOT_FOUND');
   if(election.status!=='Finalized')throw error('RESULTS_NOT_PUBLISHED');
   const report=await db.collection('finalReports').findOne({electionId},
    {session,projection:{electionId:1}});
   if(!report)throw error('RESULTS_NOT_PUBLISHED');
   if(Boolean(election.archivedAt)===archived)throw error('ARCHIVE_UNCHANGED');
   const filter={electionId,status:'Finalized',
    ...(archived?{archivedAt:{$exists:false}}:{archivedAt:{$type:'date'}})};
   const update=archived?{$set:{archivedAt:now,archivedBy:operatorId}}:
    {$unset:{archivedAt:'',archivedBy:''}};
   const saved=await db.collection('elections').updateOne(filter,update,{session});
   if(saved.modifiedCount!==1)throw error('ARCHIVE_CONFLICT');
   await db.collection('auditLogs').insertOne({
    eventId:'AUD-'+crypto.randomUUID(),actorRole:'superadmin',operatorId,
    action:archived?'RESULTS_ARCHIVED':'RESULTS_RESTORED',
    electionId,createdAt:now
   },{session});
   result={electionId,archived};
  },{writeConcern:{w:'majority'}});
  return result;
 }finally{await session.endSession()}
}
module.exports={setResultsArchived};
