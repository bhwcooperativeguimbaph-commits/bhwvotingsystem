'use strict';
const assert=require('node:assert/strict');
const {listMemberNotifications,markMemberNotificationRead}=require('../database/member-notifications');
const memberId='MEM-00000000-0000-4000-8000-000000000001';
const newer='MEM-00000000-0000-4000-8000-000000000002';
const notice='NOTICE-00000000-0000-4000-8000-000000000003';
const release=new Date('2026-11-01T10:00:00Z');
let marked=false;
const db={collection(name){
 if(name==='members')return {findOne:async q=>({createdAt:
  q.memberId===memberId?new Date('2026-10-01T00:00:00Z'):new Date('2026-11-02T00:00:00Z')})};
 if(name==='memberInbox')return{
  find:()=>({toArray:async()=>[{notificationId:'NOTICE-00000000-0000-4000-8000-000000000004',
   electionId:'E1',type:'BALLOT_RECEIPT',message:'Ballot recorded',read:false,
   createdAt:new Date('2026-11-01T09:00:00Z')}]}),
  updateOne:async()=>({matchedCount:0})
 };
 if(name==='resultAnnouncements')return {
  find:q=>({toArray:async()=>release>=q.createdAt.$gte?[{
   notificationId:notice,type:'RESULTS_PUBLISHED',message:'Verified election results are now available',
   electionId:'E1',createdAt:release}]:[]}),
  findOne:async()=>({createdAt:release})
 };
 if(name==='announcementReads')return{
  find:()=>({toArray:async()=>marked?[{notificationId:notice}]:[]}),
  updateOne:async(q,u,opts)=>{assert.equal(q.memberId,memberId);
   assert.equal(q.notificationId,notice);assert.equal(opts.upsert,true);
   marked=true;return{upsertedCount:1}}
 };
 throw Error(name)
}};
async function main(){
 let notes=await listMemberNotifications(db,memberId);
 assert.equal(notes.length,2);
 assert.equal(notes[0].notificationId,notice);
 assert.equal(notes[0].read,false);
 assert.equal(notes[0].type,'RESULTS_PUBLISHED');
 assert.ok(!JSON.stringify(notes).includes('BHW1.'));
 const after=await listMemberNotifications(db,newer);
 assert.equal(after.some(x=>x.type==='RESULTS_PUBLISHED'),false);
 assert.equal(await markMemberNotificationRead(db,memberId,notice),true);
 notes=await listMemberNotifications(db,memberId);
 assert.equal(notes[0].read,true);
 await assert.rejects(markMemberNotificationRead(db,memberId,'invalid'),/Invalid notification/);
 console.log('PASS: First-publication results appear in preexisting member accounts once, with individual read state');
}
main().catch(e=>{console.error(e);process.exitCode=1});
