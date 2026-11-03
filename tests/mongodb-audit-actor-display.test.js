'use strict';
const assert=require('node:assert/strict');
const {displayAuditAccounts}=require('../database/audit-actor-display');
const admin='ADM-00000000-0000-4000-8000-000000000001';
const member='MEM-00000000-0000-4000-8000-000000000002';
(async()=>{
 const db={collection(name){
  if(name==='admins')return {find:()=>({toArray:async()=>[
   {adminId:admin,fullName:'Admin Example'},
   {adminId:'SUPERADMIN',fullName:'Super Administrator'}
  ]})};
  if(name==='members')return {find:()=>({toArray:async()=>[
   {memberId:member,fullName:'Member Example'}
  ]})};
  throw Error(name);
 }};
 const logs=[
  {action:'CANDIDATE_UPDATED',actorRole:'admin',operatorId:admin},
  {action:'SUPERADMIN_EMAIL_CHANGED',actorRole:'superadmin',actorId:'SUPERADMIN'},
  {action:'MEMBER_PROFILE_UPDATED',actorRole:'member',actorId:member},
  {action:'ELECTION_CREATED',actorRole:'staff'},
  {action:'BALLOT_CAST',actorRole:'member',actorId:member}
 ];
 const named=await displayAuditAccounts(db,logs);
 assert.equal(named[0].actorName,'Admin Example');
 assert.equal(named[1].actorName,'Super Administrator');
 assert.equal(named[2].actorName,'Member Example');
 assert.equal(named[3].actorName,null);
 assert.equal(named[4].actorName,'Anonymous member');
 assert.ok(!JSON.stringify(named[4]).includes('Member Example'),'Vote must never identify member');
 console.log('PASS: exact names for audited actors, honest historic fallback and anonymous ballot privacy');
})().catch(e=>{console.error(e);process.exitCode=1});
