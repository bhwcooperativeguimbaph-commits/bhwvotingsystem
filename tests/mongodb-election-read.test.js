'use strict';
const assert=require('node:assert/strict');
const {getPublicElectionInfo}=require('../database/election-read');
async function main(){
 let elected=null;
 const candidates=[{candidateId:'A',name:'Candidate A',position:'Kagawad',maxVotes:1,status:'Active'},{candidateId:'B',name:'Candidate B',position:'Kapitan',maxVotes:2,status:'Active'}];
 const db={collection(name){
  if(name==='elections')return {findOne:async()=>elected};
  if(name==='candidates')return {find:()=>({toArray:async()=>candidates})};
  throw Error(name);
 }};
 assert.deepEqual(await getPublicElectionInfo(db),{active:false});
 elected={electionId:'e1',title:'Test Election',startTime:new Date('2027-01-01'),endTime:new Date('2027-01-02')};
 const result=await getPublicElectionInfo(db);
 assert.equal(result.active,true);assert.equal(result.config[0].maxVotes,1);
 assert.equal(result.config[1].maxVotes,2);
 assert.equal(result.config[0].candidates[0].candidateId,'A');
 candidates[1].maxVotes=1;candidates.push({candidateId:'C',name:'C',position:'Kapitan',maxVotes:2,status:'Active'});
 await assert.rejects(getPublicElectionInfo(db),/Inconsistent/);
 console.log('PASS: MongoDB public election read adapter tests');
}
main().catch(e=>{console.error(e);process.exitCode=1});
