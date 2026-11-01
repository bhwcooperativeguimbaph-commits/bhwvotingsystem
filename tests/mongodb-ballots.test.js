'use strict';
const assert=require('node:assert/strict');
const {recordEncryptedBallot}=require('../database/ballots');
async function main(){
 await assert.rejects(recordEncryptedBallot(),e=>e.code==='LEGACY_BALLOT_ADAPTER_DISABLED');
 await assert.rejects(recordEncryptedBallot({},{
  electionId:'e1',memberId:'m1',ciphertext:'encrypted',voteHash:'0'.repeat(64)
 }),e=>e.code==='LEGACY_BALLOT_ADAPTER_DISABLED');
 console.log('PASS: Unsafe voter-linked MongoDB ballot writer cannot be called');
}
main().catch(e=>{console.error(e);process.exitCode=1});
