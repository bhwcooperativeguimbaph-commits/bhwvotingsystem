'use strict';
// Post-election disclosure with both custodian shares. Final report contains
// aggregate candidate counts only; never voters or individual ballots.
const crypto=require('node:crypto');
const {reconstructElectionPrivateKey}=require('./key-custody');
const {decryptBallot}=require('./ballot-crypto');
const {validateBallot}=require('./ballot-validation');
async function discloseElectionResults(connection,{electionId,shares,now=new Date()}){
 if(!/^ELEC-[0-9a-f-]{36}$/i.test(electionId||'')||
    !Array.isArray(shares)||shares.length!==2||!(now instanceof Date))
  throw Object.assign(new Error('Invalid disclosure request'),{code:'INVALID_DISCLOSURE'});
 const {db,client}=connection;
 const session=client.startSession();
 try{
  let report;
  await session.withTransaction(async()=>{
   const election=await db.collection('elections').findOne({
    electionId,status:{$in:['Active','Closed']},endTime:{$lte:now},keyProvisioningState:'Ready',keyDeliveryConfirmed:true
   },{session});
   if(!election)throw Object.assign(new Error('Election cannot be disclosed'),{code:'NOT_DISCLOSABLE'});
   const custodians=await db.collection('keyCustodians').find(
    {electionId,status:'Confirmed'},{session,sort:{shareIndex:1}}).toArray();
   if(custodians.length!==2||custodians[0].shareIndex!==1||custodians[1].shareIndex!==2)
    throw Object.assign(new Error('Key custodians not verified'),{code:'INVALID_SHARES'});
   let privatePem;
   try{privatePem=reconstructElectionPrivateKey(election.ballotPublicKeyPem,shares,custodians.map(c=>c.shareHash))}
   catch(_){throw Object.assign(new Error('Custodian shares invalid'),{code:'INVALID_SHARES'})}
   const candidates=await db.collection('candidates').find(
    {electionId,status:'Active'},{session,projection:{_id:0,candidateId:1,name:1,position:1,maxVotes:1,status:1}}).toArray();
   if(!candidates.length)throw new Error('Election has no candidates');
   const totals=new Map(candidates.map(c=>[c.candidateId,0]));
   const ballots=await db.collection('ballots').find({electionId,status:'Valid'},
    {session,projection:{_id:0,encryptedVote:1,voteHash:1}}).toArray();
   // Ballot ciphertext and identifiable participation are stored separately.
   // Integrity requires exactly one anonymous ballot per accepted participation.
   const participants=await db.collection('voterParticipation').countDocuments(
    {electionId,status:'Valid'},{session});
   if(participants!==ballots.length)
    throw Object.assign(new Error('Ballot and participation count mismatch'),{code:'INTEGRITY_FAILURE'});
   for(const ballot of ballots){
    if(typeof ballot.encryptedVote!=='string'||crypto.createHash('sha256').update(ballot.encryptedVote).digest('hex')!==ballot.voteHash)
     throw Object.assign(new Error('Ballot integrity failure'),{code:'INTEGRITY_FAILURE'});
    let choices;
    try{choices=decryptBallot(ballot.encryptedVote,electionId,privatePem);validateBallot(choices,candidates)}
    catch(_){throw Object.assign(new Error('Encrypted ballot invalid'),{code:'INTEGRITY_FAILURE'})}
    for(const ids of Object.values(choices))for(const id of ids)totals.set(id,totals.get(id)+1);
   }
   report={electionId,ballotsCast:ballots.length,results:candidates.map(c=>({
    candidateId:c.candidateId,name:c.name,position:c.position,votes:totals.get(c.candidateId)
   })),publishedAt:now};
   report.reportHash=crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
   await db.collection('finalReports').insertOne({...report,createdAt:now},{session});
   // Publish exactly one durable in-account announcement with the report.
   // No per-voter materialization is required; all preexisting member accounts
   // see this announcement when reading their notification inbox.
   await db.collection('resultAnnouncements').insertOne({
    notificationId:'NOTICE-'+crypto.randomUUID(),electionId,
    type:'RESULTS_PUBLISHED',message:'Verified election results are now available.',
    createdAt:now
   },{session});
   const result=await db.collection('elections').updateOne(
    {electionId,status:{$in:['Active','Closed']},endTime:{$lte:now}},
    {$set:{status:'Finalized',finalizedAt:now}},{session});
   if(result.modifiedCount!==1)throw new Error('Election changed during finalization');
   await db.collection('auditLogs').insertOne({
    eventId:'AUD-'+crypto.randomUUID(),actorRole:'superadmin',action:'RESULTS_FINALIZED',
    electionId,createdAt:now
   },{session});
  },{writeConcern:{w:'majority'}});
  return report;
 }catch(e){
  if(e.code===11000)throw Object.assign(new Error('Results already finalized'),{code:'ALREADY_FINALIZED'});
  throw e;
 }finally{await session.endSession()}
}
module.exports={discloseElectionResults};
