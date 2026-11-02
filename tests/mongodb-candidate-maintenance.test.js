'use strict';
const assert=require('node:assert/strict');
const {editCandidate,validatePhoto}=require('../database/candidate-maintenance');
async function main(){
 const electionId='ELEC-00000000-0000-4000-8000-000000000001';
 const base=[
  {candidateId:'CAND-00000000-0000-4000-8000-000000000001',name:'Alpha',position:'Kagawad',maxVotes:1,status:'Active'},
  {candidateId:'CAND-00000000-0000-4000-8000-000000000002',name:'Beta',position:'Kagawad',maxVotes:1,status:'Active'},
  {candidateId:'CAND-00000000-0000-4000-8000-000000000003',name:'Gamma',position:'Kapitan',maxVotes:2,status:'Active'},
  {candidateId:'CAND-00000000-0000-4000-8000-000000000004',name:'Delta',position:'Kapitan',maxVotes:2,status:'Active'}];
 let electionLock=false,canEdit=true,ballotsExist=false,keysStarted=false;
 const db={collection(n){
  if(n==='elections')return {
   findOneAndUpdate:async q=>{
    assert.equal(q.keyProvisioningState.$exists,false);
    assert.equal(q.ballotPublicKeyPem.$exists,false);
    if(!canEdit||electionLock||keysStarted)return null;
    electionLock=true;return {electionId,status:'Active'};
   },updateOne:async()=>{electionLock=false;return {modifiedCount:1}}
  };
  if(n==='ballots')return {findOne:async()=>ballotsExist?{}:null};
  if(n==='candidates')return {
   find:()=>({toArray:async()=>base.filter(c=>c.status==='Active')}),
   updateOne:async (q,payload)=>{const c=base.find(c=>c.candidateId===q.candidateId&&c.status==='Active');if(!c)return {matchedCount:0,modifiedCount:0};Object.assign(c,payload.$set);return {matchedCount:1,modifiedCount:1}},
   insertOne:async c=>base.push(c)
  };
  throw Error(n);
 }};
 const args={electionId,now:new Date('2026-11-01T00:00:00Z')};
 assert.throws(()=>validatePhoto('data:image/svg+xml;base64,YWJj'),e=>e.code==='INVALID_CANDIDATE');
 await assert.rejects(editCandidate(db,{...args,operation:'add',position:'Kagawad',candidateName:'alpha'}),e=>e.code==='DUPLICATE_CANDIDATE');
 assert.equal(electionLock,false);
 await assert.rejects(editCandidate(db,{...args,operation:'remove',candidateId:base[2].candidateId}),e=>e.code==='INSUFFICIENT_CANDIDATES');
 assert.equal(base[2].status,'Active');
 const added=await editCandidate(db,{...args,operation:'add',position:'Kapitan',candidateName:'Epsilon'});
 assert.match(added.candidateId,/^CAND-/);
 const changed=await editCandidate(db,{...args,operation:'update',candidateId:base[1].candidateId,candidateName:'Beta Renamed'});
 assert.equal(changed.name,'Beta Renamed');assert.equal(base[1].name,'Beta Renamed');
 assert.equal(changed.status,'Active');
 await assert.rejects(editCandidate(db,{...args,operation:'update',candidateId:base[1].candidateId,candidateName:'alpha'}),e=>e.code==='DUPLICATE_CANDIDATE');
 assert.equal(base[1].name,'Beta Renamed');
 await assert.rejects(editCandidate(db,{...args,operation:'update',candidateId:base[1].candidateId,candidateName:'New',photo:'data:image/png;base64,YmFk'}),e=>e.code==='INVALID_CANDIDATE');
 assert.equal(base[1].name,'Beta Renamed');
 const gone=await editCandidate(db,{...args,operation:'remove',candidateId:base[2].candidateId});
 assert.equal(gone.status,'Removed');assert.equal(base[2].status,'Removed');
 ballotsExist=true;
 await assert.rejects(editCandidate(db,{...args,operation:'add',position:'Kagawad',candidateName:'Zeta'}),e=>e.code==='ELECTION_LOCKED');
 ballotsExist=false;keysStarted=true;
 await assert.rejects(editCandidate(db,{...args,operation:'add',position:'Kagawad',
  candidateName:'Added after custodian key start'}),e=>e.code==='ELECTION_LOCKED');
 keysStarted=false;canEdit=false;
 await assert.rejects(editCandidate(db,{...args,operation:'add',position:'Kagawad',candidateName:'Eta'}),e=>e.code==='ELECTION_LOCKED');
 console.log('PASS: individual candidate add/update/remove, duplicate-name/photo rejection and election edit guards');
}
main().catch(e=>{console.error(e);process.exitCode=1});
