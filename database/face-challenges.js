'use strict';
const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const idPattern=/^[a-f0-9]{48}$/;
const validActions=new Set(['turn-left','turn-right','blink']);
async function issueFaceChallenge(db,ip,{now=new Date()}={}){
 const challengeId=crypto.randomBytes(24).toString('hex');
 const actions=crypto.randomInt(2)===0?
  ['turn-left','turn-right','blink']:['turn-right','turn-left','blink'];
 await db.collection('faceChallenges').insertOne({
  challengeHash:hash(challengeId),
  networkHash:hash(ip),actions,
  issuedAt:now,expiresAt:new Date(now.getTime()+120000)});
 return {challengeId,actions,expiresInSeconds:120};
}
async function consumeFaceChallenge(db,{challengeId,completedActions,ip,now=new Date()}){
 if(typeof challengeId!=='string'||!idPattern.test(challengeId)||
   typeof ip!=='string'||!Array.isArray(completedActions)||completedActions.length!==3||
   completedActions.some(a=>!validActions.has(a)))return false;
 // Atomic consumption makes replay fail even if two concurrent requests arrive.
 const challenge=await db.collection('faceChallenges').findOneAndDelete({
  challengeHash:hash(challengeId),networkHash:hash(ip),expiresAt:{$gt:now}});
 if(!challenge)return false;
 return JSON.stringify(challenge.actions)===JSON.stringify(completedActions);
}
module.exports={issueFaceChallenge,consumeFaceChallenge};
