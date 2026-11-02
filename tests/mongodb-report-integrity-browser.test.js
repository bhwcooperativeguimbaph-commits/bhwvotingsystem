'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {canonicalReport,digest,verify}=require('../public/js/report-integrity');
const report={
 electionId:'ELEC-00000000-0000-4000-8000-000000000001',
 ballotsCast:2,
 results:[{candidateId:'CAND-1',name:'Ada',position:'Board',votes:2},
  {candidateId:'CAND-2',name:'Ben',position:'Board',votes:0}],
 publishedAt:'2026-11-02T03:04:05.000Z'
};
async function main(){
 const expected=crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
 assert.equal(await digest(report),expected);
 assert.equal(await verify({...report,reportHash:expected}),true);
 assert.equal(await verify({...report,ballotsCast:3,reportHash:expected}),false);
 assert.equal(await verify({...report,results:[{...report.results[0],votes:1}],reportHash:expected}),false);
 assert.equal(await verify({...report,reportHash:'broken'}),false);
 assert.throws(()=>canonicalReport({...report,results:[{votes:-1}]}),TypeError);
 const page=fs.readFileSync(path.join(__dirname,'..','public','mongo-results.html'),'utf8');
 const server=fs.readFileSync(path.join(__dirname,'..','mongo-auth-preview.js'),'utf8');
 assert.match(page,/<script src="\/js\/report-integrity\.js"><\/script>/);
 assert.match(page,/await window\.BHWReportIntegrity\.verify\(report\)/);
 assert.ok(page.indexOf('await window.BHWReportIntegrity.verify(report)')<
  page.indexOf('current={report,title:'),'Check must precede rendering');
 assert.match(server,/app\.get\('\/js\/report-integrity\.js'/);
 console.log('PASS: verified SHA-256 report payload matches canonical server hash; tampered reports cannot render');
}
main().catch(e=>{console.error(e);process.exitCode=1});
