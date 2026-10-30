'use strict';
// Explicit, one-time initial administrator provisioning for a fresh Atlas database.
// Requires INITIAL_SUPERADMIN_PASSWORD; never print or store plaintext credentials.
const crypto=require('node:crypto');
const {connectMongo,initializeMongoIndexes}=require('../database/mongodb');
async function main(){
 const password=process.env.INITIAL_SUPERADMIN_PASSWORD;
 const username=process.env.INITIAL_SUPERADMIN_USERNAME;
 const email=process.env.INITIAL_SUPERADMIN_EMAIL;
 if(!password||password.length<16||password.length>256||!username||!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)||!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error('Set INITIAL_SUPERADMIN_USERNAME, INITIAL_SUPERADMIN_EMAIL, INITIAL_SUPERADMIN_PASSWORD (16-256 characters)');
 let stage='connect';
 let connection;
 try {
  connection=await connectMongo();
  stage='indexes';
  await initializeMongoIndexes(connection.db);
  stage='check-admin';
  const admins=connection.db.collection('admins');
  // Never overwrite an existing administrator's credentials.
  const existing=await admins.findOne({},{projection:{_id:1}});
  if(existing){console.log('Provisioning skipped: administrator already exists.');return}
  stage='insert-admin';
  const salt=crypto.randomBytes(16).toString('hex');
  const hash='scrypt$'+salt+'$'+crypto.scryptSync(password,salt,64).toString('hex');
  try {
   await admins.insertOne({adminId:'SUPERADMIN',username,fullName:'Super Administrator',
    role:'superadmin',status:'Active',email,passwordHash:hash,createdAt:new Date()});
   console.log('Initial administrator provisioned.');
  }catch(e){if(e.code===11000)console.log('Provisioning skipped: administrator already exists.');else throw e}
 }catch(e){
  const type= e?.code===11000?'duplicate-key': e?.code===13?'permission-denied':
    e?.name==='MongoServerSelectionError'?'network-or-server-selection':
    e?.code===18?'authentication-failed':e?.name==='MongoServerError'?'database-server-error':'other';
  console.error('Provisioning failed at '+stage+': '+type);
  if(e?.code==='INDEX_SETUP_FAILED')console.error(e.message);
  process.exitCode=1;
 }finally{if(connection)await connection.client.close()}
}
main().catch(e=>{console.error('Provisioning failed:',e.message.startsWith('Set INITIAL_')?e.message:'Unexpected initialization error');process.exitCode=1});
