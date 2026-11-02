'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/mongo-member-preview.html'),'utf8');
const server=fs.readFileSync(path.join(root,'mongo-auth-preview.js'),'utf8');
for(const id of ['auth','webcam','login','memberHome','memberPhoto','avatarInitials',
 'memberDetails','notificationBell','notificationCount','notifications','notificationList',
 'readyToVote','voting','positions','vote','confirmVote','selectionSummary','confirmSubmit',
 'cancelVote','voteSuccess','closeVoteSuccess','downloadReceipt','logout','loginFeedback',
 'receipt-no','receipt-date']){
 assert.ok(html.includes('id="'+id+'"'),'Missing member portal control: '+id);
}
assert.ok(!html.includes('id="session"'),'Manual session-check button should not be exposed');
assert.ok(!html.includes('id="verifyReceipt"'),'Receipt number confirmation input should not be shown');
assert.ok(!html.includes('portal-nav'),'Member top tabs must not be shown');
assert.ok(!/\brehearsal\b/i.test(html),'Member UI must not display rehearsal labels');
assert.match(html,/document\.addEventListener\('DOMContentLoaded',async/);
assert.match(html,/startCamera\(\);/);
assert.match(html,/await request\('\/api\/member\/profile'\)/);
assert.match(html,/by\('memberHome'\)\.classList\.remove\('hidden'\)/);
assert.match(html,/by\('readyToVote'\)\.onclick=/);
assert.match(html,/by\('confirmVote'\)\.showModal\(\)/);
assert.match(html,/by\('voteSuccess'\)\.showModal\(\)/);
assert.match(html,/window\.downloadReceipt\?\.\(\)/);
assert.match(html,/by\('notificationBell'\)\.onclick=/);
assert.match(html,/Mark as read/);
assert.match(html,/const session=await request\('\/api\/session'\)/,
 'Uncertain network response must check whether a vote was already accepted');
assert.ok(server.includes("app.get('/api/member/profile'"),
 'Member profile and consented portrait endpoint missing');
assert.ok(server.includes("app.get('/api/member/receipts'"),
 'Owner-only receipt endpoint missing');
assert.ok(!html.includes('/api/face-prescan'),
 'Member recognition must not precede the challenge');
console.log('PASS: auto-camera, profile hub, bell alerts, ballot summary, owner receipts and retry protection');
