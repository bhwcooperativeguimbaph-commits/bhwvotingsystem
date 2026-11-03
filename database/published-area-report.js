'use strict';
// Published-only turnout by member area. No candidate selection is grouped by
// area: anonymous ballots contain no recoverable voter-to-choice relationship.
const ID=/^ELEC-[0-9a-f-]{36}$/i;
async function publishedAreaTurnout(db,electionId){
 if(typeof electionId!=='string'||!ID.test(electionId))
  throw new TypeError('Invalid election ID');
 const election=await db.collection('elections').findOne(
  {electionId,status:'Finalized'},
  {projection:{_id:0,electionId:1,eligibleMembersSnapshot:1}});
 if(!election)return null;
 const report=await db.collection('finalReports').findOne({electionId},
  {projection:{_id:0,ballotsCast:1,publishedAt:1}});
 if(!report)return null;
 const areas=await db.collection('voterParticipation').aggregate([
  {$match:{electionId,status:'Valid'}},
  {$lookup:{from:'members',localField:'memberId',foreignField:'memberId',as:'member'}},
  {$unwind:'$member'},
  {$group:{_id:'$member.area',votesCast:{$sum:1}}},
  {$match:{votesCast:{$gte:3}}},
  {$sort:{_id:1}}
 ]).toArray();
 return {electionId,ballotsCast:report.ballotsCast,
  eligibleMembers:Number.isInteger(election.eligibleMembersSnapshot)?
   election.eligibleMembersSnapshot:null,
  areas:areas.filter(x=>typeof x._id==='string'&&Number.isInteger(x.votesCast)&&x.votesCast>=3).map(x=>({
   area:x._id,votesCast:x.votesCast
  })),minimumPublishedAreaSize:3,publishedAt:report.publishedAt};
}
module.exports={publishedAreaTurnout};
