'use strict';
const crypto=require('node:crypto');
const clean=x=>typeof x==='string'?x.trim().replace(/\s+/g,' '):'';
function validateElection(input){
 const title=clean(input?.title);
 if(!title||title.length>150)throw new TypeError('Invalid election title');
 // Require an explicit timezone to prevent Render UTC vs Manila date shifts.
 const offsetTime=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
 if(typeof input?.startTime!=='string'||typeof input?.endTime!=='string'||
    !offsetTime.test(input.startTime)||!offsetTime.test(input.endTime))
  throw new TypeError('Election times must include a timezone (e.g. +08:00)');
 const start=new Date(input.startTime),end=new Date(input.endTime);
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>=end)
  throw new TypeError('Invalid election schedule');
 if(!Array.isArray(input?.config)||input.config.length===0)throw new TypeError('No ballot positions');
 const seen=new Set();
 const config=input.config.map(position=>{
  const name=clean(position?.title),maxVotes=position?.maxVotes;
  if(!name||name.length>50||seen.has(name.toLowerCase()))throw new TypeError('Invalid or duplicate position');
  seen.add(name.toLowerCase());
  if(!Number.isInteger(maxVotes)||maxVotes<1||maxVotes>100)throw new TypeError('Invalid maximum votes');
  if(!Array.isArray(position.candidates)||position.candidates.length<maxVotes)throw new TypeError('Insufficient candidates');
  const candidateNames=new Set();
  const candidates=position.candidates.map(candidate=>{
   const candidateName=clean(candidate?.name);
   if(!candidateName||candidateName.length>100||candidateNames.has(candidateName.toLowerCase()))
    throw new TypeError('Invalid or duplicate candidate');
   candidateNames.add(candidateName.toLowerCase());
   const photo=candidate.photo;
   if(photo!=null){
    const m=typeof photo==='string'&&photo.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/);
    if(!m||photo.length>700000)throw new TypeError('Candidate photo must be JPG or PNG under 500 KB');
    const b=Buffer.from(m[2],'base64');
    const jpg=b.length>3&&b[0]===255&&b[1]===216&&b[2]===255;
    const png=b.length>8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if(b.length>500000||!(m[1]==='jpeg'?jpg:png))throw new TypeError('Invalid candidate photo');
   }
   return {candidateId:'CAND-'+crypto.randomUUID(),name:candidateName,photo:photo||null};
  });
  return {title:name,maxVotes,candidates};
 });
 return {title,startTime:start,endTime:end,config};
}
async function createElection(connection,input,{now=new Date()}={}){
 const {db,client}=connection;
 if(!db||!client)throw new TypeError('MongoDB connection with db and client is required');
 const prepared=validateElection(input);
 if(prepared.startTime<=now)throw new TypeError('New elections must start in the future to allow key-custodian provisioning');
 const electionId='ELEC-'+crypto.randomUUID();
 const session=client.startSession();
 try {
  let saved=false;
  await session.withTransaction(async()=>{
   await db.collection('elections').updateMany({status:'Active',endTime:{$lte:now}},
    {$set:{status:'Closed',closedAt:now}},{session});
   const active=await db.collection('elections').findOne(
    {status:'Active',endTime:{$gt:now}},{session});
   if(active)throw Object.assign(new Error('An election is already open'),{code:'ACTIVE_ELECTION'});
   await db.collection('elections').insertOne({electionId,title:prepared.title,
    startTime:prepared.startTime,endTime:prepared.endTime,status:'Active',createdAt:now},{session});
   const candidates=prepared.config.flatMap(pos=>pos.candidates.map(c=>({
    ...c,electionId,position:pos.title,maxVotes:pos.maxVotes,status:'Active'
   })));
   await db.collection('candidates').insertMany(candidates,{session});
   await db.collection('auditLogs').insertOne({
    eventId:'AUD-'+crypto.randomUUID(),actorRole:'staff',action:'ELECTION_CREATED',
    electionId,createdAt:now
   },{session});
   saved=true;
  },{writeConcern:{w:'majority'}});
  if(!saved)throw new Error('Election transaction not committed');
  return {electionId};
 } catch(e){
  if(e?.code===11000)throw Object.assign(new Error('An election is already active'),{code:'ACTIVE_ELECTION'});
  throw e;
 } finally {await session.endSession();}
}
module.exports={validateElection,createElection};
