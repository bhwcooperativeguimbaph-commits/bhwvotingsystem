'use strict';
// Public staging smoke check: uses no credentials and changes no records.
const base=(process.env.BHW_STAGING_URL||'https://bhwguimba.onrender.com').replace(/\/$/,'');
async function checked(path,{method='GET',body}={}){
 const r=await fetch(base+path,{method,
  headers:body?{'Content-Type':'application/json'}:{},
  body:body?JSON.stringify(body):undefined,
  signal:AbortSignal.timeout(90000)});
 const text=await r.text();let data;
 try{data=JSON.parse(text)}catch(_){data=null}
 return {status:r.status,data};
}
async function main(){
 const health=await checked('/health');
 if(health.status!==200||health.data?.database!=='mongodb')
  throw new Error('MongoDB preview health failed');
 const loc=await checked('/api/geo/barangays/0304911000');
 if(loc.status!==200||!Array.isArray(loc.data)||loc.data.length!==64)
  throw new Error('Guimba reference list is missing or incomplete');
 const admin=await checked('/admin-console');
 if(admin.status!==403)throw new Error('Anonymous admin access was not rejected');
 const vote=await checked('/api/vote',{method:'POST',body:{choices:{Kagawad:[],Kapitan:[]}}});
 if(vote.status!==403)throw new Error('Anonymous voting was not rejected');
 console.log('PASS: MongoDB preview health, Guimba 64 barangays, admin auth guard, voting guard');
}
main().catch(e=>{console.error('STAGING SMOKE FAILURE:',e.message);process.exitCode=1});
