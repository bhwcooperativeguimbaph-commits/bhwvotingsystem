'use strict';
// Unicast member events plus a durable broadcast for first result disclosure.
// No candidate choices, member-vote associations or custodian tokens are returned.
async function listMemberNotifications(db,memberId,{limit=100}={}){
 if(typeof memberId!=='string'||!/^MEM-[a-f0-9-]{36}$/i.test(memberId))
  throw new TypeError('Invalid member account');
 const member=await db.collection('members').findOne({memberId},
  {projection:{_id:0,createdAt:1}});
 if(!member)return [];
 const [personal,broadcasts]=await Promise.all([
  db.collection('memberInbox').find({memberId},{
   projection:{_id:0,notificationId:1,electionId:1,type:1,message:1,read:1,createdAt:1},
   sort:{createdAt:-1},limit}).toArray(),
  db.collection('resultAnnouncements').find(
   {createdAt:{$gte:member.createdAt instanceof Date?member.createdAt:new Date(0)}},
   {projection:{_id:0,notificationId:1,electionId:1,type:1,message:1,createdAt:1},
    sort:{createdAt:-1},limit}).toArray()
 ]);
 const ids=broadcasts.map(n=>n.notificationId);
 const readRecords=ids.length?await db.collection('announcementReads').find({
  memberId,notificationId:{$in:ids}
 },{projection:{_id:0,notificationId:1}}).toArray():[];
 const seen=new Set(readRecords.map(x=>x.notificationId));
 return [...personal,...broadcasts.map(n=>({...n,read:seen.has(n.notificationId)}))]
  .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,limit);
}
async function markMemberNotificationRead(db,memberId,notificationId,now=new Date()){
 if(typeof memberId!=='string'||!/^MEM-[a-f0-9-]{36}$/i.test(memberId)||
  typeof notificationId!=='string'||!/^NOTICE-[a-f0-9-]{36}$/i.test(notificationId))
  throw new TypeError('Invalid notification');
 const personal=await db.collection('memberInbox').updateOne(
  {memberId,notificationId},{$set:{read:true,readAt:now}});
 if(personal.matchedCount)return true;
 const [member,announcement]=await Promise.all([
  db.collection('members').findOne({memberId},{projection:{_id:0,createdAt:1}}),
  db.collection('resultAnnouncements').findOne({notificationId},
   {projection:{_id:0,createdAt:1}})
 ]);
 if(!member||!announcement||member.createdAt>announcement.createdAt)return false;
 await db.collection('announcementReads').updateOne(
  {memberId,notificationId},{$setOnInsert:{memberId,notificationId,readAt:now}},
  {upsert:true});
 return true;
}
module.exports={listMemberNotifications,markMemberNotificationRead};
