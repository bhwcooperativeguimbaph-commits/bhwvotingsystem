'use strict';
/**
 * MongoDB ballot storage adapter (not activated by the current MySQL server).
 * Call only AFTER authenticated member, election schedule, candidate/position
 * limits, unique selections, and encrypted ballot payload are verified.
 * Do not write cleartext votes or member choices into logs or receipts.
 */
const crypto = require('node:crypto');
function requiredString(v, field) {
  if (typeof v !== 'string' || !v.trim()) throw new TypeError(field + ' required');
  return v.trim();
}
async function recordEncryptedBallot(db, { electionId, memberId, ciphertext, voteHash, now = new Date() }) {
  electionId = requiredString(electionId, 'electionId');
  memberId = requiredString(memberId, 'memberId');
  ciphertext = requiredString(ciphertext, 'ciphertext');
  voteHash = requiredString(voteHash, 'voteHash');
  if (!/^[a-f0-9]{64}$/i.test(voteHash) ||
      crypto.createHash('sha256').update(ciphertext).digest('hex') !== voteHash.toLowerCase())
    throw new Error('Encrypted ballot integrity check failed');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid ballot timestamp');
  const ballotId = 'VOTE-' + crypto.randomUUID();
  // Compound unique index on (electionId,memberId) rejects concurrent double voting.
  // Receipt uses the saved ballot ID only, never candidate selections.
  try {
    await db.collection('ballots').insertOne({
      ballotId, electionId, memberId, encryptedVote: ciphertext,
      voteHash: voteHash.toLowerCase(), status: 'Valid', createdAt: now
    }, {writeConcern:{w:'majority'}});
    return {ballotId, receiptNo:ballotId};
  } catch(err) {
    if (err?.code === 11000) {
      const e = new Error('A ballot already exists for this member and election.');
      e.code = 'DUPLICATE_BALLOT'; throw e;
    }
    throw err;
  }
}
module.exports={recordEncryptedBallot};
