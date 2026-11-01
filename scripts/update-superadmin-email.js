'use strict';
// One-time operator-run recovery: change the Super Admin OTP recipient.
// No public endpoint. Requires existing username/password and explicit new address.
// Run only via temporary Render start command, then restore the normal command.
const {connectMongo}=require('../database/mongodb');
const {verifyPassword}=require('../database/admin-auth');
async function main(){
 const env=process.env;
 const username=env.INITIAL_SUPERADMIN_USERNAME;
 const password=env.INITIAL_SUPERADMIN_PASSWORD;
 const newEmail=env.SUPERADMIN_NEW_EMAIL;
 if(!username||!password||!newEmail||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))||
    newEmail.length>254)throw new Error('Recovery configuration missing or invalid');
 const connection=await connectMongo();
 try{
  const admins=connection.db.collection('admins');
  const admin=await admins.findOne({adminId:'SUPERADMIN',username,role:'superadmin',status:'Active'});
  if(!admin||!verifyPassword(password,admin.passwordHash))throw new Error('Existing administrator credentials do not match');
  if(admin.email===newEmail){console.log('Super Admin recipient already matches.');return;}
  const result=await admins.updateOne(
    {_id:admin._id,adminId:'SUPERADMIN',email:admin.email,passwordHash:admin.passwordHash},
    {$set:{email:newEmail,updatedAt:new Date()}});
  if(result.modifiedCount!==1)throw new Error('Concurrent account update; recovery not applied');
  console.log('Super Admin OTP recipient updated successfully.');
 }finally{await connection.client.close();}
}
main().catch(e=>{
 const c=e?.message==='Existing administrator credentials do not match'?'Credential verification failed':
  e?.message==='Recovery configuration missing or invalid'?'Missing or invalid recovery configuration':
  'Database update failed';
 console.error('Super Admin recipient update:',c);
 process.exitCode=1;
});
