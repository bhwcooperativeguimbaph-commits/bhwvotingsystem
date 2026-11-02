# BHW Guimba — Coordinated Final Acceptance Rehearsal

**Status: not yet executed.** Run this checklist only after latest commit is deployed and the automated test report is green.

## Environment isolation

- Keep the main Render app on `BHWVotingDB` with `ENABLE_MONGODB_VOTE_TEST` **unset**.
- Create a separate, nonproduction Render service and Atlas database named `BHWVotingDB_Staging` for the full rehearsal.
- Staging uses distinct encryption and superadmin secrets, synthetic member identities, and **only two consenting custodian email recipients controlled by the testers**.
- In staging only, set `ENABLE_MONGODB_AUTH_PREVIEW=true` and `ENABLE_MONGODB_VOTE_TEST=true`. The server refuses the vote-test flag on a database without `_Staging` or `_Test` suffix.
- Do not copy real biometric samples, passwords, personal addresses, member rosters or election ballots into staging. Do not send key shares to real election officials until approved.
- **Biometric caveat:** Using the camera creates a real facial descriptor even if the profile name is fictitious. Only proceed with explicit informed consent from an adult test participant. Do not use another person's photograph or a real member's data. If the participant is not comfortable, skip the camera test and report it as *Not Run*.
- A Super Admin in an isolated staging database can purge an **unused** test member (including encrypted biometric data) from the member directory. The cleanup intentionally rejects members whose vote was recorded or who are included in a frozen electorate. Plan biometric testing before key provisioning and purge any unused account before freezing eligibility.

## Coordinated test script

| # | Scenario | Expected result |
| --- | --- | --- |
| 1 | Start site and open `/`, `/results`, `/admin-auth-preview` | Branded pages load; no real ballots displayed; no console errors |
| 2 | Submit staff login with bad password | Generic rejection, no OTP sent |
| 3 | Superadmin login with valid password then expired/incorrect email code | Rejected, attempts bounded, no session |
| 4 | Superadmin login with correct email OTP | Admin console appears; session persists after refresh |
| 5 | Create a regular administrator using staff manager | Password never echoed back; OTP sent to correct address |
| 6 | Regular admin attempts staff-management, key issuance or finalization APIs | HTTP 403, controls hidden |
| 7 | Enroll a synthetic member, valid Guimba PSGC dropdown and explicit consent | Member, encrypted face descriptor, consent and audit inserted atomically |
| 8 | Attempt non-Guimba location, unsupported image, or repeated facial descriptor | Rejected; no partially created member |
| 9 | Turn head and blink in member login challenge | Challenge accepted once; duplicate/replayed/expired challenge rejected |
| 10 | Create future election with Kagawad 1, Kapitan 2, multiple synthetic candidates | Election and candidate records present; no second overlapping active election |
| 11 | Add/rename/replace photo/remove individual candidates before key provisioning; attempt again after key provisioning | Valid pre-freeze edits succeed; locked changes fail; no malformed JPG/PNG accepted |
| 12 | Provision two custodian shares to distinct synthetic-controlled recipients | Two independent Brevo deliveries; only share hashes in database |
| 13 | Verify share 1 then share 2 on separate custodian pages | First alone insufficient; after both, election marked custody-confirmed |
| 14 | Check electorate freeze; enroll an additional member afterward | Existing frozen members eligible; newly enrolled member ineligible |
| 15 | Select too many candidates (Kagawad 2 or Kapitan 3) | Browser AND backend reject choices |
| 16 | Two concurrent submissions from same synthetic member | Exactly one participation record, encrypted ballot, receipt and notification |
| 17 | Compare encrypted ballots to participation records | No memberId or receipt code in encrypted ballot; randomized `_id` |
| 18 | Refresh voter session; inspect notifications; verify and download receipt PDF | No logout on refresh; owner-only receipt; no selections exposed |
| 19 | Close election; try finalization with incorrect/one share | Rejected without partial results |
| 20 | Finalize with correct two shares, review `/results`, download results PDF | Candidate totals correct; only aggregates shown; report hash validated |
| 21 | Deactivate a staff member, reset an administrator password, and update the Super Admin recovery email using codes sent to both old and new addresses | Existing sessions revoked; wrong/replayed/expired codes rejected; new email receives subsequent OTP |
| 22 | Perform authorized audit and disaster-recovery checks | No votes, biometric templates, OTPs or shares leak in logs |
| 23 | Send same-origin and cross-origin POST requests with and without Origin/Fetch Metadata | Same-origin succeeds as appropriate; missing/cross-site/spoofed origins return 403 before mutations |

