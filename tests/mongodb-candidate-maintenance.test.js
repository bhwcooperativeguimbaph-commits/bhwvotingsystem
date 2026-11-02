'use strict';
const assert=require('node:assert/strict');
const {editCandidate,validatePhoto}=require('../database/candidate-maintenance');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const api=fs.readFileSync(path.join(root,'mongo-auth-preview.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'public/mongo-admin-console.html'),'utf8');
assert.match(api,/app\.patch\('\/api\/admin\/elections\/:electionId\/candidates\/:candidateId',staffOnly/);
for(const id of ['candidateEditDialog','candidateEditContext','editCandidateName','editCandidatePhoto','candidateEditError','saveCandidateEdit']){
 assert.match(ui,new RegExp('id="'+id+'"'));
}
assert.match(ui,/openCandidateEditor\(id,c\)/);
assert.match(ui,/encodeCandidatePhoto\(by\('editCandidatePhoto'\)\)/);

async function main(){
 const electionId='ELEC-00000000-0000-4000-8000-000000000001';
 const base=[
  {candidateId:'CAND-00000000-0000-4000-8000-000000000001',name:'Alpha',position:'Kagawad',maxVotes:1,status:'Active'},
  {candidateId:'CAND-00000000-0000-4000-8000-000000000002',name:'Beta',position:'Kagawad',maxVotes:1,status:'Active'},
  {candidateId:'CAND-00000000-0000-4000-8000-000000000003',name:'Gamma',position:'Kapitan',maxVotes:2,status:'Active'},
  {candidateId:'CAND-00000000-0000-4000-8000-000000000004',name:'Delta',position:'Kapitan',maxVotes:2,status:'Active'}];
 let electionLock=false,canEdit=true,ballotsExist=false,keysStarted=false;
 const auditRows=[];
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
  if(n==='auditLogs')return {insertOne:async (event,options)=>{
   assert.ok(options.session);auditRows.push(event);
  }};
  if(n==='candidates')return {
   find:()=>({toArray:async()=>base.filter(c=>c.status==='Active')}),
   updateOne:async (q,payload)=>{const c=base.find(c=>c.candidateId===q.candidateId&&c.status==='Active');if(!c)return {matchedCount:0,modifiedCount:0};Object.assign(c,payload.$set);return {matchedCount:1,modifiedCount:1}},
   insertOne:async c=>base.push(c)
  };
  throw Error(n);
 }};
 const connection={db,client:{startSession(){return {
  async withTransaction(work){await work()},async endSession(){}
 }}}};
 const args={electionId,operatorId:'SUPERADMIN',actorRole:'superadmin',
  now:new Date('2026-11-01T00:00:00Z')};
 assert.throws(()=>validatePhoto('data:image/svg+xml;base64,YWJj'),e=>e.code==='INVALID_CANDIDATE');
 await assert.rejects(editCandidate(connection,{...args,operation:'add',position:'Kagawad',candidateName:'alpha'}),e=>e.code==='DUPLICATE_CANDIDATE');
 assert.equal(electionLock,false);
 await assert.rejects(editCandidate(connection,{...args,operation:'remove',candidateId:base[2].candidateId}),e=>e.code==='INSUFFICIENT_CANDIDATES');
 assert.equal(base[2].status,'Active');
 const added=await editCandidate(connection,{...args,operation:'add',position:'Kapitan',candidateName:'Epsilon'});
 assert.match(added.candidateId,/^CAND-/);
 const changed=await editCandidate(connection,{...args,operation:'update',candidateId:base[1].candidateId,candidateName:'Beta Renamed'});
 assert.equal(changed.name,'Beta Renamed');assert.equal(base[1].name,'Beta Renamed');
 assert.equal(changed.status,'Active');
 await assert.rejects(editCandidate(connection,{...args,operation:'update',candidateId:base[1].candidateId,candidateName:'alpha'}),e=>e.code==='DUPLICATE_CANDIDATE');
 assert.equal(base[1].name,'Beta Renamed');
 await assert.rejects(editCandidate(connection,{...args,operation:'update',candidateId:base[1].candidateId,candidateName:'New',photo:'data:image/png;base64,YmFk'}),e=>e.code==='INVALID_CANDIDATE');
 assert.equal(base[1].name,'Beta Renamed');
 const gone=await editCandidate(connection,{...args,operation:'remove',candidateId:base[2].candidateId});
 assert.equal(gone.status,'Removed');assert.equal(base[2].status,'Removed');
 assert.deepEqual(auditRows.map(x=>x.action),
  ['CANDIDATE_ADDED','CANDIDATE_UPDATED','CANDIDATE_REMOVED']);
 assert.ok(auditRows.every(x=>x.operatorId==='SUPERADMIN'&&
  x.actorRole==='superadmin'&&x.electionId===electionId&&x.outcome==='success'));
 assert.equal(auditRows.length,3,'Rejected changes must not create success audits');
 ballotsExist=true;
 await assert.rejects(editCandidate(connection,{...args,operation:'add',position:'Kagawad',candidateName:'Zeta'}),e=>e.code==='ELECTION_LOCKED');
 ballotsExist=false;keysStarted=true;
 await assert.rejects(editCandidate(connection,{...args,operation:'add',position:'Kagawad',
  candidateName:'Added after custodian key start'}),e=>e.code==='ELECTION_LOCKED');
 keysStarted=false;canEdit=false;
 await assert.rejects(editCandidate(connection,{...args,operation:'add',position:'Kagawad',candidateName:'Eta'}),e=>e.code==='ELECTION_LOCKED');
 console.log('PASS: individual candidate add/update/remove, duplicate-name/photo rejection and election edit guards');
}
main().catch(e=>{console.error(e);process.exitCode=1});
