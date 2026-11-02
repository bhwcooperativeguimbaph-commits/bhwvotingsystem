'use strict';
const assert=require('node:assert/strict');
const {ensureStagingSuperadmin}=require('../database/staging-bootstrap');
const {verifyPassword}=require('../database/admin-auth');
async function main(){
 const admin=[];
 function connect(databaseName){
  return {databaseName,collection:()=>({
   findOne:async q=>admin.find(a=>a.role===q.role)||null,
   insertOne:async doc=>{if(admin.length)throw Object.assign(new Error('duplicate'),{code:11000});admin.push(doc)}
  })};
 }
 const secrets={INITIAL_SUPERADMIN_USERNAME:'stageadmin',
  INITIAL_SUPERADMIN_EMAIL:'staging-admin@example.test',
  INITIAL_SUPERADMIN_PASSWORD:'Secure-Staging-Password-2027'};
 assert.equal((await ensureStagingSuperadmin(connect('BHWVotingDB'),secrets)).status,'skipped-nonstaging');
 assert.equal(admin.length,0);
 assert.equal((await ensureStagingSuperadmin(connect('BHWVotingDB_Staging'),{})).status,'missing-configuration');
 assert.equal((await ensureStagingSuperadmin(connect('BHWVotingDB_Staging'),
  {...secrets,INITIAL_SUPERADMIN_PASSWORD:'weak'})).status,'invalid-configuration');
 assert.equal(admin.length,0);
 assert.equal((await ensureStagingSuperadmin(connect('BHWVotingDB_Staging'),secrets)).status,'created');
 assert.equal(admin.length,1);
 assert.equal(admin[0].role,'superadmin');
 assert.equal(verifyPassword(secrets.INITIAL_SUPERADMIN_PASSWORD,admin[0].passwordHash),true);
 assert.notEqual(admin[0].passwordHash,secrets.INITIAL_SUPERADMIN_PASSWORD);
 assert.equal((await ensureStagingSuperadmin(connect('BHWVotingDB_Staging'),
  {...secrets,INITIAL_SUPERADMIN_PASSWORD:'Different-Password-2027'})).status,'already-provisioned');
 assert.equal(verifyPassword(secrets.INITIAL_SUPERADMIN_PASSWORD,admin[0].passwordHash),true);
 console.log('PASS: staging-only Super Admin bootstrap is idempotent and never resets credentials');
}
main().catch(e=>{console.error(e);process.exitCode=1});
