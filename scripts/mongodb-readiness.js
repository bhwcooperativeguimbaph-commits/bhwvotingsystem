'use strict';
// Read-only migration readiness check. Do not print personal, biometric or ballot data.
const {connectMongo}=require('../database/mongodb');
async function main(){
 let connection;
 try{
  connection=await connectMongo();
  const db=connection.db;
  const required=['admins','members','elections','candidates','ballots','authSessions','biometricRegistrations'];
  const available=new Set((await db.listCollections({}, {nameOnly:true}).toArray()).map(x=>x.name));
  const counts={};
  for(const name of required){
   counts[name]=available.has(name)?await db.collection(name).estimatedDocumentCount():0;
  }
  const ballotIndexes=available.has('ballots')?await db.collection('ballots').indexes():[];
  const sessionIndexes=available.has('authSessions')?await db.collection('authSessions').indexes():[];
  const uniqueBallots=ballotIndexes.some(x=>x.unique===true && x.key?.electionId===1 && x.key?.memberId===1);
  const ttlSessions=sessionIndexes.some(x=>x.key?.expiresAt===1&&x.expireAfterSeconds===0);
  const summary={database:db.databaseName,collectionsPresent:required.filter(x=>available.has(x)),
    recordCounts:counts,uniqueBallotConstraint:uniqueBallots,sessionExpiryIndex:ttlSessions,
    readyForProduction:false};
  console.log(JSON.stringify(summary,null,2));
  if(!uniqueBallots||!ttlSessions)process.exitCode=2;
 }finally{if(connection)await connection.client.close();}
}
main().catch(e=>{
 console.error('Migration readiness check failed:',e.name==='MongoServerSelectionError'?'Atlas unavailable':'Database configuration or permission error');
 process.exitCode=1;
});
