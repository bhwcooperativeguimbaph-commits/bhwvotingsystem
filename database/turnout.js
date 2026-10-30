'use strict';
// Aggregate turnout from actual stored ballots. Do not expose voter or vote choices.
async function getElectionTurnout(db, electionId) {
 if(typeof electionId!=='string'||!electionId.trim())throw new TypeError('Election ID required');
 const election=await db.collection('elections').findOne({electionId},{projection:{_id:0,electionId:1,title:1,status:1}});
 if(!election)return null;
 const [eligible,cast]=await Promise.all([
  db.collection('members').countDocuments({status:'Active'}),
  db.collection('ballots').countDocuments({electionId,status:'Valid'})
 ]);
 return {electionId,title:election.title,eligibleMembers:eligible,ballotsCast:cast,
  turnoutPercent:eligible>0?Math.round(cast/eligible*10000)/100:0};
}
module.exports={getElectionTurnout};
