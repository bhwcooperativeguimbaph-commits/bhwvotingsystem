'use strict';
// Sanitized administrative lifecycle status. Never return private keys, shares,
// biometric templates, voter identities, or individual ballot selections.
const ID=/^ELEC-[0-9a-f-]{36}$/i;
async function getElectionLifecycle(db,electionId,now=new Date()){
 if(typeof electionId!=='string'||!ID.test(electionId)||
   !(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw new TypeError('Invalid election lifecycle lookup');
 const election=await db.collection('elections').findOne(
  {electionId},{projection:{
   _id:0,electionId:1,title:1,startTime:1,endTime:1,status:1,
   keyProvisioningState:1,keyDeliveryConfirmed:1,
   eligibleMembersSnapshot:1,eligibilityFrozenAt:1,finalizedAt:1
  }});
 if(!election)return null;
 const [confirmedCustodians,recordedVotes,candidates]=await Promise.all([
  db.collection('keyCustodians').countDocuments({electionId,status:'Confirmed'}),
  db.collection('voterParticipation').countDocuments({electionId,status:'Valid'}),
  db.collection('candidates').countDocuments({electionId,status:'Active'})
 ]);
 const start=new Date(election.startTime),end=new Date(election.endTime);
 const prepared=election.keyProvisioningState==='Ready';
 const frozen=Number.isInteger(election.eligibleMembersSnapshot)&&
   election.eligibilityFrozenAt instanceof Date;
 let phase;
 if(election.status==='Finalized')phase='Finalized';
 else if(now>=end)phase='Closed';
 else if(now<start)phase=prepared?'Ready':'Setup';
 else phase=(prepared&&frozen)?'Open':'Blocked';
 const canEditCandidates=election.status==='Active'&&now<start&&
   election.keyProvisioningState==null;
 const canProvision=election.status==='Active'&&now<end&&
   election.keyProvisioningState==null;
 const canFinalize=election.status!=='Finalized'&&now>=end&&prepared;
 return {electionId,title:election.title,status:election.status,phase,
  startTime:election.startTime,endTime:election.endTime,
  candidateCount:candidates,confirmedCustodians,
  custodiansRequired:2,keysReady:prepared,
  eligibilityFrozen:frozen,
  eligibleMembers:frozen?election.eligibleMembersSnapshot:null,
  ballotsCast:recordedVotes,
  canEditCandidates,canProvision,canFinalize,
  finalizedAt:election.finalizedAt||null};
}
module.exports={getElectionLifecycle};
