'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','mongo-auth-preview.js'),'utf8');
const mandatory=[
 ["POST","/api/superadmin/admins","superadminOnly"],
 ["GET","/api/superadmin/admins","superadminOnly"],
 ["PATCH","/api/superadmin/admins/:adminId/status","superadminOnly"],
 ["POST","/api/admin/elections/:electionId/provision-keys","superadminOnly"],
 ["POST","/api/admin/elections/:electionId/disclose-results","superadminOnly"],
 ["GET","/api/admin/members","staffOnly"],
 ["POST","/api/admin/register-member","staffOnly"],
 ["POST","/api/admin/initialize-election","staffOnly"],
 ["GET","/admin-console","staffOnly"],
 ["GET","/member-enrollment-preview","staffOnly"]
];
for(const [method,route,guard] of mandatory){
 const verb=method.toLowerCase();
 assert.ok(src.includes("app."+verb+"('"+route+"',"+guard),
  'Missing required authorization: '+method+' '+route+' '+guard);
}
const vote=src.indexOf("app.post('/api/vote'");
assert.ok(vote>=0,'Missing vote endpoint');
const voteCode=src.slice(vote,src.indexOf("app.get('/api/member/notifications'",vote));
assert.ok(voteCode.includes("process.env.ENABLE_MONGODB_VOTE_TEST!=='true'"),'Voting must default disabled');
assert.ok(voteCode.includes("auth.role!=='member'"),'Voting requires member session');
assert.ok(!src.includes('/api/face-prescan'),'Do not expose a pre-challenge biometric identity lookup');
assert.ok(src.includes('app.use(originCheck);'),'Missing cross-origin request guard');
console.log('PASS: Superadmin, staff, member and disabled-voting route authorization contracts');
