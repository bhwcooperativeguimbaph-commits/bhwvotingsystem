'use strict';
// One-time bootstrap on an isolated test/staging database only.
// Never resets accounts, never prints credentials and never runs on primary DBs.
const crypto=require('node:crypto');
const {passwordHash}=require('./admin-users');
async function ensureStagingSuperadmin(db,env=process.env){
 const dbName=db?.databaseName;
 if(typeof dbName!=='string'||!/_(?:Staging|Test)$/i.test(dbName))
  return {status:'skipped-nonstaging'};
 const adminColl=db.collection('admins');
 const existing=await adminColl.findOne({role:'superadmin'},
  {projection:{_id:1}});
 if(existing)return {status:'already-provisioned'};
 const username=env.INITIAL_SUPERADMIN_USERNAME;
 const email=env.INITIAL_SUPERADMIN_EMAIL;
 const password=env.INITIAL_SUPERADMIN_PASSWORD;
 if(!username&&!email&&!password)return {status:'missing-configuration'};
 if(typeof username!=='string'||!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)||
  typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||
  typeof password!=='string'||password.length<16||password.length>256)
  return {status:'invalid-configuration'};
 const admin={adminId:'SUPERADMIN',username:username.toLowerCase(),
  fullName:'Super Administrator',role:'superadmin',status:'Active',
  email:email.toLowerCase(),passwordHash:passwordHash(password),createdAt:new Date()};
 try{
  await adminColl.insertOne(admin);
  return {status:'created'};
 }catch(e){
  // Parallel worker or deployment may have provisioned it first. No overwrite.
  if(e?.code===11000){
   const found=await adminColl.findOne({role:'superadmin'},
    {projection:{_id:1}});
   if(found)return {status:'already-provisioned'};
  }
  throw e;
 }
}
module.exports={ensureStagingSuperadmin};
