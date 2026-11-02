'use strict';
const crypto=require('node:crypto');
const clean=x=>typeof x==='string'?x.trim().replace(/\s+/g,' '):'';
function validateArea(area){
 const name=clean(area);
 if(!name||name.length>100||/[<>\\\u0000-\u001f]/.test(name))throw new TypeError('Enter a valid area name (1–100 characters)');
 return name;
}
async function listAreas(db){
 const [saved,existing]=await Promise.all([
  db.collection('memberAreas').find({},{projection:{_id:0,name:1},sort:{name:1},limit:200}).toArray(),
  db.collection('members').distinct('area',{area:{$type:'string'}})
 ]);
 return [...new Set([...saved.map(x=>x.name),...existing].filter(x=>typeof x==='string'&&x.trim()))]
  .sort((a,b)=>a.localeCompare(b)).slice(0,200);
}
async function createArea(db,area,{operatorId,actorRole,now=new Date()}={}){
 const name=validateArea(area);
 if(!['admin','superadmin'].includes(actorRole)||!operatorId)throw new TypeError('Unauthorized area request');
 const norm=name.toLocaleLowerCase('en-US');
 try{
  await db.collection('memberAreas').insertOne({areaKey:norm,name,createdAt:now,
   createdBy:operatorId});
 }catch(e){if(e?.code===11000)throw Object.assign(new Error('Area already exists'),{code:'AREA_EXISTS'});throw e}
 await db.collection('auditLogs').insertOne({eventId:'AUD-'+crypto.randomUUID(),
  actorRole,operatorId,action:'MEMBERSHIP_AREA_ADDED',outcome:'success',createdAt:now});
 return {name};
}
module.exports={validateArea,listAreas,createArea};
