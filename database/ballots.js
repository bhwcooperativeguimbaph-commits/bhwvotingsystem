'use strict';
// Retired. This adapter stored a member ID beside encrypted vote choices.
// Use database/vote-service.js, which atomically writes anonymous ballots
// separately from the unique voterParticipation ledger.
async function recordEncryptedBallot(){
 const error=new Error('Unsafe legacy ballot writer retired; use castEncryptedVote');
 error.code='LEGACY_BALLOT_ADAPTER_DISABLED';
 throw error;
}
module.exports={recordEncryptedBallot};
