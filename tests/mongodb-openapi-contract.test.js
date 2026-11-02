'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..');
const yaml=fs.readFileSync(path.join(root,'openapi.yaml'),'utf8');
const server=fs.readFileSync(path.join(root,'mongo-auth-preview.js'),'utf8');
assert.match(yaml,/^openapi: 3\.1\.0/m);
assert.match(yaml,/x-implementation-status: 'rehearsal-code; not live-approved'/);
assert.match(yaml,/sessionCookie:/);
const routes=[...server.matchAll(/app\.(get|post|patch|delete|put)\('([^']+)'/g)]
 .map(x=>({method:x[1],path:x[2]}))
 .filter(x=>x.path.startsWith('/api/')||x.path==='/health');
routes.push({method:'get',path:'/api/geo/:level'},
 {method:'get',path:'/api/geo/:level/:code'});
for(const route of routes){
 const norm=route.path.replace(/:([a-zA-Z][a-zA-Z0-9]*)/g,'{$1}');
 const p='  '+norm+':\n';
 const start=yaml.indexOf(p);
 assert.ok(start>=0,'Missing OpenAPI path '+norm);
 const end=yaml.indexOf('\n  /',start+p.length);
 const slice=yaml.slice(start,end<0?yaml.indexOf('\ncomponents:',start):end);
 assert.ok(slice.includes('    '+route.method+':\n'),
  'Missing OpenAPI method '+route.method.toUpperCase()+' '+norm);
 if(route.path.startsWith('/api/superadmin/')||
    route.path.includes('provision-keys')||route.path.includes('disclose-results')){
  assert.match(slice,/x-required-role: "superadmin"/);
  assert.match(slice,/sessionCookie: \[\]/);
 }
}
for(const route of ['/api/vote','/api/face-challenge',
 '/api/superadmin/email-change/request','/api/superadmin/email-change/confirm',
 '/api/admin/elections/{electionId}/candidates/{candidateId}']){
 assert.ok(yaml.includes('  '+route+':'),route+' must be documented');
}
assert.match(yaml,/staging voting disabled/);
console.log('PASS: OpenAPI inventory covers all implemented HTTP routes and sensitive role requirements');
