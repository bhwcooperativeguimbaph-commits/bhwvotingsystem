'use strict';
const assert=require('node:assert/strict');
const {updateMemberProfile}=require('../database/members');
async function main(){
 const memberId='MEM-00000000-0000-4000-8000-000000000001';
 const oldLocation={country:'Philippines',province:'Nueva Ecija',city:'Guimba',
  regionCode:'0300000000',provinceCode:'0304900000',cityCode:'0304911000',barangayCode:'0304911001'};
 const member={memberId,fullName:'Old Name',area:'Area One',location:oldLocation,status:'Active'};
 let edits=0;
 const db={collection(name){if(name==='members')return{
  findOne:async()=>member,updateOne:async(_,update)=>{Object.assign(member,update.$set);edits++;return{matchedCount:1}}
 };throw Error(name)}};
 await assert.rejects(updateMemberProfile(db,memberId,{fullName:'New Name',area:'Area Two',location:oldLocation},
  {validateLocation:async()=>false}),/verified/);
 assert.equal(edits,0);
 const updated=await updateMemberProfile(db,memberId,
  {fullName:'New Name',area:'Area Two',location:oldLocation},{validateLocation:async()=>true});
 assert.equal(updated.fullName,'New Name');assert.equal(member.status,'Active');
 assert.equal(edits,1);
 await assert.rejects(updateMemberProfile(db,memberId,
  {fullName:'Outside',area:'Area Two',location:{...oldLocation,city:'Quezon City'}},
  {validateLocation:async()=>true}),/Guimba/);
 assert.equal(edits,1);
 console.log('PASS: Member corrections require verified Guimba location and preserve status');
}
main().catch(e=>{console.error(e);process.exitCode=1});
