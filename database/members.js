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
module.exports={validateMember,createMember,getMember,setMemberStatus};
