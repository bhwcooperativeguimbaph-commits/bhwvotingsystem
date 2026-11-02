'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {setMemberStatusWithAudit}=require('../database/members');
const server=fs.readFileSync(path.join(__dirname,'..','mongo-auth-preview.js'),'utf8');
assert.match(server,/setMemberStatusWithAudit\(connection,memberId,status/);
const id='MEM-00000000-0000-4000-8000-000000000001';
async function run(){
 let state='Inactive',frozen=false,audits=[],failedAudit=false;
 const db={collection(name){
  if(name==='members')return {
   findOne:async()=>({memberId:id,status:state}),
   updateOne:async(q,p,opts)=>{assert.ok(opts.session);state=p.$set.status;return {matchedCount:1}}
  };
  if(name==='elections')return {findOne:async()=>frozen?{_id:1}:null};
  if(name==='auditLogs')return {insertOne:async(doc,opts)=>{
   assert.ok(opts.session);
   if(failedAudit)throw Error('failed audit');
   audits.push(doc);
  }};
  throw Error(name);
 }};
 const conn={db,client:{startSession:()=>({
  async withTransaction(fn){await fn()},async endSession(){}
 })}};
 const ctx={operatorId:'SUPERADMIN',actorRole:'superadmin',now:new Date('2027-01-01')};
 await setMemberStatusWithAudit(conn,id,'Active',ctx);
 assert.equal(state,'Active');
 assert.equal(audits[0].action,'MEMBER_STATUS_CHANGED');
 assert.equal(audits[0].operatorId,'SUPERADMIN');
 assert.equal(audits[0].memberId,id);
 frozen=true;
 await setMemberStatusWithAudit(conn,id,'Inactive',ctx);
 assert.equal(state,'Inactive');
 await assert.rejects(setMemberStatusWithAudit(conn,id,'Active',ctx),e=>e.code==='ELECTORATE_FROZEN');
 assert.equal(audits.length,2);
 await assert.rejects(setMemberStatusWithAudit(conn,id,'Active',{...ctx,actorRole:'member'}),TypeError);
 assert.ok(audits.every(x=>!('choices' in x)&&!('descriptor' in x)));
 // The actual MongoDB integration verifies transaction rollback; this mock
 // verifies failure is not reported as success on an audit insert exception.
 frozen=false;failedAudit=true;
 await assert.rejects(setMemberStatusWithAudit(conn,id,'Active',ctx),/failed audit/);
 console.log('PASS: protected member status mutations write bounded secret-free audit entries');
}
run().catch(e=>{console.error(e);process.exitCode=1});
