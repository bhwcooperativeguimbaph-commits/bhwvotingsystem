'use strict';
// Aggregate turnout from valid ballots. Snapshot eligible membership at election
// start so subsequent member activation/deactivation does not rewrite history.
async function getElectionTurnout(db,electionId,now=new Date()){
 if(typeof electionId!=='string'||!electionId.trim())throw new TypeError('Election ID required');
 const elections=db.collection('elections');
 let election=await elections.findOne({electionId},{
  projection:{_id:0,electionId:1,title:1,status:1,startTime:1,eligibleMembersSnapshot:1}});
 if(!election)return null;
 const cast=await db.collection('ballots').countDocuments({electionId,status:'Valid'});
 let eligible=election.eligibleMembersSnapshot;
 if(!Number.isInteger(eligible)||eligible<0){
  const active=await db.collection('members').countDocuments({status:'Active'});
  eligible=active;
  if(election.startTime instanceof Date&&election.startTime<=now){
   await elections.updateOne({electionId,eligibleMembersSnapshot:{$exists:false}},
    {$set:{eligibleMembersSnapshot:active,eligibilityFrozenAt:now}});
   election=await elections.findOne({electionId},{
    projection:{_id:0,electionId:1,title:1,status:1,eligibleMembersSnapshot:1}});
   if(Number.isInteger(election?.eligibleMembersSnapshot))eligible=election.eligibleMembersSnapshot;
  }
 }
 return {electionId,title:election.title,eligibleMembers:eligible,ballotsCast:cast,
  turnoutPercent:eligible>0?Math.round(cast/eligible*10000)/100:0,
  eligibilityFrozen:Number.isInteger(election.eligibleMembersSnapshot)};
}
module.exports={getElectionTurnout};
