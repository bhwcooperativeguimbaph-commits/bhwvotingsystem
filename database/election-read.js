'use strict';
// Read-only MongoDB election information; compatible with /api/election-info frontend.
async function getPublicElectionInfo(db,now=new Date()){
 const election=await db.collection('elections').findOne(
  {status:'Active',endTime:{$gt:now}},{sort:{createdAt:-1},projection:{_id:0,electionId:1,title:1,startTime:1,endTime:1,keyProvisioningState:1,keyDeliveryConfirmed:1,ballotPublicKeyPem:1}});
 if(!election)return {active:false};
 const docs=await db.collection('candidates').find(
  {electionId:election.electionId,status:'Active'},
  {projection:{_id:0,candidateId:1,name:1,photo:1,position:1,maxVotes:1}}
 ).toArray();
 const groups=new Map();
 for(const c of docs){
  if(!groups.has(c.position))groups.set(c.position,{title:c.position,maxVotes:c.maxVotes,candidates:[]});
  const p=groups.get(c.position);
  if(p.maxVotes!==c.maxVotes)throw new Error('Inconsistent election position limits');
  p.candidates.push({candidateId:c.candidateId,name:c.name,photo:c.photo});
 }
 const custodiansReady=election.keyProvisioningState==='Ready'&&
  election.keyDeliveryConfirmed===true&&
  typeof election.ballotPublicKeyPem==='string'&&Boolean(election.ballotPublicKeyPem);
 return {active:true,title:election.title,config:[...groups.values()],
  startTime:election.startTime,endTime:election.endTime,custodiansReady};
}
module.exports={getPublicElectionInfo};
