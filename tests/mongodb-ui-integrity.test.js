'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const routes=fs.readFileSync(path.join(root,'mongo-auth-preview.js'),'utf8');
const pages=['mongo-portal.html','mongo-admin-console.html','mongo-member-preview.html',
 'mongo-enrollment-preview.html','mongo-results.html','mongo-password-recovery.html',
 'admin-auth-preview.html','custodian-confirm.html'];
const allowedRoutes=new Set([
 '/','/admin-console','/admin-auth-preview','/member-enrollment-preview',
 '/member-preview','/custodian-confirm','/admin-password-recovery','/results',
 '/assets/logo.svg','/css/mongo-portal.css','/js/mongo-face-challenge.js','/js/receipt-pdf.js','/js/report-integrity.js','/js/admin-workspace.js'
]);
for(const page of pages){
 const html=fs.readFileSync(path.join(root,'public',page),'utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,'Duplicate DOM id in '+page);
 const references=[...html.matchAll(/(?:\bby|\bel)\(['"]([A-Za-z0-9_-]+)['"]\)|document\.getElementById\(['"]([A-Za-z0-9_-]+)['"]\)/g)];
 for(const match of references)assert.ok(ids.includes(match[1]||match[2]),'Missing DOM element '+(match[1]||match[2])+' in '+page);
 for(const match of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)){
  const route=match[1].split('?')[0];
  assert.ok(allowedRoutes.has(route),'Unknown internal UI route '+route+' in '+page);
  if(route.endsWith('.css')||route.endsWith('.js')||route.endsWith('.svg')){
   const asset=route==='/assets/logo.svg'?'public/assets/logo.svg':route.slice(1).startsWith('css/')||route.slice(1).startsWith('js/')?'public/'+route.slice(1):null;
   if(asset)assert.ok(fs.existsSync(path.join(root,asset)),'Missing '+asset);
  }
 }
}
for(const route of allowedRoutes){
 if(route==='/'||route.startsWith('/css/')||route.startsWith('/assets/')||route.startsWith('/js/'))continue;
 assert.ok(routes.includes("'"+route+"'"),'Missing MongoDB express route '+route);
}
console.log('PASS: All eight integrated pages, links, elements and static assets are consistent');