## Acceptance progress (staging)

- **Super Admin password + Brevo OTP:** **PASS (user-confirmed)**. User signed in to `https://secongvoting.onrender.com/admin-auth-preview` and reached the protected administrator interface. This confirms one successful login path only, not expired-code, lockout, or account-recovery tests.
- **Anonymous/public staging gate:** **PASS (automated)**, using GitHub Actions with no secrets and no ballot submissions.
- **Facial challenge browser binding:** **PASS (staging automated live API)**. Following an on-time enrollment failure with the old proxy-IP binding, challenges now use a secure short-lived HttpOnly cookie. The live test confirms that a different browser binding is rejected, the originating browser can consume once, and replay is rejected. **Actual camera enrollment still requires user retest.**
- **Member biometric enrollment:** **PASS (user-confirmed)** on the staging service after the secure browser-binding challenge fix. The user successfully registered a test member through the camera workflow. Exact adult-age, names, address and locked Guimba geography UI changes are committed with green offline regression tests, but their refreshed UI is still awaiting visual confirmation.
- **Member facial login:** **NOT RUN** — requires the consenting previously enrolled member to complete a fresh face challenge and confirm session survives a page refresh. Offline matcher/session tests are green.
- **Election, independent key custodians, ballot/receipt, results:** **NOT RUN** end to end.
- **Production authorization:** **BLOCKED** pending full acceptance and privacy/security review.

## Test evidence and acceptance

Collect only sanitized evidence: deploy commit SHA, CI pass/fail status, HTTP response codes, counts and screenshots without personal data or secrets. Record each result as **Pass / Fail / Not Run**. Do not include actual OTPs, tokens, share text, encryption keys or raw facial descriptors.

**Go-live remains blocked** if any test fails or until independent reviewers approve biometric consent/retention, presentation-attack controls or alternative identity verification, ballot secrecy, access-control review, availability, backups and official election procedures.

After the staging rehearsal passes, promote code by reviewed release; **do not** simply switch the production vote-test flag to true.

## Enrollment form UX verification

Code committed and offline regression tests passed:
- Required first and last names; optional middle name; required membership area and street/house address.
- Birthdate is validated by the **Asia/Manila calendar date**, including the exact eighteenth birthday. Underage dates are prevented in the date picker and rejected by the server.
- Region III (Central Luzon), Nueva Ecija, and Guimba are **disabled** dropdowns populated from trusted reference data.
- The Guimba barangay selector initially shows `— Select your barangay —` with **no barangay selected**.
- A successful biometric registration opens an accessible confirmation popup containing the generated member ID.
- Member profile corrections accept split names and enforce the same adult-age rule.
- Existing registered members are not renamed or modified during this update.

**Remaining acceptance:** after staging auto-deploy, verify the new visual controls, a success popup with a consenting synthetic user, and user-facing validation messages. A previously enrolled face will be rejected as a duplicate; do not reenroll the same participant merely to test the popup.


## Member portal development checkpoint

Implemented and validated by offline tests and static browser checks:
- Member-only receipt history `GET /api/member/receipts`, sourced from the private participation ledger with no ballot/candidate links. Previous receipts can be restored after page refresh or across elections, independently of whether an election is currently open.
- Confirmation dialog shows counts per position before irreversible submission. After success, the member sees a receipt dialog and can download a PDF without their candidate choices.
- On a network timeout or uncertain vote response, the browser first re-reads server session/receipt status; it disables resubmission if the vote was already committed.
- Ordinary administrators are prompted to log out before using member facial sign-in. Signed-in members stay signed in across a normal refresh until their session expires.
- The ambiguous `/api/member/my-receipt` endpoint was retired in favor of explicit member-owned receipt history.
- CI now includes member receipt-owner isolation and member ballot confirmation/receipt restoration contracts. **These are offline checks, not evidence of a real camera login or live ballot transaction.**

