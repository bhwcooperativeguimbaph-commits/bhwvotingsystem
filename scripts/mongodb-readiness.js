'use strict';
// Read-only MongoDB readiness check. Does not expose names, templates, ballots or secrets.
const {connectMongo}=require('../database/mongodb');
async function main(){
 let connection;
 try{
  connection=await connectMongo();
  const db=connection.db;
  const required=['admins','members','elections','candidates','ballots',
    'voterParticipation','receiptCodes','authSessions','biometricRegistrations',
    'keyCustodians','finalReports','memberInbox'];
  const available=new Set((await db.listCollections({}, {nameOnly:true}).toArray()).map(x=>x.name));
  const counts={};
  for(const name of required)counts[name]=available.has(name)?
    await db.collection(name).estimatedDocumentCount():0;
  const indexes=async name=>available.has(name)?await db.collection(name).indexes():[];
  const ballotIndexes=await indexes('ballots');
  const participationIndexes=await indexes('voterParticipation');
  const receiptIndexes=await indexes('receiptCodes');
  const sessionIndexes=await indexes('authSessions');
  const uniqueParticipation=participationIndexes.some(x=>x.unique===true&&
    x.key?.electionId===1&&x.key?.memberId===1);
  const receiptUnique=receiptIndexes.some(x=>x.unique===true&&x.key?.receiptCode===1);
  const ttlSessions=sessionIndexes.some(x=>x.key?.expiresAt===1&&x.expireAfterSeconds===0);
  const legacyVoterLinkedBallotIndex=ballotIndexes.some(x=>x.unique===true&&
    x.key?.electionId===1&&x.key?.memberId===1);
  // Inspect ALL ballot records for forbidden identifying/timing metadata.
  // The prior one-document sample could miss a leak in later records.
  // Return only a boolean; never read or print any ballot selection/ciphertext.
  const ballotIdentityLeak=available.has('ballots')?!!(await db.collection('ballots').findOne({
    $or:[{memberId:{$exists:true}},{voterId:{$exists:true}},
      {receiptCode:{$exists:true}},{receiptNo:{$exists:true}},
      {createdAt:{$exists:true}}]
  },{projection:{_id:1}})):false;
  const summary={database:db.databaseName,collectionsPresent:required.filter(x=>available.has(x)),
    recordCounts:counts,uniqueParticipationConstraint:uniqueParticipation,
    uniqueReceiptConstraint:receiptUnique,sessionExpiryIndex:ttlSessions,
    ballotIdentityIsolation:!legacyVoterLinkedBallotIndex&&!ballotIdentityLeak,
    readyForProduction:false};
  console.log(JSON.stringify(summary,null,2));
  if(!uniqueParticipation||!receiptUnique||!ttlSessions||legacyVoterLinkedBallotIndex||ballotIdentityLeak)
   process.exitCode=2;
 }finally{if(connection)await connection.client.close()}
}
main().catch(e=>{
 console.error('Readiness check failed:',e.name==='MongoServerSelectionError'?'Atlas unavailable':'Database configuration, schema or permission error');
 process.exitCode=1;
});
