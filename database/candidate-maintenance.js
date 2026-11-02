'use strict';
// Pre-start candidate edits. Uses a per-election lease to serialize concurrent
// changes. Once key provisioning begins, all add/update/remove operations lock.
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
async function editCandidate(db,{electionId,candidateId,position,candidateName,photo,operation,now=new Date()}){
 if(!/^ELEC-[0-9a-f-]{36}$/i.test(electionId||'')||!['add','update','remove'].includes(operation))
  throw error('INVALID_CANDIDATE');
 if(operation!=='add'&&!/^CAND-[0-9a-f-]{36}$/i.test(candidateId||''))throw error('INVALID_CANDIDATE');
 if(operation==='update'&&(candidateName===undefined||!clean(candidateName)||clean(candidateName).length>100))
  throw error('INVALID_CANDIDATE');
 if(operation==='add'&&(!clean(position)||clean(position).length>50||!clean(candidateName)||clean(candidateName).length>100))throw error('INVALID_CANDIDATE');
 const owner=crypto.randomUUID(),expiresAt=new Date(now.getTime()+120000);
 const election=await db.collection('elections').findOneAndUpdate({
  electionId,status:'Active',startTime:{$gt:now},
  keyProvisioningState:{$exists:false},ballotPublicKeyPem:{$exists:false},$or:[
   {candidateEditLeaseUntil:{$exists:false}},{candidateEditLeaseUntil:{$lte:now}}
  ]
 },{$set:{candidateEditOwner:owner,candidateEditLeaseUntil:expiresAt}},{returnDocument:'after'});
 if(!election)throw error('ELECTION_LOCKED');
 try{
  if(await db.collection('ballots').findOne({electionId},{projection:{_id:1}}))
   throw error('ELECTION_LOCKED');
  const candidates=await db.collection('candidates').find({electionId,status:'Active'}).toArray();
  if(operation==='update'){
   const candidate=candidates.find(c=>c.candidateId===candidateId);
   if(!candidate)throw error('CANDIDATE_NOT_FOUND');
   candidateName=clean(candidateName);
   if(candidates.some(c=>c.candidateId!==candidateId&&
      c.position.toLowerCase()===candidate.position.toLowerCase()&&
      c.name.toLowerCase()===candidateName.toLowerCase()))throw error('DUPLICATE_CANDIDATE');
   const changes={name:candidateName,updatedAt:now};
   // Absent photo preserves the existing JPG/PNG. Explicit null removes it.
   if(photo!==undefined)changes.photo=validatePhoto(photo);
   const result=await db.collection('candidates').updateOne(
    {electionId,candidateId,status:'Active'},{$set:changes});
   if(result.matchedCount!==1)throw error('CANDIDATE_NOT_FOUND');
   return {candidateId,status:'Active',name:candidateName};
  }
  if(operation==='remove'){
   const candidate=candidates.find(c=>c.candidateId===candidateId);
   if(!candidate)throw error('CANDIDATE_NOT_FOUND');
   const current=candidates.filter(c=>c.position===candidate.position);
   if(current.length<=candidate.maxVotes)throw error('INSUFFICIENT_CANDIDATES');
   const result=await db.collection('candidates').updateOne(
    {electionId,candidateId,status:'Active'},{$set:{status:'Removed',updatedAt:now}});
   if(result.modifiedCount!==1)throw error('CANDIDATE_NOT_FOUND');
   return {candidateId,status:'Removed'};
  }
  position=clean(position);candidateName=clean(candidateName);
  if(!candidateName||candidateName.length>100)throw error('INVALID_CANDIDATE');
  const pos=candidates.filter(c=>c.position.toLowerCase()===position.toLowerCase());
  if(!pos.length)throw error('UNKNOWN_POSITION');
  if(pos.some(c=>c.name.toLowerCase()===candidateName.toLowerCase()))throw error('DUPLICATE_CANDIDATE');
  const candidateIdNew='CAND-'+crypto.randomUUID();
  await db.collection('candidates').insertOne({
   candidateId:candidateIdNew,electionId,position:pos[0].position,maxVotes:pos[0].maxVotes,
   name:candidateName,photo:validatePhoto(photo),status:'Active',createdAt:now
  });
  return {candidateId:candidateIdNew,status:'Active'};
 }finally{
  await db.collection('elections').updateOne(
   {electionId,candidateEditOwner:owner},{$unset:{candidateEditOwner:'',candidateEditLeaseUntil:''}}).catch(()=>{});
 }
}
module.exports={editCandidate,validatePhoto};
