'use strict';
// Isolated MongoDB member repository. No biometric samples or plaintext passwords.
const crypto=require('node:crypto');
const normalizeName=x=>typeof x==='string'?x.trim().replace(/\s+/g,' '):'';
function isAdultBirthdate(value,now=new Date()){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const birth=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(birth.getTime())||birth.toISOString().slice(0,10)!==value)return false;
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))return false;
 const y=now.getUTCFullYear(),m=now.getUTCMonth(),d=now.getUTCDate();
 // A February 29 birthday turns 18 on March 1 in a non-leap year.
 const adultCutoff=new Date(Date.UTC(y-18,m,d));
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
 if(input?.birthdate!==undefined&&!isAdultBirthdate(birthdate,now))
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
async function setMemberStatus(db,memberId,status,{now=new Date()}={}){
 if(!['Active','Inactive'].includes(status))throw new TypeError('Invalid status');
 const r=await db.collection('members').updateOne({memberId},{$set:{status,updatedAt:now}});
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
module.exports={isAdultBirthdate,updateMemberProfile,validateMember,createMember,getMember,setMemberStatus};
