'use strict';
const assert=require('node:assert/strict');
const {getElectionTurnout}=require('../database/turnout');
async function run(){
 let election={electionId:'E-1',title:'Election',status:'Active'};
 let eligible=20,cast=5;
 const db={collection(name){
  if(name==='elections')return {findOne:async()=>election};
  if(name==='members')return {countDocuments:async q=>{assert.equal(q.status,'Active');return eligible}};
  if(name==='ballots')return {countDocuments:async q=>{assert.deepEqual(q,{electionId:'E-1',status:'Valid'});return cast}};
 }};
 assert.equal((await getElectionTurnout(db,'E-1')).turnoutPercent,25);
 eligible=0;cast=0;assert.equal((await getElectionTurnout(db,'E-1')).turnoutPercent,0);
 election=null;assert.equal(await getElectionTurnout(db,'E-1'),null);
 console.log('PASS: MongoDB turnout aggregation tests');
}
run().catch(e=>{console.error(e);process.exitCode=1});
