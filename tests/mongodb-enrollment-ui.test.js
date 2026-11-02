'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','public/mongo-enrollment-preview.html'),'utf8');
for(const id of ['firstName','lastName','area','address','birthdate','barangay']){
 assert.match(html,new RegExp('<(?:input|select) id="'+id+'"[^>]*required'),
   'Missing required registration control: '+id);
}
assert.match(html,/<input id="middleName"[^>]*>/);
assert.doesNotMatch(html,/<input id="middleName"[^>]*required/,'Middle name must remain optional');
for(const id of ['region','province','city']){
 assert.match(html,new RegExp('<select id="'+id+'"[^>]*disabled'),
   'Location must be locked: '+id);
}
assert.match(html,/blank\.value=''/,'Barangay must start without a selected code');
assert.match(html,/blank\.disabled=true;blank\.selected=true/,'Barangay placeholder must be explicitly selected');
assert.match(html,/select\.value=''/,'Barangay must stay unselected until picked');
assert.match(html,/by\('birthdate'\)\.max=dateText\(oldestAllowed\)/,
 'DOB picker must prevent dates younger than 18');
assert.match(html,/field\.setCustomValidity\(message\)/,'Date validation must be visible');
assert.match(html,/<dialog id="successDialog"[^>]*aria-labelledby=/,'Accessible success modal missing');
assert.match(html,/by\('successDialog'\)\.showModal\(\)/,'Success modal never opens');
assert.match(html,/firstName:by\('firstName'\)\.value\.trim\(\)/,'Structured first name not sent to server');
assert.match(html,/lastName:by\('lastName'\)\.value\.trim\(\)/,'Structured last name not sent to server');
assert.match(html,/middleName:by\('middleName'\)\.value\.trim\(\)/,'Optional middle name not sent to server');
console.log('PASS: Enrollment required/optional fields, adult date, fixed PSGC, blank barangay and popup');
