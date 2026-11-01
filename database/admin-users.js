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
async function createAdmin(db,input,{now=new Date()}={}){
 const data=validateAdmin(input);
 const adminId='ADM-'+crypto.randomUUID();
 try{
  await db.collection('admins').insertOne({adminId,username:data.username,
   fullName:data.fullName,email:data.email,passwordHash:passwordHash(data.password),
   role:'admin',status:'Active',createdAt:now,updatedAt:now});
  return {adminId,username:data.username,fullName:data.fullName,email:data.email,status:'Active'};
 }catch(e){if(e?.code===11000)throw invalid('ADMIN_EXISTS');throw e}
}
async function updateAdminStatus(connection,adminId,status,{now=new Date()}={}){
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
    eventId:'AUD-'+crypto.randomUUID(),actorRole:'superadmin',action:'ADMIN_STATUS_CHANGED',
    targetAdminId:adminId,newStatus:status,createdAt:now
   },{session});
   updated=true;
  },{writeConcern:{w:'majority'}});
  return updated;
 }finally{await session.endSession()}
}
module.exports={createAdmin,updateAdminStatus,validateAdmin,passwordHash};
