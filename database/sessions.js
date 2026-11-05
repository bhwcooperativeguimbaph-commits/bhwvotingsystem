'use strict';
// Isolated MongoDB session adapter. Integrate only with authenticated routes after migration.
const crypto=require('node:crypto');
const TTL_MS=8*60*60*1000;
const hashToken=token=>crypto.createHash('sha256').update(token).digest('hex');
async function issueSession(db,{accountId,role,now=new Date()}){
 if(typeof accountId!=='string'||!accountId || !['member','admin','superadmin'].includes(role))throw new TypeError('Invalid session identity');
 const token=crypto.randomBytes(32).toString('hex');
 await db.collection('authSessions').insertOne({tokenHash:hashToken(token),accountId,role,expiresAt:new Date(now.getTime()+TTL_MS)});
 return {token,expiresAt:new Date(now.getTime()+TTL_MS)};
}
async function authenticateSession(db,token,now=new Date()){
 if(typeof token!=='string'|| !/^[0-9a-f]{64}$/.test(token))return null;
 const record=await db.collection('authSessions').findOne({tokenHash:hashToken(token),expiresAt:{$gt:now}});
 if(!record)return null;
 const collection=record.role==='member'?'members':'admins';
 const idField=record.role==='member'?'memberId':'adminId';
 const account=await db.collection(collection).findOne({[idField]:record.accountId,status:'Active'});
 // An existing session cannot override a staff account's current role.
 if(!account||(record.role!=='member'&&account.role!==record.role))return null;
 return {accountId:record.accountId,role:record.role};
}
async function revokeSession(db,token){
 if(typeof token!=='string'|| !/^[0-9a-f]{64}$/.test(token))return false;
 const r=await db.collection('authSessions').deleteOne({tokenHash:hashToken(token)});
 return r.deletedCount===1;
}
module.exports={issueSession,authenticateSession,revokeSession,hashToken};
