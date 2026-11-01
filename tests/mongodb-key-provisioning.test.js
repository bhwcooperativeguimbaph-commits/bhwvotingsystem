'use strict';
const assert=require('node:assert/strict');
const {provisionElectionKeys}=require('../database/key-provisioning');
const {confirmCustodianShare}=require('../database/custodian-confirmation');
async function main(){
 const electionId='ELEC-00000000-0000-4000-8000-000000000001';
 const emails=['custodian-one@example.test','custodian-two@example.test'];
 const sent=[],custodians=[];
 const e={electionId,status:'Active',startTime:new Date('2029-01-01'),keyProvisioningState:undefined,keyReservationId:undefined};
 const session={withTransaction:async fn=>fn(),endSession:async()=>{}};
 const db={collection(name){
  if(name==='elections')return {
   findOne:async()=>e,
   updateOne:async(q,u)=>{
    if(q.keyProvisioningState==='Initializing'&&e.keyProvisioningState!=='Initializing')return {modifiedCount:0};
    if(q.keyProvisioningState?.$exists===false&&e.keyProvisioningState!==undefined)return {modifiedCount:0};
    Object.assign(e,u.$set||{});
    for(const key of Object.keys(u.$unset||{}))delete e[key];
    return {modifiedCount:1};
   }};
  if(name==='ballots')return {findOne:async()=>null};
  if(name==='keyCustodians')return {
   insertMany:async rows=>{custodians.push(...rows)},
   findOne:async q=>custodians.find(c=>c.electionId===q.electionId&&c.shareIndex===q.shareIndex)||null,
   updateOne:async(q,u)=>{const c=custodians.find(x=>x._id===q._id);if(c){Object.assign(c,u.$set);return {modifiedCount:1}}return {modifiedCount:0}},
   countDocuments:async q=>custodians.filter(c=>c.electionId===q.electionId&&c.status===q.status).length
  };
  if(name==='auditLogs')return {insertOne:async(doc,opts)=>{assert.equal(doc.action,'KEY_SHARES_ISSUED');assert.ok(opts?.session)}};
  throw Error(name);
 }};
 const connection={db,client:{startSession:()=>session}};
 const result=await provisionElectionKeys(connection,{electionId,emails,now:new Date('2027-01-01'),
  deliver:async data=>sent.push(data)});
 assert.equal(result.custodians,2);assert.equal(sent.length,2);assert.notEqual(sent[0].to,sent[1].to);
 assert.equal(custodians.length,2);assert.equal(e.keyProvisioningState,'Ready');
 assert.equal(typeof e.ballotPublicKeyPem,'string');
 assert.equal(JSON.stringify(custodians).includes('BHW1.'),false);
 // Attach object IDs like real MongoDB documents for confirmation updates.
 for(let i=0;i<custodians.length;i++)custodians[i]._id=i+1;
 const token1=sent[0].text.match(/BHW1\.[a-f0-9]{20}\.[A-Za-z0-9_-]+/)[0];
 const token2=sent[1].text.match(/BHW2\.[a-f0-9]{20}\.[A-Za-z0-9_-]+/)[0];
 assert.equal(await confirmCustodianShare(db,{electionId,shareIndex:1,share:token1}),true);
 assert.notEqual(e.keyDeliveryConfirmed,true);
 assert.equal(await confirmCustodianShare(db,{electionId,shareIndex:2,share:token2}),true);
 assert.equal(e.keyDeliveryConfirmed,true);
 assert.equal(await confirmCustodianShare(db,{electionId,shareIndex:2,share:token1}),false);
 console.log('PASS: Two-recipient key provisioning and independent custodian confirmations');
}
main().catch(e=>{console.error(e);process.exitCode=1});
