'use strict';
// Explicit, one-time initial administrator provisioning for a fresh Atlas database.
// Requires INITIAL_SUPERADMIN_PASSWORD; never print or store plaintext credentials.
const crypto=require('node:crypto');
const {connectMongo,initializeMongoIndexes}=require('../database/mongodb');
async function main(){
 const password=process.env.INITIAL_SUPERADMIN_PASSWORD;
 const username=process.env.INITIAL_SUPERADMIN_USERNAME;
 const email=process.env.INITIAL_SUPERADMIN_EMAIL;
 if(!password||password.length<16||password.length>256||!username||!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)||!email||!/^\\S+@\\S+\\.\\S+$/.test(email))
  throw new Error('Set INITIAL_SUPERADMIN_USERNAME, INITIAL_SUPERADMIN_EMAIL, INITIAL_SUPERADMIN_PASSWORD (16-256 characters)');
 const connection=await connectMongo();
 try {
  await initializeMongoIndexes(connection.db);
  const admins=connection.db.collection('admins');
  // Never overwrite an existing administrator's credentials.
  const existing=await admins.findOne({},{projection:{_id:1}});
  if(existing){console.log('Provisioning skipped: administrator already exists.');return}
  const salt=crypto.randomBytes(16).toString('hex');
  const hash='scrypt$'+salt+'$'+crypto.scryptSync(password,salt,64).toString('hex');
  try {
   await admins.insertOne({adminId:'SUPERADMIN',username,fullName:'Super Administrator',
    role:'superadmin',status:'Active',email,passwordHash:hash,createdAt:new Date()});
   console.log('Initial administrator provisioned.');
  }catch(e){if(e.code===11000)console.log('Provisioning skipped: administrator already exists.');else throw e}
 }finally{await connection.client.close()}
}
main().catch(e=>{console.error('Provisioning failed:',e.message.startsWith('Set INITIAL_')?e.message:'Database error; check configuration and permissions');process.exitCode=1});
