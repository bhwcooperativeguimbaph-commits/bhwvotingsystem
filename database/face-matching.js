'use strict';
// MongoDB face matcher. Uses the existing biometric cipher and facial challenge
// from server.js; does not replace the challenge or assert spoof resistance.
const THRESHOLD=0.42, AMBIGUITY=0.06;
function validDescriptor(a){return Array.isArray(a)&&a.length===128&&a.every(x=>typeof x==='number'&&Number.isFinite(x));}
function distance(a,b){let n=0;for(let i=0;i<128;i++)n+=(a[i]-b[i])**2;return Math.sqrt(n);}
async function findFaceMatch(db,descriptor,decryptDescriptor){
 if(!validDescriptor(descriptor)||typeof decryptDescriptor!=='function')throw new TypeError('Invalid face verification inputs');
 const records=await db.collection('biometricRegistrations').find(
  {biometricStatus:'Active'},
  {projection:{_id:0,memberId:1,adminId:1,facialEncoding:1}}
 ).toArray();
 const matches=[];
 for(const r of records){
  const accountId=r.memberId||r.adminId;
  if(!accountId||!r.facialEncoding)continue;
  const role=r.memberId?'member':'admin';
  const col=db.collection(role==='member'?'members':'admins');
  const account=await col.findOne({[role==='member'?'memberId':'adminId']:accountId,status:'Active'},
   {projection:{_id:0,role:1,fullName:1}});
  if(!account||account.role==='superadmin')continue;
  let stored;
  try{stored=decryptDescriptor(r.facialEncoding);}catch(_){continue;}
  if(!validDescriptor(stored))continue;
  const d=distance(descriptor,stored);
  if(d<THRESHOLD)matches.push({accountId,role:account.role||role,fullName:account.fullName,distance:d});
 }
 matches.sort((a,b)=>a.distance-b.distance);
 const first=matches[0];
 if(!first)return {match:null,ambiguous:false};
 const second=matches.find(m=>m.accountId!==first.accountId);
 if(second&&second.distance-first.distance<AMBIGUITY)return {match:null,ambiguous:true};
 return {match:{accountId:first.accountId,role:first.role,fullName:first.fullName},ambiguous:false};
}
module.exports={findFaceMatch,validDescriptor};
