'use strict';
// Credential-free, read-only or safely rejected requests against the separate Render staging service.
// Never enrolls members, requests OTPs, issues key shares, or casts ballots.
const base=(process.env.BHW_STAGING_URL||'https://secongvoting.onrender.com').replace(/\/$/,'');
async function check(path,method='GET',body=undefined){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),75_000);
 try{
  const r=await fetch(base+path,{method,redirect:'manual',
   headers:body===undefined?{'Accept':'application/json'}:{'Content-Type':'application/json'},
   body:body===undefined?undefined:JSON.stringify(body),
   signal:controller.signal});
  const raw=await r.text();let data=null;
  try{data=JSON.parse(raw)}catch(_){}
  return {status:r.status,data,raw:raw.slice(0,1000),type:r.headers.get('content-type')||''};
 }finally{clearTimeout(timeout)}
}
function expect(condition,message){if(!condition)throw Error(message)}
async function main(){
 let health;
 for(let attempt=1;attempt<=10;attempt++){
  try{
   health=await check('/health');
   if(health.status===200&&health.data?.database==='mongodb')break;
  }catch(e){if(attempt===10)throw Error('Staging unreachable: '+e.name)}
  await new Promise(resolve=>setTimeout(resolve,12000));
 }
 expect(health?.status===200&&health.data?.database==='mongodb','MongoDB health endpoint failed');
 console.log('PASS staging MongoDB health');
 for(const [path,marker] of [['/','BHW Guimba'],['/admin-auth-preview','Administrator'],
   ['/member-preview','member voting'],['/results','Published election results']]){
  const response=await check(path);
  expect(response.status===200&&response.raw.toLowerCase().includes(marker.toLowerCase()),
   'UI route failed: '+path+' HTTP '+response.status);
  console.log('PASS public page '+path);
 }
 const geo=await check('/api/geo/barangays/0304911000');
 expect(geo.status===200&&Array.isArray(geo.data)&&geo.data.length===64,
  'Guimba PSGC list missing/incomplete');
 console.log('PASS verified 64 Guimba barangays');
 const info=await check('/api/election-info');
 expect(info.status===200&&info.data&&typeof info.data.voteSubmissionEnabled==='boolean',
  'Election API missing vote-submission state');
 expect(info.data.voteSubmissionEnabled===true,
  'Staging vote-test flag not enabled; check ENABLE_MONGODB_VOTE_TEST and database suffix');
 console.log('PASS staging test-only vote flag configured (no ballots submitted)');
 const archive=await check('/api/elections/recent-finalized');
 expect(archive.status===200&&Array.isArray(archive.data?.elections),'Public results archive failed');
 console.log('PASS public finalized-results archive');
 for(const p of ['/admin-console','/member-enrollment-preview','/api/superadmin/admins',
  '/api/admin/overview']){
  const r=await check(p);
  expect(r.status===403,'Anonymous protection failure '+p+' HTTP '+r.status);
  console.log('PASS anonymous access denied '+p);
 }
 const session=await check('/api/session');
 expect(session.status===401,'Unauthenticated session should be 401');
 console.log('PASS unauthenticated session denied');
 const vote=await check('/api/vote','POST',{choices:{Kagawad:[],Kapitan:[]}});
 expect(vote.status===403,'Anonymous test ballot request unexpectedly succeeded');
 console.log('PASS anonymous vote rejected (no ballots created)');
 console.log('STAGING_GATE_PASS: public endpoints, settings, and access boundaries');
}
main().catch(e=>{console.error('STAGING_GATE_FAILED:',e.message);process.exitCode=1});
