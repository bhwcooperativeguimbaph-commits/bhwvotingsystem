'use strict';
const assert=require('node:assert/strict');
const {validateMember,createMember,getMember,setMemberStatus}=require('../database/members');
async function run(){
 const stored=[];const db={collection(name){assert.equal(name,'members');return {
  insertOne:async d=>{stored.push(d);return {acknowledged:true}},
  findOne:async q=>stored.find(x=>x.memberId===q.memberId)||null,
  updateOne:async(q,u)=>{const d=stored.find(x=>x.memberId===q.memberId);if(!d)return {matchedCount:0};Object.assign(d,u.$set);return {matchedCount:1}}
 };}};
 const input={fullName:' Test  Member ',area:'Area 1',location:{country:'Philippines',regionCode:'030000000',provinceCode:'034900000',cityCode:'034913000',barangayCode:'034913001',province:'Nueva Ecija',city:'Guimba'}};
 assert.throws(()=>validateMember({...input,location:{...input.location,city:'Other'}}),/Guimba/);
 const {memberId}=await createMember(db,input);
 assert.match(memberId,/^MEM-/);
 assert.equal((await getMember(db,memberId)).fullName,'Test Member');
 assert.equal(await setMemberStatus(db,memberId,'Inactive'),true);
 assert.equal((await getMember(db,memberId)).status,'Inactive');
 assert.equal(await getMember(db,'missing'),null);
 console.log('PASS: MongoDB member adapter tests (mock database)');
}
run().catch(e=>{console.error(e);process.exitCode=1});
