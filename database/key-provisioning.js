'use strict';
// One-time guarded key provisioning. Exactly two separate custodians, no
// stored private key, no retrievable share plaintext, and no live ballots yet.
const crypto=require('node:crypto');
const {createCustodianPackage}=require('./key-custody');
const {sendBrevoEmail}=require('../services/brevo-email');
function validEmail(s){return typeof s==='string'&&s.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)}
async function provisionElectionKeys(connection,{electionId,emails,now=new Date(),deliver=sendBrevoEmail,operatorId}){
 if(!/^ELEC-[0-9a-f-]{36}$/i.test(electionId||'')||!Array.isArray(emails)||emails.length!==2||
  !emails.every(validEmail)||emails[0].toLowerCase()===emails[1].toLowerCase())
  throw Object.assign(new TypeError('Two distinct custodian email addresses required'),{code:'INVALID_CUSTODIANS'});
 const {db,client}=connection;
 const reservationId=crypto.randomUUID();
 const reserved=await db.collection('elections').updateOne({
  electionId,status:'Active',startTime:{$gt:now},
  ballotPublicKeyPem:{$exists:false},keyProvisioningState:{$exists:false},
  $or:[{candidateEditLeaseUntil:{$exists:false}},{candidateEditLeaseUntil:{$lte:now}}]
 },{$set:{keyProvisioningState:'Initializing',keyReservationId:reservationId,updatedAt:now}});
 if(reserved.modifiedCount!==1)throw Object.assign(new Error('Election is not eligible for key provisioning'),{code:'KEY_PROVISION_NOT_ALLOWED'});
 let succeeded=false;
 try{
  const already=await db.collection('ballots').findOne({electionId},{projection:{ballotId:1}});
  if(already)throw new Error('Election already has ballots');
  const pkg=createCustodianPackage();
  // Once issued, only the recipients possess individual shares. Provider
  // acceptance is NOT proof of inbox delivery; verify both before voting.
  const deliveries=[];
  for(let i=0;i<2;i++){
   const receipt=await deliver({to:emails[i],subject:'BHW election key share '+(i+1)+' of 2',
    text:'Election: '+electionId+'\nKey fingerprint: '+pkg.fingerprint+
     '\nYour confidential share ('+(i+1)+' of 2):\n'+pkg.shares[i]+
     '\nKeep this share private. Two distinct custodian shares are required to disclose results.'});
   deliveries.push({providerMessageId:typeof receipt?.messageId==='string'?
    receipt.messageId:null,deliveryAcceptedAt:new Date()});
  }
  const session=client.startSession();
  try{
   await session.withTransaction(async()=>{
    const election=await db.collection('elections').findOne(
     {electionId,keyProvisioningState:'Initializing',keyReservationId:reservationId,
      startTime:{$gt:new Date()}},{session});
    if(!election)throw new Error('Key provisioning expired or was replaced');
    // Freeze the electorate when both custodians' shares have been issued.
    // This is before voting opens, not on the first turnout dashboard view.
    const eligibleMembersSnapshot=await db.collection('members').countDocuments(
      {status:'Active',createdAt:{$lte:now}},{session});
    const custodians=emails.map((email,i)=>({electionId,email,shareIndex:i+1,
     shareHash:pkg.shareHashes[i],fingerprint:pkg.fingerprint,status:'Sent',
     deliveryAcceptedAt:deliveries[i].deliveryAcceptedAt,
     providerMessageId:deliveries[i].providerMessageId,createdAt:now}));
    await db.collection('keyCustodians').insertMany(custodians,{session});
    const result=await db.collection('elections').updateOne({
     electionId,keyReservationId:reservationId,keyProvisioningState:'Initializing',
     ballotPublicKeyPem:{$exists:false}
    },{$set:{ballotPublicKeyPem:pkg.publicKeyPem,keyFingerprint:pkg.fingerprint,
     keyProvisioningState:'Ready',eligibleMembersSnapshot,eligibilityFrozenAt:now,updatedAt:new Date()},
     $unset:{keyReservationId:''}},{session});
    if(result.modifiedCount!==1)throw new Error('Election reservation changed');
    await db.collection('auditLogs').insertOne({
     eventId:'AUD-'+crypto.randomUUID(),actorRole:'superadmin',
     ...(operatorId?{operatorId}:{}),action:'KEY_SHARES_ISSUED',
     electionId,createdAt:new Date()
    },{session});
   },{writeConcern:{w:'majority'}});
  }finally{await session.endSession()}
  succeeded=true;
  return {electionId,custodians:2,keyFingerprint:pkg.fingerprint};
 }finally{
  if(!succeeded){
   // Invalidate any partially mailed shares by not registering their hashes.
   await db.collection('elections').updateOne(
    {electionId,keyProvisioningState:'Initializing',keyReservationId:reservationId},
    {$unset:{keyProvisioningState:'',keyReservationId:''}}).catch(()=>{});
  }
 }
}
module.exports={provisionElectionKeys};
