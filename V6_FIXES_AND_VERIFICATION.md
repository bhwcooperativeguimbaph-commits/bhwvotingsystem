# Version 6: fixes and verification

## Root cause of the previous unchanged UI
`public/index.html` referenced `app.js?v=6` but updated JavaScript was in `public/js/app.js`.
The browser requested the wrong asset, potentially serving an old `public/app.js` left on disk or getting a 404. V6 loads `/js/app.js?v=20261026-v6` explicitly.

## Installation
1. Back up the existing project and MySQL data.
2. Replace the project folder with the V6 package **without retaining an old `public/app.js`**. Copy `.env` from your existing project (it is deliberately excluded).
3. Run `node --env-file=.env server.js` in the V6 project folder.
4. Open `http://localhost:3000/js/app.js?v=20261026-v6` in a browser: it must show current JS with `updateBallotNextButton`.
5. Hard refresh the site (Ctrl+Shift+R). In DevTools Network, confirm `GET /js/app.js?v=20261026-v6` is HTTP 200, not `GET /app.js?v=6`.

## Verify
- Setup, Step 2: Max Votes * shows `1` in every newly created position. Delete it: Next is disabled, warning appears. Enter `1`: Next enabled. Back-end rejects blank maxVotes if someone bypasses the UI.
- History & Reports: select tab and ensure saved elections display ID, dates, candidate count, ballot count, and verification status. Previously unfinalized elections will NOT contain official results. Finalize only after scheduled end, using all custodian tokens.
- Notification: finalize a sample election after its end; SQL count should equal number of registered voter accounts at that time: `SELECT election_id, COUNT(*) FROM MEMBER_INBOX_MESSAGE GROUP BY election_id;`. Log in as an existing member who was OFFLINE when results were verified; the personal inbox should contain that election result. Reload and check it persists. Log in as another member and verify a separate read state.
- Results: PDF report available only after verified finalization; download Overall and select a specific area.

## Important limits
These changes were checked with JavaScript syntax checks and static assertions, not a running MySQL server or browser in your environment. If startup displays any `DB Init Error`, resolve the SQL error before testing reporting or notifications. No existing ballots, saved results, or member records are deleted by these changes.
