'use strict';
// Run after installing the MongoDB driver:
//   npm install mongodb@^6
//   node scripts/check-mongodb.js
// This script checks connectivity and never reads, writes, or prints application data.
const { connectMongo } = require('../database/mongodb');

async function main() {
  let connection;
  try {
    connection = await connectMongo();
    console.log('MongoDB Atlas connection: OK');
    console.log('Database name:', connection.db.databaseName);
    console.log('No application records were read or modified.');
  } finally {
    if (connection) await connection.client.close();
  }
}

main().catch(error => {
  // Avoid logging driver errors which can accidentally contain credentials.
  const safeCodes = new Set(['MongoServerSelectionError','MongoNetworkError','MongoParseError','MongoServerError']);
  console.error('MongoDB Atlas connection failed:',safeCodes.has(error.name)?error.name:'Configuration/connection error');
  process.exitCode=1;
});
