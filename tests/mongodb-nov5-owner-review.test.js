'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const admin=read('public/mongo-admin-console.html');
const member=read('public/mongo-member-preview.html');
const auth=read('public/admin-auth-preview.html');
const server=read('mongo-auth-preview.js');
const analytics=read('database/admin-analytics.js');
const staging=read('scripts/check-staging-deployment.js');
const key=read('database/key-custody.js');
const disclosure=read('database/results-disclosure.js');
const provisioning=read('database/key-provisioning.js');
// Full login screens have explicit landing navigation without changing the
// existing home-linked header or the authenticated ballot transitions.
assert.match(auth,/Back to landing page/);
assert.match(member,/Back to landing page/);
assert.match(server,/res\.redirect\(302,'\/'\)/);
assert.match(server,/\['\/admin-console','\/member-enrollment-preview'\]/);
assert.match(staging,/r\.status===302&&r\.location==='\/'/);
assert.match(staging,/r\.status===403/);
// Current-election snapshot is restricted to an actually active election.
assert.match(analytics,/status:'Active',endTime:\{\$gt:new Date\(\)\}/);
assert.match(admin,/No active election/);
assert.match(admin,/id="memberStatusFilter"/);
assert.match(admin,/<option value="Active" selected>/);
assert.match(admin,/bhw-view-changed/);
assert.match(admin,/['"]Photo['"]/);
for(const label of ['First name','Last name','Member ID','Area'])assert.ok(admin.includes(label));
assert.match(admin,/member-directory-table/);
// Portraits are opt-in encrypted at rest and only decrypted for authenticated
// staff through a protected image route, never in directory JSON.
assert.match(server,/\/api\/admin\/members\/:memberId\/portrait',staffOnly/);
assert.match(server,/hasPortrait:Boolean\(portraitEncrypted\)/);
assert.match(server,/decodePhoto\(decryptPortrait\(/);
// Never create a public biometric identity-enumeration endpoint.
assert.ok(!server.includes('/api/face-prescan'));
assert.ok(!server.includes('/api/face-precheck'));
assert.match(member,/runBHWFaceChallenge\(video\)/);
// Short shares seal the RSA key, keep 2-of-2 recovery, and preserve old shares.
assert.match(key,/aes-256-gcm/);
assert.match(key,/Invalid legacy share size/);
assert.match(provisioning,/sealedPrivateKey:pkg\.sealedPrivateKey/);
assert.match(disclosure,/election\.sealedPrivateKey/);
console.log('PASS: November 5 owner UI, member directory, safe access, short shares and preserved challenge contracts');
