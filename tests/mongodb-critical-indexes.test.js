'use strict';
const assert=require('node:assert/strict');
const {indexSpecs}=require('../database/mongodb');
const required=(collection,keyFields,condition)=>{
 const all=indexSpecs[collection]||[];
 const spec=all.find(([keys])=>Object.keys(keys).join(',')===keyFields.join(','));
 assert.ok(spec,'Missing index '+collection+'('+keyFields.join(',')+')');
 assert.ok(condition(spec[1]),'Index options invalid for '+collection);
};
required('voterParticipation',['electionId','memberId'],o=>o.unique===true);
assert.equal((indexSpecs.ballots||[]).some(([keys])=>Object.keys(keys).includes('memberId')),false);
required('receiptCodes',['receiptCode'],o=>o.unique===true);
required('receiptCodes',['electionId','memberId'],o=>o.unique===true);
required('authSessions',['tokenHash'],o=>o.unique===true);
required('authSessions',['expiresAt'],o=>o.expireAfterSeconds===0);
required('elections',['status'],o=>o.unique===true&&o.partialFilterExpression?.status==='Active');
required('memberInbox',['notificationId'],o=>o.unique===true);
required('memberInbox',['memberId','createdAt'],o=>o.unique!==true);
console.log('PASS: Critical election ballot uniqueness, active-election and session indexes');
