'use strict';
const assert=require('node:assert/strict');
const {validateArea,listAreas,createArea}=require('../database/member-areas');
(async()=>{
 assert.equal(validateArea('  Area   One  '),'Area One');
 assert.throws(()=>validateArea('<script>'),TypeError);
 assert.throws(()=>validateArea('x'.repeat(101)),TypeError);
 const saved=[],events=[];
 const db={collection(name){
  if(name==='memberAreas')return {
   find:()=>({toArray:async()=>saved}),
   insertOne:async item=>{if(saved.some(v=>v.areaKey===item.areaKey)){
    throw Object.assign(Error('dup'),{code:11000});
   }saved.push(item)}
  };
  if(name==='members')return {distinct:async()=>['North','South','North']};
  if(name==='auditLogs')return {insertOne:async item=>events.push(item)};
  throw Error(name);
 }};
 assert.deepEqual(await listAreas(db),['North','South']);
 await assert.rejects(createArea(db,'East',{actorRole:'member',operatorId:'MEM-1'}),TypeError);
 const added=await createArea(db,'East',{actorRole:'admin',operatorId:'ADM-1'});
 assert.equal(added.name,'East');
 assert.deepEqual(await listAreas(db),['East','North','South']);
 assert.equal(events[0].action,'MEMBERSHIP_AREA_ADDED');
 assert.equal(events[0].operatorId,'ADM-1');
 await assert.rejects(createArea(db,'east',{actorRole:'admin',operatorId:'ADM-1'}),e=>e.code==='AREA_EXISTS');
 assert.equal(events.length,1);
 console.log('PASS: authorized area dropdown, deduplication, normalized creation and audit');
})().catch(e=>{console.error(e);process.exitCode=1});
