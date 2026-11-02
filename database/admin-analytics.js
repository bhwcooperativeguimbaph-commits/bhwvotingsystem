'use strict';
// Privacy-preserving aggregate analytics. Never expose individual participation,
// the vote ledger, member identifiers or encrypted choices to dashboard clients.
async function getAdminAnalytics(db){
 const election=await db.collection('elections').findOne({},{
  sort:{createdAt:-1},
  projection:{_id:0,electionId:1,title:1,status:1,startTime:1,endTime:1,eligibleMembersSnapshot:1}
 });
 if(!election)return {election:null,daily:[],areas:[],turnoutPercent:0,ballotsCast:0};
 const electionId=election.electionId;
 const daily=await db.collection('voterParticipation').aggregate([
  {$match:{electionId,status:'Valid'}},
  {$group:{_id:{$dateToString:{format:'%Y-%m-%d',date:'$createdAt',timezone:'+08:00'}},count:{$sum:1}}},
  {$sort:{_id:1}},{$limit:90}
 ]).toArray();
 const areaCounts=await db.collection('voterParticipation').aggregate([
  {$match:{electionId,status:'Valid'}},
  {$lookup:{from:'members',localField:'memberId',foreignField:'memberId',as:'member'}},
  {$unwind:'$member'},
  {$group:{_id:'$member.area',count:{$sum:1}}},
  {$match:{count:{$gte:3}}},
  {$sort:{count:-1}},{$limit:12}
 ]).toArray();
 const cast=await db.collection('voterParticipation').countDocuments({electionId,status:'Valid'});
 const eligible=Number.isInteger(election.eligibleMembersSnapshot)?election.eligibleMembersSnapshot:null;
 return {election:{electionId,title:election.title,status:election.status,startTime:election.startTime,
  endTime:election.endTime,eligibleMembers:eligible},
  ballotsCast:cast,turnoutPercent:eligible>0?Math.round(cast/eligible*10000)/100:0,
  daily:daily.map(x=>({date:x._id,count:x.count})),
  areas:areaCounts.filter(x=>typeof x._id==='string').map(x=>({area:x._id,count:x.count}))};
}
module.exports={getAdminAnalytics};
