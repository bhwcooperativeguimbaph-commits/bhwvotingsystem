'use strict';
// Read-only receipt service. Receipt ownership is resolved from the server-
// verified member session, never from a submitted memberId or ballotId.
async function listMemberReceipts(db,memberId,{limit=25}={}){
 if(typeof memberId!=='string'||!/^MEM-[0-9a-f-]{36}$/i.test(memberId))
  throw new TypeError('An authenticated member ID is required');
 if(!Number.isInteger(limit)||limit<1||limit>50)throw new TypeError('Invalid receipt limit');
 const rows=await db.collection('voterParticipation').find(
  {memberId,status:'Valid'},
  {projection:{_id:0,electionId:1,receiptCode:1,createdAt:1},
   sort:{createdAt:-1},limit}).toArray();
 return rows.filter(row=>typeof row.receiptCode==='string').map(row=>({
  electionId:row.electionId,receiptNo:row.receiptCode,recordedAt:row.createdAt
 }));
}
module.exports={listMemberReceipts};
