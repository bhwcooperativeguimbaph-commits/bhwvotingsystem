'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {recordEncryptedBallot}=require('../database/ballots');
async function main() {
  let saved=[];
  const db={collection(name) {
    assert.equal(name,'ballots');
    return {insertOne:async doc=>{
      if(saved.some(x=>x.electionId===doc.electionId && x.memberId===doc.memberId)) {
        const err=new Error('duplicate');err.code=11000;throw err;
      }
      saved.push(doc); return {acknowledged:true};
    }};
  }};
  const ciphertext='enc:v1:test-placeholder-not-plaintext';
  const voteHash=crypto.createHash('sha256').update(ciphertext).digest('hex');
  const first=await recordEncryptedBallot(db,{electionId:'e1',memberId:'m1',ciphertext,voteHash});
  assert.match(first.receiptNo,/^VOTE-/);
  assert.equal(saved.length,1);
  assert.equal(saved[0].encryptedVote,ciphertext);
  assert.equal(saved[0].voteHash,voteHash);
  await assert.rejects(recordEncryptedBallot(db,{electionId:'e1',memberId:'m1',ciphertext,voteHash}),{code:'DUPLICATE_BALLOT'});
  await assert.rejects(recordEncryptedBallot(db,{electionId:'e2',memberId:'m1',ciphertext,voteHash:'0'.repeat(64)}),/integrity/);
  assert.equal(saved.length,1);
  console.log('PASS: MongoDB ballot adapter unit tests (mock database)');
}
main().catch(e=>{console.error(e);process.exitCode=1});
