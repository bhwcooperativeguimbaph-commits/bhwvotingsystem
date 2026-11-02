'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','public/mongo-member-preview.html'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','mongo-auth-preview.js'),'utf8');
for(const id of ['confirmVote','confirmSubmit','cancelVote','voteSuccess',
 'closeVoteSuccess','receiptHistorySection','receiptHistory','refreshReceipts',
 'downloadReceipt','verifyReceipt','receipt-no','receipt-date']){
 assert.ok(html.includes('id="'+id+'"'),'Missing member UI control: '+id);
}
assert.ok(html.includes("by('confirmVote').showModal()"),'Vote needs an explicit confirmation');
assert.ok(html.includes("by('voteSuccess').showModal()"),'Success feedback missing');
assert.ok(html.includes("async function loadReceipts()"),'Member history restoration missing');
assert.ok(html.includes("await Promise.all([loadReceipts(),loadNotifications()])"),
 'Member receipt and notifications should restore after login/refresh');
assert.ok(html.includes("const session=await request('/api/session')"),
 'An uncertain vote response must check the server before permitting retry');
assert.ok(html.includes("by('vote').disabled=true;\n    by('status').textContent='Your ballot is recorded"),
 'Vote already recorded must not be reenabled');
assert.ok(html.includes("window.downloadReceipt?.()"),
 'Receipt download must be connected to local exporter');
assert.ok(server.includes("app.get('/api/member/receipts'"),
 'Member history API is missing');
assert.ok(server.includes("auth.role!=='member'"),
 'Member receipt access must require role check');
assert.ok(server.includes("app.get('/api/receipts/:code'"),
 'Owner-scoped individual receipt verification is missing');
assert.ok(!html.includes('/api/face-prescan'),
 'Member recognition must not precede facial challenge');
console.log('PASS: Voter confirmation, receipt history restoration, session recovery and owner-only access contracts');
