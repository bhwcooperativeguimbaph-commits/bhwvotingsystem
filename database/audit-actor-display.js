'use strict';
// Resolve account names only in the protected staff audit endpoint.
// Historical events without an actor identifier stay explicitly unattributed.
// BALLOT_CAST is deliberately anonymous and never linked to the voting member.
async function displayAuditAccounts(db,logs){
 const adminIds=new Set(),memberIds=new Set();
 for(const log of logs){
  const id=log.operatorId||log.actorId;
  if(id==='SUPERADMIN'||/^ADM-[0-9a-f-]{36}$/i.test(id||''))adminIds.add(id);
  else if(log.action!=='BALLOT_CAST'&&/^MEM-[0-9a-f-]{36}$/i.test(id||''))memberIds.add(id);
 }
 const [admins,members]=await Promise.all([
  adminIds.size?db.collection('admins').find({adminId:{$in:[...adminIds]}},
   {projection:{_id:0,adminId:1,fullName:1,username:1}}).toArray():[],
  memberIds.size?db.collection('members').find({memberId:{$in:[...memberIds]}},
   {projection:{_id:0,memberId:1,fullName:1}}).toArray():[]
 ]);
 const names=new Map([
  ...admins.map(a=>[a.adminId,a.fullName||a.username]),
  ...members.map(m=>[m.memberId,m.fullName])
 ]);
 return logs.map(log=>{
  const id=log.operatorId||log.actorId;
  const actorName=log.action==='BALLOT_CAST'?'Anonymous member':
   id?names.get(id)||((log.actorRole==='superadmin'&&id==='SUPERADMIN')?'Super Administrator':null):null;
  // Do not fabricate an exact name from a role-only historic audit entry.
  return {...log,actorName:actorName||null};
 });
}
module.exports={displayAuditAccounts};
