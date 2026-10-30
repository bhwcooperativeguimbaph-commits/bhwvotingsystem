# Guimba BHW Voting System — Updated Results, Notifications, and Setup Unlock

## Installation

1. Back up the existing project **and MySQL database**.
2. Replace `server.js`, `public/index.html`, `public/js/app.js`, and `public/css/style.css` with the supplied versions. Keep existing assets, `.env`, biometric models, and any private data.
3. Restart the Node.js application. On startup the server initializes the `ELECTION_ANNOUNCEMENT` and `MEMBER_ANNOUNCEMENT_READ` tables. Existing report snapshots are migrated into the new announcement inbox only when their stored SHA-256 hash verifies.
4. Hard-refresh the browser. Test in a nonproduction environment using a completed sample election and separate member login.

## Changes

- **Candidates no longer need to be linked to registered members.** Election setup accepts ordinary candidate names and photos. Existing `CANDIDATE.member_id` data may remain in older installations but is not required or used for notifications.
- **Election Notifications are visible on the member profile dashboard.** Empty inboxes display a placeholder, rather than hiding the whole panel. After a Super Admin verifies and finalizes results, all registered members see one system-wide announcement showing confirmed winners and unresolved tie positions. Each member can mark announcements as read independently.
- **Duplicate prevention:** `ELECTION_ANNOUNCEMENT.election_id` is unique, and notifications are created transactionally with `FINAL_ELECTION_REPORT`. Repeated unlocks never create an additional broadcast. Recipient read state has a unique `(announcement_id, voter_id)` key.
- **Tie safeguards:** A seat cutoff tie is unresolved. Only candidates strictly above the tied cutoff are announced; candidates with zero votes are not confirmed winners.
- **Setup Election unlocks when the scheduled end is reached,** using Philippine local time for the database comparison. The expired election is placed in `Ended` state on the next deployment if it hasn't yet been verified. This is *not* equivalent to `Completed`/finalized; a custodian-token verification is still required to publish results.
- **PDF reporting:** Existing overall/per-area official PDF layout remains intact. Area tallies do not declare separate area winners; individual ballots are never shown.

## Security and behavior

- The system cannot automatically announce winners at the deadline without the custodian tokens. Announcements are generated only after successful Super Admin token verification and decrypted ballot validation.
- Existing key-custodian emails used for election encryption remain; **winner/result announcements are in-system only**.
- Expired election records and their custodian tokens are preserved so results can be verified later. The History & Reports dropdown includes `Ended` elections.
- Deploying new elections is blocked while an election is still within its scheduled voting window. The underlying election initialization endpoint retains pre-existing asynchronous insert and email delivery behavior and should be integration-tested before binding use.

## Verification

Both JavaScript files pass `node --check`. MySQL integration, browser PDF rendering, and end-to-end identity/notification behavior have not been exercised against a running production instance.

## Additional update: repeat elections and permanent announcements

- Election setup defaults every new position's **Max Votes** to `1`. The number can still be changed.
- Biometric login, member directory, monitoring and area turnout now measure `has_voted` only against the **currently open election**. A member who voted in an old election is eligible again in a new election. Old encrypted votes and reports are retained.
- The cast-vote endpoint already checks `VOTE` by both `voter_id` and `election_id`. A unique index on those columns is added to enforce one ballot per member per election even under concurrent requests. Existing duplicates, if any, will prevent that migration; inspect server logs and repair historical data carefully rather than deleting it.
- Official announcements are **permanent and survive new elections, sign-outs, reads, and server restarts**. The member inbox displays the complete announcement history, not only the latest 100. Publication remains tied to verified finalization and a single announcement per election.
- Deleting an election that owns a published announcement is now blocked (`ON DELETE RESTRICT`) instead of silently erasing its official announcement. This is intentional protection of audit history. Explicit administrative removal of published announcements is not exposed in this update.
- On startup, the server migrates the old announcement foreign key to `RESTRICT`. Check logs for migration failures and restart after the schema is successfully updated.

## Version 4 changes (2026-10-26)

- Ballot access: The member's Ready to Vote control is disabled unless `/api/election-info` returns an election in its voting window with ballot positions. An empty or closed election clears old candidate selections, hides voting controls, and prevents navigating to the ballot. Server-side vote submission continues to reject non-open elections.
- Max Votes: New position inputs default to `1` and are required. Both advancement to step 3 and deployment validate a whole number 1–100, not exceeding the number of named candidates. The server rejects missing and invalid numbers; it does not silently turn blank/zero values into 1.
- Personalized election-result messages: A new `MEMBER_INBOX_MESSAGE` MySQL table stores one record per `(election_id,voter_id)` with a durable unread/read timestamp. Once results are verified and finalized, the same database transaction inserts individual inbox messages for all existing members, with no candidate-to-member links or SMTP requirement. Only the member's authenticated voter ID may fetch and mark their messages read.
- Existing verified results: On server startup, the migration backfills personal inbox messages from prior finalized election announcements and preserves any old read markers. Duplicate messages are suppressed with a unique constraint.
- Messages do not expire. Notification delivery remains conditional on cryptographic custodian-token verification and official finalization. Cutoff ties are not reported as winners. The design provides account inbox delivery when users sign in, not browser push notifications.

### Upgrade procedure
1. Back up your existing project folder and MySQL database.
2. Copy over the updated application files, keeping your existing `.env` and database.
3. Start with `node --env-file=.env server.js`; inspect server logs for database migration errors. The application auto-creates the `MEMBER_INBOX_MESSAGE` table when its DB user has `CREATE TABLE` privileges.
4. Hard-refresh the browser. Log in as an existing member and verify the **My Notifications** inbox is visible, even with no active election.
5. Test an election with no candidate ballot, missing Max Votes, and verified finalization. Verify that two different members get independent inbox records and read states.

JavaScript syntax was validated, but a live MySQL + biometric login + browser end-to-end test was not possible in this environment.
