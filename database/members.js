'use strict';
// Isolated MongoDB member repository. No biometric samples or plaintext passwords.
const crypto=require('node:crypto');
const normalizeName=x=>typeof x==='string'?x.trim().replace(/\s+/g,' '):'';
function isAdultBirthdate(value,now=new Date()){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const birth=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(birth.getTime())||birth.toISOString().slice(0,10)!==value)return false;
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))return false;
 // Registration eligibility uses the Philippine calendar day, not server UTC.
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 // February 29 turns 18 on March 1 in a non-leap year.
 const adultCutoff=new Date(Date.UTC(parts.year-18,parts.month-1,parts.day));
 return birth.getTime()<=adultCutoff.getTime();
}
function validateMember(input,{now=new Date()}={}){
 const firstName=normalizeName(input?.firstName);
 const middleName=normalizeName(input?.middleName);
 const lastName=normalizeName(input?.lastName);
 const hasStructuredNames=input?.firstName!==undefined||input?.middleName!==undefined||
   input?.lastName!==undefined;
 let name;
 if(hasStructuredNames){
  if(!firstName||!lastName||firstName.length>60||middleName.length>60||lastName.length>60)
   throw new TypeError('First name and last name are required; middle name is optional');
  name=[firstName,middleName,lastName].filter(Boolean).join(' ');
 }else{
  // Support historical records and the legacy createMember adapter.
  name=normalizeName(input?.fullName);
 }
 if(!name||name.length>100)throw new TypeError('Valid member name required');
 const area=normalizeName(input?.area);
 if(!area||area.length>100)throw new TypeError('Membership area is required');
 const loc=input?.location;
 if(!loc||loc.country!=='Philippines'||!/^nueva ecija$/i.test(String(loc.province||'').trim())||
    !/^guimba$/i.test(String(loc.city||'').trim())||!loc.barangayCode||!loc.cityCode||
    !loc.provinceCode||!loc.regionCode)
   throw new TypeError('A valid Guimba barangay is required');
 const address=normalizeName(input?.address);
 const birthdate=input?.birthdate||null,gender=input?.gender||null;
 if(input?.address!==undefined&&(!address||address.length>500))
  throw new TypeError('Street or house address is required');
 if(input?.birthdate!==undefined&&input?.birthdate!==null&&!isAdultBirthdate(birthdate,now))
  throw new TypeError('Member must be at least 18 years old');
 if(input?.gender!==undefined&&!['Male','Female'].includes(gender))
  throw new TypeError('Valid gender selection is required');
 return {fullName:name,firstName:firstName||null,middleName:middleName||null,lastName:lastName||null,
   area,address:address||null,birthdate,gender,location:{...loc},status:'Active'};
}
async function createMember(db,input,{now=new Date()}={}){
 const member=validateMember(input,{now});
 const memberId='MEM-'+crypto.randomUUID();
 await db.collection('members').insertOne({memberId,...member,createdAt:now,updatedAt:now});
 return {memberId};
}
async function getMember(db,memberId){
 if(typeof memberId!=='string'||!memberId.trim())return null;
 const item=await db.collection('members').findOne({memberId:memberId.trim()},{projection:{_id:0,memberId:1,fullName:1,area:1,status:1,location:1}});
 return item||null;
}
async function setMemberStatus(db,memberId,status,{now=new Date(),session}={}){
 if(!['Active','Inactive'].includes(status))throw new TypeError('Invalid status');
 if(status==='Active'){
  const current=await db.collection('members').findOne({memberId},
   {projection:{_id:0,status:1},...(session?{session}:{})});
  if(!current)return false;
  if(current.status!=='Active'){
   // Do not add a previously inactive member to a frozen electorate.
   // Deactivation remains available for security. A fuller per-member frozen
   // roster and concurrency audit are required before real elections.
   const frozen=await db.collection('elections').findOne({
    status:'Active',eligibilityFrozenAt:{$exists:true},endTime:{$gt:now}
   },{projection:{_id:1},...(session?{session}:{})});
   if(frozen)throw Object.assign(new Error('Election electorate is frozen'),{code:'ELECTORATE_FROZEN'});
  }
 }
 const r=await db.collection('members').updateOne({memberId},{$set:{status,updatedAt:now}},
  session?{session}:{});
 return r.matchedCount===1;
}
async function updateMemberProfile(db,memberId,input,{validateLocation,now=new Date()}={}){
 if(!/^MEM-[0-9a-f-]{36}$/i.test(memberId||'')||typeof validateLocation!=='function')
  throw new TypeError('Invalid member update request');
 const existing=await db.collection('members').findOne({memberId});
 if(!existing)return null;
 const profile=validateMember({
  ...existing,...input,fullName:input?.fullName,area:input?.area,location:input?.location,
  // Historical profile editor may still submit only a full name. In that case,
  // don't silently discard the edit because existing split-name fields exist.
  ...(input?.fullName!==undefined&&input?.firstName===undefined&&input?.lastName===undefined
    ? {firstName:undefined,middleName:undefined,lastName:undefined}:{})
 },{now});
 if(!await validateLocation(profile.location))
  throw new TypeError('Member address must be verified in Guimba');
 const changes={fullName:profile.fullName,firstName:profile.firstName,middleName:profile.middleName,
  lastName:profile.lastName,area:profile.area,address:profile.address,
  birthdate:profile.birthdate,gender:profile.gender,location:profile.location,updatedAt:now};
 const update=await db.collection('members').updateOne({memberId},{$set:changes});
 if(!update.matchedCount)return null;
 return {memberId,...changes};
}
// Status changes and audit metadata are committed together. Do not expose member
// biometric data or ballot selections in the audit record.
async function setMemberStatusWithAudit(connection,memberId,status,{
 now=new Date(),operatorId,actorRole
}={}){
 if(!connection?.db||!connection?.client||!/^MEM-[0-9a-f-]{36}$/i.test(memberId||'')||
  !['Active','Inactive'].includes(status)||!['admin','superadmin'].includes(actorRole)||
  typeof operatorId!=='string'||!operatorId)
  throw new TypeError('Invalid member status change');
 const session=connection.client.startSession();
 try{
  let changed=false;
  await session.withTransaction(async()=>{
   changed=await setMemberStatus(connection.db,memberId,status,{now,session});
   if(!changed)return;
   await connection.db.collection('auditLogs').insertOne({
    eventId:'AUD-'+crypto.randomUUID(),actorRole,operatorId,memberId,
    action:'MEMBER_STATUS_CHANGED',outcome:'success',newStatus:status,createdAt:now
   },{session});
  },{writeConcern:{w:'majority'}});
  return changed;
 }finally{await session.endSession()}
}
module.exports={isAdultBirthdate,updateMemberProfile,validateMember,createMember,getMember,
 setMemberStatus,setMemberStatusWithAudit};
