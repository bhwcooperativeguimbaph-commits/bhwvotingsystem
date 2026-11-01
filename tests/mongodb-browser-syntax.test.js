'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const htmlFiles=[
 'public/admin-auth-preview.html',
 'public/mongo-admin-console.html',
 'public/custodian-confirm.html',
 'public/mongo-enrollment-preview.html',
 'public/mongo-member-preview.html'
];
for(const filename of htmlFiles){
 const html=fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
 const expression=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
 let match,n=0;
 while((match=expression.exec(html))){
  if(!match[1].trim())continue;
  new vm.Script(match[1],{filename:filename+'#inline-'+(++n)});
 }
 if(!n)throw Error('No inline script checked in '+filename);
}
new vm.Script(fs.readFileSync(path.join(__dirname,'..','public/js/mongo-face-challenge.js'),'utf8'),
 {filename:'public/js/mongo-face-challenge.js'});
console.log('PASS: Browser preview JavaScript syntax checks');
