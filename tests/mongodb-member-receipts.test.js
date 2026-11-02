'use strict';
const assert=require('node:assert/strict');
const {listMemberReceipts}=require('../database/member-receipts');
async function main(){
 const alice='MEM-00000000-0000-4000-8000-000000000001';
 const bob='MEM-00000000-0000-4000-8000-000000000002';
 const docs=[
  {memberId:alice,electionId:'ELEC-A',receiptCode:'BHW-'+'A'.repeat(32),status:'Valid',createdAt:new Date('2026-10-20')},
  {memberId:alice,electionId:'ELEC-B',receiptCode:'BHW-'+'B'.repeat(32),status:'Valid',createdAt:new Date('2026-10-22')},
  {memberId:bob,electionId:'ELEC-C',receiptCode:'BHW-'+'C'.repeat(32),status:'Valid',createdAt:new Date('2026-10-23')},
  {memberId:alice,electionId:'ELEC-D',receiptCode:'BHW-'+'D'.repeat(32),status:'Rejected',createdAt:new Date('2026-10-24')}
 ];
 const db={collection:name=>{
  assert.equal(name,'voterParticipation');
  return {find:(filter,opts)=>{
   assert.equal(filter.status,'Valid');
   assert.equal(opts.projection.memberId,undefined);
   assert.equal(opts.projection.encryptedVote,undefined);
   return {toArray:async()=>docs.filter(x=>x.memberId===filter.memberId&&x.status===filter.status)
    .sort((x,y)=>y.createdAt-x.createdAt).slice(0,opts.limit)};
  }};
 }};
 const own=await listMemberReceipts(db,alice);
 assert.equal(own.length,2);
 assert.equal(own[0].electionId,'ELEC-B');
 assert.equal(own[1].electionId,'ELEC-A');
 assert.equal(own.some(x=>x.electionId==='ELEC-C'),false);
 assert.equal(own.some(x=>x.electionId==='ELEC-D'),false);
 for(const entry of own){
  assert.equal('memberId' in entry,false);
  assert.equal('ballotId' in entry,false);
  assert.equal('encryptedVote' in entry,false);
  assert.equal('choices' in entry,false);
 }
 const other=await listMemberReceipts(db,bob);
 assert.equal(other.length,1);
 assert.equal(other[0].electionId,'ELEC-C');
 await assert.rejects(listMemberReceipts(db,'MEM-foreign'),/authenticated member ID/);
 await assert.rejects(listMemberReceipts(db,alice,{limit:1000}),/Invalid receipt limit/);
 console.log('PASS: Member-only historical receipts, privacy-safe projection, ordering and validation');
}
main().catch(e=>{console.error(e);process.exitCode=1});
