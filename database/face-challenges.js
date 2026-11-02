'use strict';
// Challenges are bound to an unpredictable, HttpOnly browser cookie rather than
// the network IP, which may change between requests through proxies/mobile ISPs.
// Browser-reported gestures remain a development convenience, NOT liveness/PAD.
const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const challengeIdPattern=/^[a-f0-9]{48}$/;
const bindingPattern=/^[a-f0-9]{64}$/;
const validActions=new Set(['turn-left','turn-right','blink']);
const lifetimeMs=120000;
function createFaceBinding(){return crypto.randomBytes(32).toString('hex')}
async function issueFaceChallenge(db,binding,{now=new Date()}={}){
 if(typeof binding!=='string'||!bindingPattern.test(binding))
  throw new TypeError('Valid browser challenge binding required');
 const challengeId=crypto.randomBytes(24).toString('hex');
 const actions=crypto.randomInt(2)===0?
  ['turn-left','turn-right','blink']:['turn-right','turn-left','blink'];
 await db.collection('faceChallenges').insertOne({
  challengeHash:hash(challengeId),bindingHash:hash(binding),actions,
  issuedAt:now,expiresAt:new Date(now.getTime()+lifetimeMs)});
 return {challengeId,actions,expiresInSeconds:lifetimeMs/1000};
}
async function consumeFaceChallenge(db,{challengeId,completedActions,binding,now=new Date()}){
 if(typeof challengeId!=='string'||!challengeIdPattern.test(challengeId)||
   typeof binding!=='string'||!bindingPattern.test(binding)||
   !Array.isArray(completedActions)||completedActions.length!==3||
   completedActions.some(a=>!validActions.has(a)))return false;
 // Challenge is removed atomically only by the originating browser while valid.
 // A wrong browser must not consume a legitimate challenge.
 const challenge=await db.collection('faceChallenges').findOneAndDelete({
  challengeHash:hash(challengeId),bindingHash:hash(binding),expiresAt:{$gt:now}});
 if(!challenge)return false;
 return JSON.stringify(challenge.actions)===JSON.stringify(completedActions);
}
module.exports={createFaceBinding,issueFaceChallenge,consumeFaceChallenge};
