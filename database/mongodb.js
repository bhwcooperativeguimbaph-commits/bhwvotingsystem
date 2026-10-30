'use strict';
// MongoDB migration foundation. Not enabled in production until all API routes migrate.
// Do not place plaintext candidate selections in these collections.
const { MongoClient } = require('mongodb');

const indexSpecs = {
  admins: [[{adminId:1},{unique:true}], [{username:1},{unique:true}]],
  members: [[{memberId:1},{unique:true}]],
  elections: [[{electionId:1},{unique:true}], [{status:1,createdAt:-1}]],
  candidates: [[{candidateId:1},{unique:true}], [{electionId:1,position:1}]],
  ballots: [
    [{ballotId:1},{unique:true}],
    [{electionId:1,memberId:1},{unique:true}],
    [{electionId:1,status:1}]
  ],
  authSessions: [[{tokenHash:1},{unique:true}], [{expiresAt:1},{expireAfterSeconds:0}]],
  biometricRegistrations: [[{biometricId:1},{unique:true}], [{memberId:1},{sparse:true}]],
  keyCustodians: [[{electionId:1,email:1},{unique:true}]],
  finalReports: [[{electionId:1},{unique:true}]],
  memberInbox: [[{electionId:1,memberId:1},{unique:true}]],
  auditLogs: [[{createdAt:-1},{}]],
  receiptCodes: [[{receiptCode:1},{unique:true}],[{ballotId:1},{unique:true}]]
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
    for (const [keys,opts] of specs) await col.createIndex(keys,opts);
  }
}

module.exports={connectMongo,initializeMongoIndexes,indexSpecs};
