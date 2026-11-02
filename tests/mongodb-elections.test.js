'use strict';
const assert=require('node:assert/strict');
const {validateElection,createElection}=require('../database/elections');
async function main(){
 const base={title:'BHW Election',startTime:'2027-01-01T00:00:00Z',endTime:'2027-01-02T00:00:00Z',config:[
  {title:'Kagawad',maxVotes:1,candidates:[{name:'Candidate A'},{name:'Candidate B'}]},
  {title:'Kapitan',maxVotes:2,candidates:[{name:'Candidate C'},{name:'Candidate D'}]}]};
 assert.equal(validateElection(base).config[1].maxVotes,2);
 assert.throws(()=>validateElection({...base,config:[{title:'Kagawad',maxVotes:2,candidates:[{name:'A'}]}]}),/Kagawad allows 1/);
 assert.throws(()=>validateElection({...base,config:[{title:'Kapitan',maxVotes:2,candidates:[{name:'A'}]}]}),/Insufficient candidates/);
 assert.throws(()=>validateElection({...base,endTime:base.startTime}),/schedule/);
 assert.throws(()=>validateElection({...base,config:[{title:'Kagawad',maxVotes:1,candidates:[{name:'A',photo:'data:image/svg+xml;base64,AAAA'}]}]}),/photo/);
 const elections=[],candidates=[];
 const session={withTransaction:async fn=>fn(),endSession:async()=>{}};
 const db={collection(name){
  if(name==='elections')return {findOne:async()=>null,updateMany:async()=>({modifiedCount:0}),insertOne:async x=>elections.push(x)};
  if(name==='candidates')return {insertMany:async xs=>candidates.push(...xs)};
  if(name==='auditLogs')return {insertOne:async(doc,opts)=>{assert.equal(doc.action,'ELECTION_CREATED');assert.ok(opts?.session)}};
  throw Error(name);
 }};
 const result=await createElection({db,client:{startSession:()=>session}},base);
 assert.match(result.electionId,/^ELEC-/);
 assert.equal(elections.length,1);
 assert.equal(candidates.length,4);
 assert.equal(candidates.filter(x=>x.position==='Kapitan').every(x=>x.maxVotes===2),true);
 console.log('PASS: MongoDB election adapter tests (mock database)');
}
main().catch(e=>{console.error(e);process.exitCode=1});
