'use strict';
const assert=require('node:assert/strict');
const {issueFaceChallenge,consumeFaceChallenge}=require('../database/face-challenges');
async function main(){
 const issued=[];
 const db={collection(name){
  assert.equal(name,'faceChallenges');
  return {
   insertOne:async doc=>issued.push(doc),
   findOneAndDelete:async q=>{
    const i=issued.findIndex(x=>x.challengeHash===q.challengeHash&&
      x.networkHash===q.networkHash&&x.expiresAt>q.expiresAt.$gt);
    if(i===-1)return null;
    return issued.splice(i,1)[0];
   }
  };
 }};
 const now=new Date('2027-01-01T00:00:00Z');
 const test=await issueFaceChallenge(db,'127.0.0.1',{now});
 assert.match(test.challengeId,/^[a-f0-9]{48}$/);
 assert.equal(test.actions.length,3);
 assert.equal(issued.length,1);
 assert.ok(!JSON.stringify(issued[0]).includes('127.0.0.1'));
 const wrong=await consumeFaceChallenge(db,{challengeId:test.challengeId,completedActions:test.actions,ip:'192.168.0.2',now});
 assert.equal(wrong,false);
 const valid=await consumeFaceChallenge(db,{challengeId:test.challengeId,completedActions:test.actions,ip:'127.0.0.1',now});
 assert.equal(valid,true);
 assert.equal(await consumeFaceChallenge(db,{challengeId:test.challengeId,completedActions:test.actions,ip:'127.0.0.1',now}),false);
 const second=await issueFaceChallenge(db,'127.0.0.1',{now});
 const late=new Date(now.getTime()+120001);
 assert.equal(await consumeFaceChallenge(db,{challengeId:second.challengeId,completedActions:second.actions,ip:'127.0.0.1',now:late}),false);
 const third=await issueFaceChallenge(db,'127.0.0.1',{now});
 assert.equal(await consumeFaceChallenge(db,{challengeId:third.challengeId,completedActions:['blink','turn-left','turn-right'],ip:'127.0.0.1',now}),false);
 assert.equal(await consumeFaceChallenge(db,{challengeId:third.challengeId,completedActions:third.actions,ip:'127.0.0.1',now}),false);
 console.log('PASS: Persistent challenge, IP-binding, expiry and one-time atomic consumption');
}
main().catch(e=>{console.error(e);process.exitCode=1});
