# MongoDB Atlas migration — staged rollout

Status: **partial MongoDB implementation; not production ready**. Fresh database selected: `BHWVotingDB`. No MySQL records will be imported. The live API in `server.js` still uses MySQL. Do not set MongoDB as the production database until the full API migration and functional validation succeed.

## Intended deployment
- Render Node.js web service: `npm start` with `PORT` supplied by Render.
- MongoDB Atlas: dedicated database user and private credentials stored only in Render environment variables.
- Environment variables: `MONGODB_URI`, `MONGODB_DB_NAME`, `BIOMETRIC_KEY`, `INITIAL_SUPERADMIN_PASSWORD`, and the existing SMTP configuration. Do not commit their values.
- Install the `mongodb` Node driver before invoking `database/mongodb.js`. This module is currently isolated and not imported by the running MySQL server.

## Safeguards that must survive migration
1. One ballot per member per election, guaranteed by the unique compound index on `ballots(electionId,memberId)`, regardless of concurrent requests.
2. Ballots must remain encrypted. Enforce membership, election timing, position limits, and duplicate candidates on the server before inserting.
3. A MongoDB transaction must atomically save a ballot and its issued receipt record; do not send a successful response before commit.
4. Store only hashes of session tokens; use secure HttpOnly cookies and TTL expiration.
5. Do not expose voting choices in receipts or audit logs. Existing schema links ballots and members for duplicate prevention; review ballot secrecy architecture before production.
6. Preserve existing encrypted biometric data and secret-key management. Do not decrypt or re-encode biometric templates during a blind migration.
7. Preserve historical election results, finalized-report hashes, custodian-token procedures and notification records.
8. Atlas transactions require a supported replica set or sharded deployment. Test with a non-production database.

## Suggested sequence
1. Use a fresh Atlas database named `BHWVotingDB`; no legacy MySQL import is required.
2. Add the MongoDB driver and generate a synchronized `package-lock.json`.
3. Implement a MongoDB repository for each backend API route, retaining existing API response contracts.
4. Bootstrap the initial superadmin securely and validate geographic reference data and biometric encryption configuration.
5. Verify new ballot hashes and finalized-report hashes against expected results from synthetic election test data.
6. Exercise two simultaneous ballot submissions for the same member: exactly one may commit.
7. Test enrollment, member sessions after refresh, elections, vote limits, receipts, notifications, reports, and administrator permissions.
8. Run Render staging against Atlas with synthetic data. Only after passing tests, plan a controlled production cutover and rollback.

## Fresh database decision\nNo existing MySQL member registrations, biometric data, elections or votes need preservation. Do not run legacy import or seed production with fabricated voter records. Initial administrator provisioning must use a protected one-time process. The database name is configured through `MONGODB_DB_NAME=BHWVotingDB`, not hard-coded into application modules.\n\n## Migration foundation
`database/mongodb.js` defines the connection and candidate uniqueness, ballot uniqueness, session TTL and report indexes. It does not yet connect from the running application and is intentionally not a claim of completed MongoDB support.
