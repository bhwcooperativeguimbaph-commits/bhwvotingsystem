'use strict';
const assert=require('node:assert/strict');
const {setMemberStatus}=require('../database/members');
const memberId='MEM-00000000-0000-4000-8000-000000000001';
let state='Inactive',frozen=false,updates=0;
const db={collection(name){
 if(name==='members')return{
  findOne:async()=>({memberId,status:state}),
  updateOne:async(_,changes)=>{updates++;state=changes.$set.status;return{matchedCount:1}}
 };
 if(name==='elections')return{findOne:async q=>{
  assert.equal(q.status,'Active');
  assert.equal(q.eligibilityFrozenAt.$exists,true);
  return frozen?{_id:'frozen'}:null;
 }};
 throw Error(name);
}};
async function main(){
 const now=new Date('2027-01-01T00:00:00Z');
 assert.equal(await setMemberStatus(db,memberId,'Active',{now}),true);
 assert.equal(state,'Active');
 frozen=true;
 // Deactivation must remain possible if an account is compromised.
 assert.equal(await setMemberStatus(db,memberId,'Inactive',{now}),true);
 assert.equal(state,'Inactive');
 await assert.rejects(setMemberStatus(db,memberId,'Active',{now}),
  e=>e.code==='ELECTORATE_FROZEN');
 assert.equal(state,'Inactive');
 assert.equal(updates,2);
 frozen=false;
 assert.equal(await setMemberStatus(db,memberId,'Active',{now}),true);
 console.log('PASS: Frozen electorates prevent new activation but still allow immediate deactivation');
}
main().catch(e=>{console.error(e);process.exitCode=1});
