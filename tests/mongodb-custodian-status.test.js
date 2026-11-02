'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {getCustodianDeliveryStatus}=require('../database/custodian-status');
const id='ELEC-00000000-0000-4000-8000-000000000001';
const server=fs.readFileSync(path.join(__dirname,'..','mongo-auth-preview.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'..','public/mongo-admin-console.html'),'utf8');
assert.match(server,/app\.get\('\/api\/superadmin\/elections\/:electionId\/custodians',superadminOnly/);
assert.match(ui,/id="checkCustodianStatus"/);
assert.match(ui,/id="custodianStatus"/);
assert.match(ui,/await showCustodianStatus\(\)/);
async function run(){
 await assert.rejects(getCustodianDeliveryStatus({},'invalid'),TypeError);
 const secrets={shareHash:'SHOULD_NOT_LEAK',providerMessageId:'PROVIDER_SECRET'};
 const read=[];
 const db={collection(name){
  if(name==='elections')return {findOne:async()=>({electionId:id,
   keyProvisioningState:'Ready',keyDeliveryConfirmed:false})};
  if(name==='keyCustodians')return {find:(filter,opts)=>{
   read.push(opts.projection);
   assert.equal(filter.electionId,id);
   return {toArray:async()=>[{shareIndex:1,email:'custodian1@example.test',
    status:'Sent',deliveryAcceptedAt:new Date(),...secrets},
    {shareIndex:2,email:'custodian2@example.test',status:'Confirmed',
     confirmedAt:new Date(),...secrets}]};
  }};
  throw Error(name);
 }};
 const result=await getCustodianDeliveryStatus(db,id);
 assert.equal(result.custodians.length,2);
 assert.equal(result.bothConfirmed,false);
 assert.equal(result.provisioning,'Ready');
 assert.equal(result.custodians[0].status,'Sent');
 assert.equal(result.custodians[1].status,'Confirmed');
 assert.equal(read[0].shareHash,undefined);
 assert.equal(read[0].providerMessageId,undefined);
 assert.ok(!JSON.stringify(result).includes('SHOULD_NOT_LEAK'));
 assert.ok(!JSON.stringify(result).includes('PROVIDER_SECRET'));
 console.log('PASS: Super Admin custodian status is projected, role-protected and secret-free');
}
run().catch(e=>{console.error(e);process.exitCode=1});
