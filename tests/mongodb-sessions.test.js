'use strict';
const assert=require('node:assert/strict');
const {issueSession,authenticateSession,revokeSession,hashToken}=require('../database/sessions');
async function main(){
 const sessions=[];const members=[{memberId:'m1',status:'Active'}];
 const admins=[{adminId:'a1',role:'admin',status:'Active'}];
 const db={collection(name){
  if(name==='authSessions')return {
   insertOne:async item=>{sessions.push(item);return {acknowledged:true}},
   findOne:async q=>sessions.find(x=>x.tokenHash===q.tokenHash && x.expiresAt>q.expiresAt.$gt)||null,
   deleteOne:async q=>{let i=sessions.findIndex(x=>x.tokenHash===q.tokenHash);if(i<0)return {deletedCount:0};sessions.splice(i,1);return {deletedCount:1}}
  };
  if(name==='members')return {findOne:async q=>members.find(x=>x.memberId===q.memberId && x.status===q.status)||null};
  if(name==='admins')return {findOne:async q=>admins.find(x=>x.adminId===q.adminId && x.status===q.status)||null};
  throw Error('unexpected collection '+name);
 }};
 const {token}=await issueSession(db,{accountId:'m1',role:'member'});
 assert.equal(sessions.length,1);assert.equal(sessions[0].tokenHash,hashToken(token));assert.notEqual(sessions[0].tokenHash,token);
 assert.deepEqual(await authenticateSession(db,token),{accountId:'m1',role:'member'});
 assert.equal(await authenticateSession(db,'invalid'),null);
 const {token:staffToken}=await issueSession(db,{accountId:'a1',role:'admin'});
 assert.deepEqual(await authenticateSession(db,staffToken),{accountId:'a1',role:'admin'});
 admins[0].role='superadmin';
 assert.equal(await authenticateSession(db,staffToken),null,'Stale staff role must never grant access');
 admins[0].role='admin';
 assert.deepEqual(await authenticateSession(db,staffToken),{accountId:'a1',role:'admin'});
 admins[0].status='Inactive';
 assert.equal(await authenticateSession(db,staffToken),null,'Inactive admin must be denied');
 members[0].status='Inactive';assert.equal(await authenticateSession(db,token),null);
 members[0].status='Active';assert.equal(await revokeSession(db,token),true);
 assert.equal(await authenticateSession(db,token),null);
 console.log('PASS: MongoDB session adapter tests');
}
main().catch(e=>{console.error(e);process.exitCode=1});
