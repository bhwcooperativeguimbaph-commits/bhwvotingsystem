'use strict';
// Transactional ballot + receipt. Intended for guarded staging tests; do not activate
// until custodian key provisioning, secrecy review and full browser tests succeed.
const crypto=require('node:crypto');
const {validateBallot}=require('./ballot-validation');
const {encryptBallot}=require('./ballot-crypto');
function voteError(code,message){return Object.assign(new Error(message),{code});}
async function castEncryptedVote(connection,{memberId,choices,now=new Date()}){
 if(!connection?.client||!connection?.db)throw new TypeError('MongoDB transaction connection required');
 if(typeof memberId!=='string'||!memberId)throw voteError('NOT_AUTHORIZED','Member session required');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new TypeError('Invalid vote time');
 if(!choices||typeof choices!=='object'||Array.isArray(choices))throw voteError('INVALID_BALLOT','Invalid ballot');
 const {db,client}=connection,session=client.startSession();
 const ballotId='VOTE-'+crypto.randomUUID();
 const receiptNo='BHW-'+crypto.randomBytes(16).toString('hex').toUpperCase();
 let accepted=false;
 try{
  await session.withTransaction(async()=>{
   const election=await db.collection('elections').findOne({
    status:'Active',startTime:{$lte:now},endTime:{$gt:now}
   },{session,sort:{createdAt:-1}});
   if(!election)throw voteError('VOTING_CLOSED','Voting is not currently open');
   if(!(election.eligibilityFrozenAt instanceof Date)||
      !Number.isInteger(election.eligibleMembersSnapshot))
    throw voteError('ENCRYPTION_UNAVAILABLE','Election eligibility snapshot is not ready');
   const member=await db.collection('members').findOne({
    memberId,status:'Active',createdAt:{$lte:election.eligibilityFrozenAt}
   },{session,projection:{memberId:1}});
   if(!member)throw voteError('NOT_AUTHORIZED','Member is not eligible for this election');
   if(election.keyDeliveryConfirmed!==true||election.keyProvisioningState!=='Ready')
    throw voteError('ENCRYPTION_UNAVAILABLE','Both election custodians must confirm receipt of their key shares');
   if(typeof election.ballotPublicKeyPem!=='string'||!election.ballotPublicKeyPem)
    throw voteError('ENCRYPTION_UNAVAILABLE','Election encryption key is unavailable');
   const candidates=await db.collection('candidates').find(
    {electionId:election.electionId,status:'Active'},{session}).toArray();
   try{validateBallot(choices,candidates)}
   catch(_){throw voteError('INVALID_BALLOT','Candidate selections or position limits are invalid')}
   const {ciphertext,voteHash}=encryptBallot(choices,election.electionId,election.ballotPublicKeyPem);
   // Private participation ledger enforces one vote without attaching identity
   // or receipt code to encrypted ballot contents.
   await db.collection('voterParticipation').insertOne({
    electionId:election.electionId,memberId,receiptCode:receiptNo,
    status:'Valid',createdAt:now
   },{session});
   await db.collection('ballots').insertOne({
    // A random _id avoids MongoDB ObjectId timestamp/order metadata on ballots.
    _id:ballotId,ballotId,electionId:election.electionId,encryptedVote:ciphertext,
    voteHash,status:'Valid'
   },{session});
   await db.collection('receiptCodes').insertOne({
    receiptCode:receiptNo,memberId,electionId:election.electionId,createdAt:now
   },{session});
   await db.collection('memberInbox').insertOne({
    notificationId:'NOTICE-'+crypto.randomUUID(),memberId,electionId:election.electionId,
    type:'BALLOT_RECEIPT',message:'Your ballot was securely recorded.',
    receiptCode:receiptNo,read:false,createdAt:now
   },{session});
   await db.collection('auditLogs').insertOne({
    eventId:'AUD-'+crypto.randomUUID(),actorRole:'member',action:'BALLOT_CAST',
    electionId:election.electionId,createdAt:now
   },{session});
   accepted=true;
  },{writeConcern:{w:'majority'}});
  if(!accepted)throw voteError('TRANSACTION_FAILED','Ballot transaction was not committed');
  return {receiptNo};
 }catch(e){
  if(e?.code===11000)throw voteError('DUPLICATE_BALLOT','A ballot was already recorded for this election');
  throw e;
 }finally{await session.endSession()}
}
module.exports={castEncryptedVote};
