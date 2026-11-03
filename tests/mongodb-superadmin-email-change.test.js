'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {requestSuperadminEmailChange,completeSuperadminEmailChange}=
 require('../database/superadmin-email-change');
const source=fs.readFileSync(path.join(__dirname,'..','mongo-auth-preview.js'),'utf8');
const page=fs.readFileSync(path.join(__dirname,'..','public','mongo-admin-console.html'),'utf8');
const schema=fs.readFileSync(path.join(__dirname,'..','database','mongodb.js'),'utf8');
for(const route of ['/api/superadmin/email-change/request','/api/superadmin/email-change/confirm']){
 assert.match(source,new RegExp("app.post\\('"+route+"',superadminOnly,rateLimit"));
}
assert.match(source,/req.staff=auth;next\(\)/);
assert.match(schema,/adminEmailChangeChallenges/);
assert.match(schema,/adminEmailChangeCooldowns/);
for(const id of ['superadminRecovery','newRecoveryEmail','oldRecoveryCode','newRecoveryCode',
 'recoveryVerifyPanel','recoveryChangeStatus']){
 assert.ok(page.includes('id="'+id+'"'),'Missing recovery UI '+id);
}
function hash(value){return crypto.createHash('sha256').update(value).digest('hex')}
(async()=>{
 const now=new Date('2026-11-02T00:00:00Z');
 const current={adminId:'SUPERADMIN',role:'superadmin',email:'old@example.test',status:'Active'};
 const challenges=[],sent=[],events=[];
 let revoked=false;
 const db={collection(name){
  if(name==='admins')return {
   async findOne(q){if(q.adminId)return current;return q.email===current.email?current:null},
   async updateOne(q,u){assert.equal(q.adminId,'SUPERADMIN');assert.equal(q.email,'old@example.test');
    current.email=u.$set.email;return {matchedCount:1,modifiedCount:1}}
  };
  if(name==='adminEmailChangeCooldowns')return {
   async updateOne(){return {matchedCount:1}},
   async findOneAndUpdate(){return {adminId:'SUPERADMIN'}}
  };
  if(name==='adminEmailChangeChallenges')return {
   async insertOne(doc){challenges.push(doc)},
   async deleteOne(){return {deletedCount:1}},
   async findOneAndUpdate(q){const c=challenges.find(x=>x.challengeHash===q.challengeHash);
    if(!c||c.adminId!==q.adminId||c.consumed||c.expiresAt<=q.expiresAt.$gt||c.attempts>=5)return null;
    c.attempts++;return {...c}},
   async updateOne(q,update){const c=challenges.find(x=>x.challengeHash===q.challengeHash);
    if(!c||c.consumed)return {modifiedCount:0};c.consumed=true;return {modifiedCount:1}}
  };
  if(name==='authSessions')return {async deleteMany(q){assert.equal(q.accountId,'SUPERADMIN');revoked=true;return {deletedCount:2}}};
  if(name==='auditLogs')return {async insertOne(doc){events.push(doc)}};
  throw Error('unexpected collection '+name);
 }};
 const connection={db,client:{startSession(){return {async withTransaction(work){await work()},async endSession(){}}}}};
 const deliver=async message=>sent.push(message);
 await assert.rejects(requestSuperadminEmailChange(db,{adminId:'SUPERADMIN',newEmail:'old@example.test',deliver,now}),
  e=>e.code==='INVALID_EMAIL_CHANGE');
 const first=await requestSuperadminEmailChange(db,{adminId:'SUPERADMIN',newEmail:'new@example.test',deliver,now});
 assert.match(first.challenge,/^[a-f0-9]{64}$/);
 assert.equal(sent.length,2);
 assert.deepEqual(sent.map(x=>x.to),['old@example.test','new@example.test']);
 const codes=sent.map(x=>x.text.match(/\b\d{6}\b/)[0]);
 assert.deepEqual(sent.map(x=>x.text),codes,'Email bodies must contain only one six-digit code each');
 assert.notEqual(challenges[0].oldCodeHash,codes[0]);
 assert.equal(challenges[0].oldCodeHash,hash(codes[0]));
 assert.equal(challenges[0].newCodeHash,hash(codes[1]));
 assert.ok(!JSON.stringify(challenges[0]).includes(first.challenge));
 await assert.rejects(completeSuperadminEmailChange(connection,{
  adminId:'SUPERADMIN',challenge:first.challenge,oldCode:'000000',newCode:codes[1],now
 }),e=>e.code==='INVALID_EMAIL_CHANGE');
 assert.equal(current.email,'old@example.test');
 assert.equal(revoked,false);
 const result=await completeSuperadminEmailChange(connection,{
  adminId:'SUPERADMIN',challenge:first.challenge,oldCode:codes[0],newCode:codes[1],now
 });
 assert.equal(result.ok,true);
 assert.equal(current.email,'new@example.test');
 assert.equal(revoked,true);
 assert.equal(events.length,1);
 assert.equal(events[0].action,'SUPERADMIN_EMAIL_CHANGED');
 assert.ok(!JSON.stringify(events[0]).includes('example.test'),'Audit event must not contain email addresses');
 await assert.rejects(completeSuperadminEmailChange(connection,{
  adminId:'SUPERADMIN',challenge:first.challenge,oldCode:codes[0],newCode:codes[1],now
 }),e=>e.code==='INVALID_EMAIL_CHANGE');
 console.log('PASS: dual-email verification, hash-only OTPs, replay rejection, session revocation and audited update');
})().catch(e=>{console.error(e);process.exitCode=1});
