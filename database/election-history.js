'use strict';
// Read-only administrative election history. Derive public-report state from
// finalized aggregate reports and participation from the anonymous-ballot-safe
// voterParticipation ledger; never expose member identities or vote choices.
async function listElectionHistory(db,{limit=30,now=new Date()}={}){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new TypeError('Invalid history limit');
 const elections=await db.collection('elections').find({},{
  projection:{_id:0,electionId:1,title:1,status:1,startTime:1,endTime:1,createdAt:1,
   eligibleMembersSnapshot:1,archivedAt:1},
  sort:{createdAt:-1},limit
 }).toArray();
 if(!elections.length)return [];
 const ids=elections.map(e=>e.electionId);
 const [accepted,finalReports]=await Promise.all([
  db.collection('voterParticipation').aggregate([
   {$match:{electionId:{$in:ids},status:'Valid'}},
   {$group:{_id:'$electionId',ballotsCast:{$sum:1}}}
  ]).toArray(),
  db.collection('finalReports').find({electionId:{$in:ids}},{
   projection:{_id:0,electionId:1,publishedAt:1}
  }).toArray()
 ]);
 const ballots=new Map(accepted.map(x=>[x._id,x.ballotsCast]));
 const finalized=new Map(finalReports.map(x=>[x.electionId,x]));
 return elections.map(e=>{
  const count=ballots.get(e.electionId)||0;
  const eligible=Number.isInteger(e.eligibleMembersSnapshot)&&e.eligibleMembersSnapshot>=0?
   e.eligibleMembersSnapshot:null;
  const publication=e.status==='Finalized'?finalized.get(e.electionId):null;
  return {
   electionId:e.electionId,title:e.title,status:e.status,startTime:e.startTime,endTime:e.endTime,
   archived:Boolean(e.archivedAt),archivedAt:e.archivedAt||null,
   // Server-authoritative close state prevents device clock disagreement.
   ended:Number.isFinite(new Date(e.endTime).getTime())&&new Date(e.endTime)<=now,
   ballotsCast:count,eligibleMembers:eligible,
   turnoutPercent:eligible>0?Math.round(count/eligible*10000)/100:null,
   published:Boolean(publication),publishedAt:publication?.publishedAt||null
  };
 });
}
module.exports={listElectionHistory};
