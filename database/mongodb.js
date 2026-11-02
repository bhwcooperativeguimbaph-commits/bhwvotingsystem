'use strict';
// MongoDB migration foundation. Not enabled in production until all API routes migrate.
// Do not place plaintext candidate selections in these collections.
const { MongoClient } = require('mongodb');

const indexSpecs = {
  admins: [[{adminId:1},{unique:true}], [{username:1},{unique:true}], [{email:1},{unique:true}]],
  members: [[{memberId:1},{unique:true}]],
  elections: [[{electionId:1},{unique:true}], [{status:1,createdAt:-1}],
    [{status:1},{unique:true,partialFilterExpression:{status:'Active'},name:'single_active_election'}]],
  candidates: [[{candidateId:1},{unique:true}], [{electionId:1,position:1}]],
  ballots: [
    [{ballotId:1},{unique:true}],
    [{electionId:1,status:1}]
  ],
  voterParticipation: [[{electionId:1,memberId:1},{unique:true}], [{receiptCode:1},{unique:true}], [{memberId:1,createdAt:-1},{}]],
  authSessions: [[{tokenHash:1},{unique:true}], [{expiresAt:1},{expireAfterSeconds:0}]],
  faceChallenges: [[{challengeHash:1},{unique:true}], [{expiresAt:1},{expireAfterSeconds:0}]],
  enrollmentLocks: [[{expiresAt:1},{expireAfterSeconds:0}]],
  adminMfaCooldowns: [[{adminId:1},{unique:true}]],
  passwordResetCooldowns: [[{adminId:1},{unique:true}]],
  passwordResetChallenges: [[{challengeHash:1},{unique:true}], [{expiresAt:1},{expireAfterSeconds:0}]],
  adminMfaChallenges: [[{challengeHash:1},{unique:true}],[{expiresAt:1},{expireAfterSeconds:0}]],
  biometricRegistrations: [[{biometricId:1},{unique:true}], [{memberId:1},{sparse:true}]],
  keyCustodians: [[{electionId:1,email:1},{unique:true}]],
  finalReports: [[{electionId:1},{unique:true}]],
  resultAnnouncements: [[{electionId:1},{unique:true}], [{notificationId:1},{unique:true}], [{createdAt:-1},{}]],
  announcementReads: [[{notificationId:1,memberId:1},{unique:true}]],
  memberInbox: [[{notificationId:1},{unique:true}], [{memberId:1,createdAt:-1},{}]],
  auditLogs: [[{createdAt:-1},{}]],
  receiptCodes: [[{receiptCode:1},{unique:true}],[{electionId:1,memberId:1},{unique:true}]]
};

async function connectMongo(config = process.env) {
  const uri = config.MONGODB_URI;
  const dbName = config.MONGODB_DB_NAME;
  if (!uri || !dbName || !/^[a-zA-Z0-9_-]{1,64}$/.test(dbName))
    throw new Error('MONGODB_URI and a safe MONGODB_DB_NAME are required.');
  const client = new MongoClient(uri, {serverSelectionTimeoutMS:10000,maxPoolSize:10});
  try {
    await client.connect();
    const db=client.db(dbName);
    await db.command({ping:1});
    return {client,db};
  } catch(error) { await client.close();throw error; }
}

async function initializeMongoIndexes(db) {
  for (const [collection,specs] of Object.entries(indexSpecs)) {
    const col=db.collection(collection);
    // Fresh-database privacy upgrade: separate participation from encrypted ballots.
    // Refuse automatic change if any old ballots/receipts exist; migration must
    // then be reviewed rather than silently unlinking existing voter receipts.
    if(collection==='ballots'||collection==='receiptCodes'){
      const identityIndex=collection==='ballots'?{ballotId:1}:{receiptCode:1};
      await col.createIndex(identityIndex,{unique:true});
      const indexes=await col.listIndexes().toArray();
      const legacy=indexes.find(i=>i.unique&&
        (collection==='ballots'
          ? i.key?.electionId===1&&i.key?.memberId===1&&Object.keys(i.key).length===2
          : i.key?.ballotId===1&&Object.keys(i.key).length===1));
      if(legacy){
        if(await col.countDocuments({})>0)throw new Error(
          'Privacy schema migration blocked: existing '+collection+' require manual reconciliation');
        await db.collection('voterParticipation').createIndex({electionId:1,memberId:1},{unique:true});
        await col.dropIndex(legacy.name);
      }
    }
    // Safely replace the legacy one-notification-per-election constraint.
    // Establish notification identity uniqueness before dropping the old limit.
    if(collection==='memberInbox'){
      await col.createIndex({notificationId:1},{unique:true});
      const indexes=await col.listIndexes().toArray();
      const old=indexes.find(i=>i.unique&&i.key?.electionId===1&&i.key?.memberId===1&&
        Object.keys(i.key).length===2);
      if(old)await col.dropIndex(old.name);
    }
    for (const [keys,opts] of specs) {
      try { await col.createIndex(keys,opts); }
      catch(error) {
        // Safe diagnostic: do not log URI, documents, credentials, or driver messages.
        const code=typeof error?.code==='number'?error.code:'unknown';
        const name=Object.keys(keys).join('_');
        const failure=new Error('MongoDB index setup failed at '+collection+'.'+name+' (code '+code+')');
        failure.code='INDEX_SETUP_FAILED';
        throw failure;
      }
    }
  }
}

module.exports={connectMongo,initializeMongoIndexes,indexSpecs};