**Next acceptance**: verify a previously enrolled consenting test member can sign in through the camera and remain signed in after a refresh. If no election is active, the member portal should show the no-current-election state and any prior receipts; this does not require enabling or casting ballots.


## Election setup and tally-readiness hardening

The following development controls were added after the member portal work:
- Candidates can be added/removed only **before key provisioning starts**, not merely before the scheduled start. A key-issuance reservation also refuses an active candidate-edit lease.
- Authorized staff see an election readiness summary (Setup, Awaiting custodians, Ready, Open, Blocked, Closed, Finalized) with confirmed custodian count, eligible voter count, recorded ballots and available actions; it never exposes key shares.
- Scheduled date/time inputs are explicitly interpreted as **Asia/Manila UTC+08:00**. Backend election creation rejects dates without an explicit timezone.
- Before aggregate results are published, the finalization transaction compares accepted participation records against anonymous encrypted ballots. A mismatch stops finalization with an integrity failure.
- The member directory supports validated, literal searches by full name, member ID or membership area, retaining server-authorized pagination and count results.
- Activation of inactive members is blocked while an election has a frozen electorate; account deactivation remains available for security reasons. A complete per-member freeze and transaction concurrency audit is still required before production election use.

**Additional acceptance needed:** time-zone boundary test on a non-Manila administrator computer, key-provisioning/candidate-edit concurrency on live Atlas, independent custodian deliveries, intentionally mismatched synthetic ballot/participation counts in an isolated disposable test database, and confirmation that no roster state changes can improperly introduce an eligible voter.


## Verified local MongoDB replica-set integration

**PASS (automated, disposable database; no Render/Atlas credentials):** GitHub Actions starts a single-node MongoDB replica set and initializes all indexes in a local `BHWVotingDB_Integration` database. The test generates synthetic members and an election, uses a mocked Brevo delivery to two separate custodians, confirms both shares, records AES-GCM/RSA-encrypted votes and member receipts, then publishes only candidate totals after the election end.

The integration test also proves:
- a sequential duplicate vote is rejected;
- two concurrent submissions by the same member produce **exactly one accepted ballot**;
- no member ID, receipt code, or receipt timestamp is stored in encrypted ballot documents;
- each member can retrieve only their own acceptance receipt;
- the frozen eligible count and turnout percentages agree with the accepted ballot count;
- deliberately inserting an orphan participation record **blocks finalization** until the mismatch is removed;
- finalized results cannot be disclosed twice; and
- member session revocation invalidates authentication.

These tests exercise real MongoDB transactions and indexes. They do **not** replace a live staging test with camera login, Brevo deliveries, actual Atlas topology, browser PDF rendering, network interruptions, operational backups or independent election security review.

The latest serialized report is published under `ci-reports/LATEST_TEST_REPORT.json`, including independent `testExit`, `integrationExit`, and `stagingExit` fields.


## 2026-11-02 staged-code additions (not accepted in Render yet)

- Candidate edit-by-ID endpoint and inline modal now support replacing candidate names or validated JPG/PNG images before the election editing lease locks. Confirm visually with synthetic candidates.
- Mutation routes now reject missing, foreign, and invalid `Origin` headers; verify Render proxy/HTTPS header behavior during controlled staging browser tests.
- Super Admin recovery email change now requires both old and new email codes, records a non-sensitive audit event, and revokes sessions after completion. Verify that both distinct messages arrive through Brevo and that no code is logged.
- `openapi.yaml` inventories the available API routes; response schemas are still being refined. Check it against deployed API behavior before declaring parity.
- Passing offline CI is **not** live browser, Brevo, actual Atlas, accessibility or security acceptance.
