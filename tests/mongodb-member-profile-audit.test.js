'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {updateMemberProfileWithAudit}=require('../database/members');
const source=fs.readFileSync(path.join(__dirname,'..','mongo-auth-preview.js'),'utf8');
assert.match(source,/updateMemberProfileWithAudit\(connection,req.params.memberId/);
const id='MEM-00000000-0000-4000-8000-000000000001';
const location={country:'Philippines',province:'Nueva Ecija',city:'Guimba',
 regionCode:'0300000000',provinceCode:'0304900000',cityCode:'0304911000',
 barangayCode:'0304911001'};
(async()=>{
 const member={memberId:id,fullName:'Synthetic Person',area:'Sector A',
  location,status:'Active'};
 const audits=[];
 let changes=0;
 const db={collection(name){
  if(name==='members')return {
   findOne:async()=>member,
   updateOne:async (q,u,opts)=>{
    assert.ok(opts.session);changes++;Object.assign(member,u.$set);
    return {matchedCount:1};
   }
  };
  if(name==='auditLogs')return {insertOne:async(event,opts)=>{
   assert.ok(opts.session);audits.push(event);
  }};
  throw Error(name);
 }};
 const connection={db,client:{startSession:()=>({
  async withTransaction(work){await work()},async endSession(){}
 })}};
 const opts={validateLocation:async()=>true,operatorId:'SUPERADMIN',actorRole:'superadmin'};
 const updated=await updateMemberProfileWithAudit(connection,id,{
  fullName:'Renamed Synthetic Person',area:'Sector A',location
 },opts);
 assert.equal(updated.fullName,'Renamed Synthetic Person');
 assert.equal(changes,1);assert.equal(audits.length,1);
 assert.equal(audits[0].action,'MEMBER_PROFILE_UPDATED');
 assert.equal(audits[0].memberId,id);
 assert.equal(audits[0].operatorId,'SUPERADMIN');
 assert.ok(!JSON.stringify(audits[0]).includes('Renamed Synthetic Person'));
 await assert.rejects(updateMemberProfileWithAudit(connection,id,{
  fullName:'Outside',area:'Sector A',location:{...location,city:'Other'}
 },opts),TypeError);
 assert.equal(changes,1);assert.equal(audits.length,1);
 await assert.rejects(updateMemberProfileWithAudit(connection,id,{
  fullName:'Outside',area:'Sector A',location
 },{...opts,actorRole:'member'}),TypeError);
 console.log('PASS: member profile corrections require staff role and transaction-bound sanitized audits');
})().catch(e=>{console.error(e);process.exitCode=1});
