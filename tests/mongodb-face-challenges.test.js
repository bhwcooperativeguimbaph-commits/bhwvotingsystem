'use strict';
const assert=require('node:assert/strict');
const {createFaceBinding,issueFaceChallenge,consumeFaceChallenge}=require('../database/face-challenges');
async function main(){
 const issued=[];
 const db={collection(name){
  assert.equal(name,'faceChallenges');
  return {
   insertOne:async doc=>issued.push(doc),
   findOneAndDelete:async q=>{
    const i=issued.findIndex(x=>x.challengeHash===q.challengeHash&&
      x.bindingHash===q.bindingHash&&x.expiresAt>q.expiresAt.$gt);
    if(i===-1)return null;
    return issued.splice(i,1)[0];
   }
  };
 }};
 const now=new Date('2027-01-01T00:00:00Z');
 const binding=createFaceBinding(),anotherBrowser=createFaceBinding();
 assert.match(binding,/^[a-f0-9]{64}$/);
 assert.notEqual(binding,anotherBrowser);
 const test=await issueFaceChallenge(db,binding,{now});
 assert.match(test.challengeId,/^[a-f0-9]{48}$/);
 assert.equal(test.actions.length,3);
 assert.equal(issued.length,1);
 assert.equal('networkHash' in issued[0],false);
 assert.ok(!JSON.stringify(issued[0]).includes(binding),'Never store browser binding plaintext');
 // A request can change IP between issuance and consumption; cookie stays valid.
 const wrong=await consumeFaceChallenge(db,{
  challengeId:test.challengeId,completedActions:test.actions,binding:anotherBrowser,now});
 assert.equal(wrong,false);
 assert.equal(issued.length,1,'Wrong browser may not consume another browser challenge');
 const valid=await consumeFaceChallenge(db,{
  challengeId:test.challengeId,completedActions:test.actions,binding,now});
 assert.equal(valid,true);
 assert.equal(await consumeFaceChallenge(db,{
  challengeId:test.challengeId,completedActions:test.actions,binding,now}),false);
 const second=await issueFaceChallenge(db,binding,{now});
 const late=new Date(now.getTime()+120001);
 assert.equal(await consumeFaceChallenge(db,{
  challengeId:second.challengeId,completedActions:second.actions,binding,now:late}),false);
 const third=await issueFaceChallenge(db,binding,{now});
 assert.equal(await consumeFaceChallenge(db,{
  challengeId:third.challengeId,completedActions:['blink','turn-left','turn-right'],binding,now}),false);
 assert.equal(await consumeFaceChallenge(db,{
  challengeId:third.challengeId,completedActions:third.actions,binding,now}),false);
 assert.equal(await consumeFaceChallenge(db,{challengeId:third.challengeId,
  completedActions:third.actions,binding:'invalid',now}),false);
 await assert.rejects(issueFaceChallenge(db,'bad',{now}),/browser challenge binding/);
 console.log('PASS: Browser-cookie challenge binding, wrong-browser isolation, expiry, order and replay protection');
}
main().catch(e=>{console.error(e);process.exitCode=1});
