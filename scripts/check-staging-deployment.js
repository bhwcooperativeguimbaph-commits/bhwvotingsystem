'use strict';
// Credential-free, read-only or safely rejected requests against the separate Render staging service.
// Never enrolls members, requests OTPs, issues key shares, or casts ballots.
const base=(process.env.BHW_STAGING_URL||'https://secongvoting.onrender.com').replace(/\/$/,'');
async function check(path,method='GET',body=undefined,cookieHeader=undefined){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),75_000);
 try{
  const r=await fetch(base+path,{method,redirect:'manual',
   headers:{...(body===undefined?{'Accept':'application/json'}:{'Content-Type':'application/json'}),
    ...(!['GET','HEAD','OPTIONS'].includes(method)?{
     'Origin':new URL(base).origin,'Sec-Fetch-Site':'same-origin'}:{}),
    ...(cookieHeader?{'Cookie':cookieHeader}:{})},
   body:body===undefined?undefined:JSON.stringify(body),
   signal:controller.signal});
  const raw=await r.text();let data=null;
  try{data=JSON.parse(raw)}catch(_){}
  return {status:r.status,data,raw:raw.slice(0,20000),type:r.headers.get('content-type')||'',setCookie:r.headers.get('set-cookie')||''};
 }finally{clearTimeout(timeout)}
}
function expect(condition,message){if(!condition)throw Error(message)}
async function main(){
 // Deploy can briefly lag the source push; poll without any mutations before
 // asserting that the exact tested SHA is live.
 const expected=(process.env.BHW_EXPECTED_COMMIT||process.env.GITHUB_SHA||'').trim().toLowerCase();
 if(expected)expect(/^[a-f0-9]{40}$/.test(expected),'Invalid expected commit SHA');
 let health;
 for(let attempt=1;attempt<=10;attempt++){
  try{
   health=await check('/health');
   if(health.status===200&&health.data?.database==='mongodb'&&
      (!expected||health.data.gitCommit===expected))break;
  }catch(e){if(attempt===10)throw Error('Staging unreachable: '+e.name)}
  if(attempt<10)await new Promise(resolve=>setTimeout(resolve,12000));
 }
 expect(health?.status===200&&health.data?.database==='mongodb','MongoDB health endpoint failed');
 console.log('PASS staging MongoDB health');
 // In CI, compare exact reviewed source with Render's deployed revision.
 // A successful response from an older build is not completion evidence.
 if(expected){
  expect(health.data.gitCommit===expected,
   'Staging SHA mismatch or unavailable; verify the current Render deployment');
  console.log('PASS exact staging commit '+expected.slice(0,12));
 }else{
  console.log('INFO staging SHA '+(health.data.gitCommit||'not exposed; verify in Render dashboard'));
 }
 for(const [path,marker] of [['/','BHW Guimba'],['/admin-auth-preview','Administrator'],
   ['/member-preview','Member login'],['/results','Published election results']]){
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

 // Create an ephemeral challenge with no biometric data and ensure the
 // HttpOnly browser binding (not proxy IP) is required to consume it.
 const face=await check('/api/face-challenge','POST',{});
 expect(face.status===200&&face.data?.success===true&&
   /^[a-f0-9]{48}$/.test(face.data.challengeId)&&
   Array.isArray(face.data.actions)&&face.data.actions.length===3,
   'Facial challenge issuance is unavailable');
 const match=/(?:^|,)\s*(bhw_face_bind=[a-f0-9]{64})(?:;|$)/.exec(face.setCookie);
 expect(Boolean(match),'Secure browser-binding cookie not issued by staging deployment');
 expect(face.setCookie.includes('HttpOnly')&&face.setCookie.includes('Secure')&&
   face.setCookie.includes('SameSite=Strict'),
   'Facial challenge cookie security flags are missing');
 const cookie=match[1];
 const wrongCookie='bhw_face_bind='+('0'.repeat(64)===cookie.slice(14)?'1'.repeat(64):'0'.repeat(64));
 // Deliberately implausible descriptor: never matches a real member.
 const synthetic={challengeId:face.data.challengeId,
   completedActions:face.data.actions,descriptor:Array(128).fill(1000000)};
 const rejected=await check('/api/login-face','POST',synthetic,wrongCookie);
 expect(rejected.status===401&&/challenge/i.test(rejected.data?.message||''),
   'A different browser could consume a challenge or staging is using the old IP binding');
 const accepted=await check('/api/login-face','POST',synthetic,cookie);
 expect(accepted.status===401&&accepted.data?.message==='Face not recognized',
   'Correct browser cookie verification failed: HTTP '+accepted.status+
   '; category '+String(accepted.data?.message||'unexpected response').slice(0,120));
 const replay=await check('/api/login-face','POST',synthetic,cookie);
 expect(replay.status===401&&/challenge/i.test(replay.data?.message||''),
   'Replaying a facial challenge was not rejected');
 console.log('PASS secure browser-bound challenge (wrong cookie, valid cookie, replay)');
 console.log('STAGING_GATE_PASS: public endpoints, settings, and access boundaries');
}
main().catch(e=>{console.error('STAGING_GATE_FAILED:',e.message);process.exitCode=1});
