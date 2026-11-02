'use strict';
// Verify the exact canonical payload that the server hashes at first publication.
// This detects content alteration, but does not independently authenticate the
// election authority or make an unaudited tally trustworthy.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.BHWReportIntegrity=api;
})(typeof window==='undefined'?null:window,function(){
 function canonicalReport(report){
  if(!report||typeof report!=='object'||typeof report.electionId!=='string'||
    !Number.isSafeInteger(report.ballotsCast)||report.ballotsCast<0||
    !Array.isArray(report.results)||typeof report.publishedAt!=='string'||
    !Number.isFinite(Date.parse(report.publishedAt)))
   throw new TypeError('Invalid published report');
  const publishedAt=new Date(report.publishedAt).toISOString();
  if(report.results.some(row=>!row||typeof row!=='object'||
   typeof row.candidateId!=='string'||typeof row.name!=='string'||
   typeof row.position!=='string'||!Number.isSafeInteger(row.votes)||row.votes<0))
   throw new TypeError('Invalid candidate totals');
  // Field order must match database/results-disclosure.js exactly.
  return JSON.stringify({electionId:report.electionId,ballotsCast:report.ballotsCast,
   results:report.results.map(row=>({candidateId:row.candidateId,
    name:row.name,position:row.position,votes:row.votes})),
   publishedAt});
 }
 async function digest(report){
  const subtle=(typeof globalThis!=='undefined'&&globalThis.crypto?.subtle);
  if(!subtle)throw new Error('Browser cryptographic verification unavailable');
  const bytes=new TextEncoder().encode(canonicalReport(report));
  const hash=await subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
 }
 async function verify(report){
  if(typeof report?.reportHash!=='string'||!/^[a-f0-9]{64}$/.test(report.reportHash))
   return false;
  return (await digest(report))===report.reportHash;
 }
 return {canonicalReport,digest,verify};
});
