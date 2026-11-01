'use strict';
// Isolated MongoDB member repository. No biometric samples or plaintext passwords.
const crypto=require('node:crypto');
const normalizeName=x=>typeof x==='string'?x.trim().replace(/\s+/g,' '):'';
function validateMember(input){
 const name=normalizeName(input?.fullName);
 if(!name||name.length>100)throw new TypeError('Invalid member name');
 const area=normalizeName(input?.area);
 if(!area||area.length>100)throw new TypeError('Invalid member area');
 const loc=input?.location;
 if(!loc||loc.country!=='Philippines'||!/^nueva ecija$/i.test(String(loc.province||'').trim())||
    !/^guimba$/i.test(String(loc.city||'').trim())||!loc.barangayCode||!loc.cityCode||
    !loc.provinceCode||!loc.regionCode)
   throw new TypeError('Member address must be in Guimba, Nueva Ecija');
 // Geographic code relationships must be rechecked against trusted PSGC data by the API.
 return {fullName:name,area,location:{...loc},status:'Active'};
}
async function createMember(db,input,{now=new Date()}={}){
 const member=validateMember(input);
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
  fullName:input?.fullName,area:input?.area,location:input?.location
 });
 if(!await validateLocation(profile.location))
  throw new TypeError('Member address must be verified in Guimba');
 const changes={fullName:profile.fullName,area:profile.area,location:profile.location,updatedAt:now};
 const update=await db.collection('members').updateOne({memberId},{$set:changes});
 if(!update.matchedCount)return null;
 return {memberId,...changes};
}
module.exports={updateMemberProfile,validateMember,createMember,getMember,setMemberStatus};
