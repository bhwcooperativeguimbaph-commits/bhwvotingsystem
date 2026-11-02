'use strict';
// Candidate mutations and their audit evidence commit in the SAME transaction.
// An election-scoped lease prevents key provisioning from racing an edit.
const crypto=require('node:crypto');
const clean=x=>typeof x==='string'?x.trim().replace(/\s+/g,' '):'';
function error(code){return Object.assign(new Error(code),{code})}
function validatePhoto(photo){
 if(photo==null||photo==='')return null;
 if(typeof photo!=='string'||photo.length>700000)throw error('INVALID_CANDIDATE');
 const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
 if(!match)throw error('INVALID_CANDIDATE');
 const bytes=Buffer.from(match[2],'base64');
 const jpeg=bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const png=bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(bytes.length>500000||!(match[1]==='jpeg'?jpeg:png))throw error('INVALID_CANDIDATE');
 return photo;
}
async function editCandidate(connection,{
 electionId,candidateId,position,candidateName,photo,operation,operatorId,actorRole,now=new Date()
}){
 if(!connection?.db||!connection?.client||!['add','update','remove'].includes(operation)||
   !/^ELEC-[0-9a-f-]{36}$/i.test(electionId||'')||
   !['admin','superadmin'].includes(actorRole)||typeof operatorId!=='string'||!operatorId)
  throw error('INVALID_CANDIDATE');
 if(operation!=='add'&&!/^CAND-[0-9a-f-]{36}$/i.test(candidateId||''))
  throw error('INVALID_CANDIDATE');
 if(operation==='update'&&(!clean(candidateName)||clean(candidateName).length>100))
  throw error('INVALID_CANDIDATE');
 if(operation==='add'&&(!clean(position)||clean(position).length>50||
   !clean(candidateName)||clean(candidateName).length>100))
  throw error('INVALID_CANDIDATE');
 // Validate photo BEFORE reserving edit ownership; a bad file never obtains a lease.
 const photoValue=photo===undefined?undefined:validatePhoto(photo);
 const {db,client}=connection,owner=crypto.randomUUID(),expiresAt=new Date(now.getTime()+120000);
 const election=await db.collection('elections').findOneAndUpdate({
  electionId,status:'Active',startTime:{$gt:now},
  keyProvisioningState:{$exists:false},ballotPublicKeyPem:{$exists:false},
  $or:[{candidateEditLeaseUntil:{$exists:false}},{candidateEditLeaseUntil:{$lte:now}}]
 },{$set:{candidateEditOwner:owner,candidateEditLeaseUntil:expiresAt}},{returnDocument:'after'});
 if(!election)throw error('ELECTION_LOCKED');
 try{
  const session=client.startSession();
  try{
   let output;
   await session.withTransaction(async()=>{
    const opts={session};
    if(await db.collection('ballots').findOne({electionId},{...opts,projection:{_id:1}}))
     throw error('ELECTION_LOCKED');
    const candidates=await db.collection('candidates').find({electionId,status:'Active'},opts).toArray();
    let selectedId;
    if(operation==='update'){
     const candidate=candidates.find(c=>c.candidateId===candidateId);
     if(!candidate)throw error('CANDIDATE_NOT_FOUND');
     candidateName=clean(candidateName);
     if(candidates.some(c=>c.candidateId!==candidateId&&
      c.position.toLowerCase()===candidate.position.toLowerCase()&&
      c.name.toLowerCase()===candidateName.toLowerCase()))
      throw error('DUPLICATE_CANDIDATE');
     const changes={name:candidateName,updatedAt:now};
     if(photoValue!==undefined)changes.photo=photoValue;
     const result=await db.collection('candidates').updateOne(
      {electionId,candidateId,status:'Active'},{$set:changes},opts);
     if(result.matchedCount!==1)throw error('CANDIDATE_NOT_FOUND');
     selectedId=candidateId;
     output={candidateId,status:'Active',name:candidateName};
    }else if(operation==='remove'){
     const candidate=candidates.find(c=>c.candidateId===candidateId);
     if(!candidate)throw error('CANDIDATE_NOT_FOUND');
     if(candidates.filter(c=>c.position===candidate.position).length<=candidate.maxVotes)
      throw error('INSUFFICIENT_CANDIDATES');
     const result=await db.collection('candidates').updateOne(
      {electionId,candidateId,status:'Active'},
      {$set:{status:'Removed',updatedAt:now}},opts);
     if(result.modifiedCount!==1)throw error('CANDIDATE_NOT_FOUND');
     selectedId=candidateId;
     output={candidateId,status:'Removed'};
    }else{
     position=clean(position);candidateName=clean(candidateName);
     const matching=candidates.filter(c=>c.position.toLowerCase()===position.toLowerCase());
     if(!matching.length)throw error('UNKNOWN_POSITION');
     if(matching.some(c=>c.name.toLowerCase()===candidateName.toLowerCase()))
      throw error('DUPLICATE_CANDIDATE');
     selectedId='CAND-'+crypto.randomUUID();
     await db.collection('candidates').insertOne({
      candidateId:selectedId,electionId,position:matching[0].position,
      maxVotes:matching[0].maxVotes,name:candidateName,photo:photoValue||null,
      status:'Active',createdAt:now
     },opts);
     output={candidateId:selectedId,status:'Active'};
    }
    // Never log candidate photos or ballot choices. Audit failures abort the mutation.
    await db.collection('auditLogs').insertOne({
     eventId:'AUD-'+crypto.randomUUID(),actorRole,operatorId,electionId,
     candidateId:selectedId,action:({
      add:'CANDIDATE_ADDED',update:'CANDIDATE_UPDATED',remove:'CANDIDATE_REMOVED'
     })[operation],outcome:'success',createdAt:now
    },opts);
   },{writeConcern:{w:'majority'}});
   return output;
  }finally{await session.endSession()}
 }finally{
  // Never hide a successful write if the already-expired lease cannot be released;
  // the reservation has a bounded timeout, and is checked before new provisioning.
  await db.collection('elections').updateOne(
   {electionId,candidateEditOwner:owner},
   {$unset:{candidateEditOwner:'',candidateEditLeaseUntil:''}}).catch(()=>{});
 }
}
module.exports={editCandidate,validatePhoto};
