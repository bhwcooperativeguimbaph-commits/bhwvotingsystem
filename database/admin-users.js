'use strict';
const crypto=require('node:crypto');
function invalid(code){return Object.assign(new Error(code),{code})}
function normalize(s){return typeof s==='string'?s.trim():''}
function validateAdmin(input){
 const username=normalize(input?.username).toLowerCase();
 const fullName=normalize(input?.fullName).replace(/\s+/g,' ');
 const email=normalize(input?.email).toLowerCase();
 const password=input?.password;
 if(!/^[a-z0-9][a-z0-9._-]{3,49}$/.test(username)||
    !fullName||fullName.length>100||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||
    typeof password!=='string'||password.length<16||password.length>256)
  throw invalid('INVALID_ADMIN');
 return {username,fullName,email,password};
}
function passwordHash(password){
 const salt=crypto.randomBytes(16).toString('hex');
 return 'scrypt$'+salt+'$'+crypto.scryptSync(password,salt,64).toString('hex');
}
async function createAdmin(connection,input,{now=new Date(),operatorId}={}){
 if(!connection?.db||!connection?.client||typeof operatorId!=='string'||!operatorId)
  throw invalid('INVALID_ADMIN');
 const data=validateAdmin(input),{db,client}=connection;
 const adminId='ADM-'+crypto.randomUUID(),session=client.startSession();
 try{
  await session.withTransaction(async()=>{
   await db.collection('admins').insertOne({adminId,username:data.username,
    fullName:data.fullName,email:data.email,passwordHash:passwordHash(data.password),
    role:'admin',status:'Active',createdAt:now,updatedAt:now},{session});
   await db.collection('auditLogs').insertOne({
    eventId:'AUD-'+crypto.randomUUID(),actorRole:'superadmin',operatorId,
    targetAdminId:adminId,action:'ADMIN_CREATED',outcome:'success',createdAt:now
   },{session});
  },{writeConcern:{w:'majority'}});
  return {adminId,username:data.username,fullName:data.fullName,email:data.email,status:'Active'};
 }catch(e){if(e?.code===11000)throw invalid('ADMIN_EXISTS');throw e}
 finally{await session.endSession()}
}
async function updateAdminStatus(connection,adminId,status,{now=new Date(),operatorId}={}){
 if(!/^ADM-[a-f0-9-]{36}$/i.test(adminId||'')||
    !['Active','Inactive'].includes(status))throw invalid('INVALID_ADMIN');
 const session=connection.client.startSession();
 try{
  let updated=false;
  await session.withTransaction(async()=>{
   const result=await connection.db.collection('admins').updateOne(
    {adminId,role:'admin'},{$set:{status,updatedAt:now}},{session});
   if(result.matchedCount!==1)throw invalid('ADMIN_NOT_FOUND');
   if(status==='Inactive')await connection.db.collection('authSessions').deleteMany(
    {accountId:adminId},{session});
   await connection.db.collection('auditLogs').insertOne({
    eventId:'AUD-'+crypto.randomUUID(),actorRole:'superadmin',
    ...(operatorId?{operatorId}:{}),action:'ADMIN_STATUS_CHANGED',
    targetAdminId:adminId,newStatus:status,createdAt:now
   },{session});
   updated=true;
  },{writeConcern:{w:'majority'}});
  return updated;
 }finally{await session.endSession()}
}
module.exports={createAdmin,updateAdminStatus,validateAdmin,passwordHash};
