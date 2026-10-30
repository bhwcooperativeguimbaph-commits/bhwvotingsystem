'use strict';
const assert=require('node:assert/strict');
const {validateBallot}=require('../database/ballot-validation');
const candidates=[
 {candidateId:'a',position:'Kagawad',maxVotes:1,status:'Active'},
 {candidateId:'b',position:'Kagawad',maxVotes:1,status:'Active'},
 {candidateId:'c',position:'Kapitan',maxVotes:2,status:'Active'},
 {candidateId:'d',position:'Kapitan',maxVotes:2,status:'Active'}];
assert.equal(validateBallot({Kagawad:['a'],Kapitan:['c','d']},candidates),true);
for(const value of [
 {Kagawad:['a','b'],Kapitan:['c']},
 {Kagawad:['a','a'],Kapitan:['c']},
 {Kagawad:['z'],Kapitan:['c']},
 {Kagawad:['a'],Kapitan:['c','c']},
 {Kagawad:['a'],Other:[]},
 {Kagawad:['a']}
])assert.throws(()=>validateBallot(value,candidates));
assert.throws(()=>validateBallot({Kagawad:[],Kapitan:[]},[...candidates,{candidateId:'e',position:'Kapitan',maxVotes:1,status:'Active'}]));
console.log('PASS: MongoDB ballot validation unit tests');
