'use strict';
const assert=require('node:assert/strict');
const {findFaceMatch}=require('../database/face-matching');
const face=n=>Array(128).fill(n);
async function run(){
 let records=[{memberId:'m1',biometricStatus:'Active',facialEncoding:face(0)}];
 let members=[{memberId:'m1',fullName:'Test Member',status:'Active'}];
 const db={collection(name){
  if(name==='biometricRegistrations')return {find:()=>({toArray:async()=>records})};
  if(name==='members')return {findOne:async q=>members.find(m=>m.memberId===q.memberId&&m.status===q.status)||null};
  if(name==='admins')return {findOne:async()=>null};
 }};
 const decoder=x=>x;
 assert.deepEqual(await findFaceMatch(db,face(0),decoder),{match:{accountId:'m1',role:'member',fullName:'Test Member'},ambiguous:false});
 assert.deepEqual(await findFaceMatch(db,face(5),decoder),{match:null,ambiguous:false});
 records.push({memberId:'m2',biometricStatus:'Active',facialEncoding:face(0.001)});
 members.push({memberId:'m2',fullName:'Other',status:'Active'});
 assert.equal((await findFaceMatch(db,face(0),decoder)).ambiguous,true);
 members[1].status='Inactive';
 assert.equal((await findFaceMatch(db,face(0),decoder)).match.accountId,'m1');
 await assert.rejects(findFaceMatch(db,[0],decoder),/Invalid/);
 console.log('PASS: MongoDB face matcher tests');
}
run().catch(e=>{console.error(e);process.exitCode=1});
