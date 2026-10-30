'use strict';
const crypto=require('node:crypto');
const clean=x=>typeof x==='string'?x.trim().replace(/\s+/g,' '):'';
function validateElection(input){
 const title=clean(input?.title);
 if(!title||title.length>150)throw new TypeError('Invalid election title');
 const start=new Date(input?.startTime),end=new Date(input?.endTime);
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
   return {candidateId:'CAND-'+crypto.randomUUID(),name:candidateName,
    photo:typeof candidate.photo==='string'?candidate.photo:null};
  });
  return {title:name,maxVotes,candidates};
 });
 return {title,startTime:start,endTime:end,config};
}
async function createElection(connection,input,{now=new Date()}={}){
 const {db,client}=connection;
 if(!db||!client)throw new TypeError('MongoDB connection with db and client is required');
 const prepared=validateElection(input);
 const electionId='ELEC-'+crypto.randomUUID();
 const session=client.startSession();
 try {
  let saved=false;
  await session.withTransaction(async()=>{
   const active=await db.collection('elections').findOne(
    {status:'Active',endTime:{$gt:now}},{session});
   if(active)throw Object.assign(new Error('An election is already open'),{code:'ACTIVE_ELECTION'});
   await db.collection('elections').insertOne({electionId,title:prepared.title,
    startTime:prepared.startTime,endTime:prepared.endTime,status:'Active',createdAt:now},{session});
   const candidates=prepared.config.flatMap(pos=>pos.candidates.map(c=>({
    ...c,electionId,position:pos.title,maxVotes:pos.maxVotes,status:'Active'
   })));
   await db.collection('candidates').insertMany(candidates,{session});
   saved=true;
  },{writeConcern:{w:'majority'}});
  if(!saved)throw new Error('Election transaction not committed');
  return {electionId};
 } finally {await session.endSession();}
}
module.exports={validateElection,createElection};
