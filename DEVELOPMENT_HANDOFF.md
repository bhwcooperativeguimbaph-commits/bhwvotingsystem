# DEVELOPMENT_HANDOFF.md — BHW Voting System
_Last updated: 2026-11-02 (Asia/Manila)_

> **Read this file, `SPEC.md`, `README.md`, and the newest GitHub Actions results BEFORE editing code in a new chat.**
> This is the persistent cross-chat development checkpoint and decision log. Update **this file on `main` at the end of every development session** with a dated entry, exact commit SHA, evidence, remaining work, and the very next task. Never invent completion or test results.

## Project and working agreement
- Repository: https://github.com/bhwcooperativeguimbaph-commits/bhwvotingsystem
- **Authoritative development branch: `main`**. The user explicitly requested direct development on main and persistent progress notes there. Avoid long-lived alternate feature branches without a compelling safety reason.
- `SPEC.md` is the binding product specification; `docs/FINAL_ACCEPTANCE_REHEARSAL.md` documents end-to-end checks.
- Stack: Node 22, Express, MongoDB Atlas database from `MONGODB_DB_NAME=BHWVotingDB`, Render, Brevo HTTPS email for OTP and split custodian-key delivery.
- Active app: `mongo-auth-preview.js` through `npm start`; `server.js` remains the **legacy MySQL reference only**.
- **Never commit or print secrets**, real face descriptors, identity documents, password/OTP values, private election keys or individual ballot selections.
- Existing database is fresh MongoDB; **no legacy MySQL data migration**.
- **Safety:** `ENABLE_MONGODB_VOTE_TEST` must remain false/unset outside a specifically approved synthetic staging rehearsal. Never enable real voting or represent this system as approved for a real election just because code or CI passes. Facial gestures are browser-reported, not independently certified anti-spoofing.
- Required at end of each session: update this document directly on `main`; verify HEAD commit and CI; identify verified vs code-only vs pending; do not silently erase blockers.

## State when this handoff was created
- Prior branch PR #1 dashboard and history enhancements was squashed into **main** as commit `6d67139320022370e4eec425cd3c466b0a3f58fa` on 2026-11-02. Pull request: https://github.com/bhwcooperativeguimbaph-commits/bhwvotingsystem/pull/1
- Last PR CI on exact head `484040f4dd6555f5c3fc99f66dacf45f488d48b2`: **success** (https://github.com/bhwcooperativeguimbaph-commits/bhwvotingsystem/actions/runs/41455695228). This was a syntax/mocked-test CI run, not a live Atlas or physical camera acceptance.
- Integrated UI includes: split public member/admin portals, navy/emerald administrative UI, customizable four-step election setup, paginated member list, biometric replacement with mandatory reason, protected audit log filters, administrator roles, aggregate dashboard charts, publication-aware history/receipt/report UI.
- Merged feature: latest-election ballots vs lifetime ballots are clearly separated, frozen electorate and turnout displayed, history shows published state only if finalized report exists, no unfinalized result links. Added `database/election-history.js`, `tests/mongodb-election-history.test.js`, `tests/mongodb-admin-dashboard.test.js`.
- Existing security design: biometric descriptors encrypted at rest; one-use MongoDB face challenge; member/admin sessions; cipher-only anonymous ballots separate from `voterParticipation`; unique participation constraints; 2-of-2 emailed custodian shares; transactions; sanitized aggregate final reports and first-publication announcements.
- Existing automated local replica-set integration is described toward the end of `SPEC.md` and `tests/mongodb-replica-integration.test.js`. Check the latest GitHub report for actual results; do not assume it ran successfully merely because a workflow exists.

## Verified and unverified acceptance
- **Code/CI:** prior PR #1 passed its JavaScript syntax and offline contract tests. More development commits require **new** matching SHA CI evidence.
- **Unverified on live deployment:** Render using latest HEAD; actual Atlas indexes and transactions; two real Brevo custodian destinations and separate confirmations; browser facial enrollment/challenge on synthetic consenting actors; regular-admin MFA/recovery; PDF download and verify; desktop/mobile UX and accessibility; live-camera spoof resistance; operational backup/restore.
- **Production election approval:** BLOCKED by the above evidence gaps, independent biometric/privacy review, threat model, consent/deletion policy, and stakeholders' signoff.

## Remaining engineering checklist (mark complete ONLY with evidence)
- [ ] Verify complete API/frontend parity against `SPEC.md`; add missing formal `openapi.yaml` for implemented endpoints.
- [ ] Test and harden security: CSRF/Origin, role auth, account recovery, rate limits, biometric replay and session revocation.
- [ ] Finish candidate editing before key freeze and verify change/lock concurrency.
- [ ] Confirm server-side rules for dynamic position maxima, photo signature/size, 18+ Guimba validation.
- [ ] Verify historical eligibility/turnout against profile changes and concurrency.
- [ ] Validate durable 2-of-2 custody, duplicate sends, retries, lost-share/revocation plan.
- [ ] Verify live Atlas replica-set transactions incl parallel vote requests, result tally integrity and no voter-ballot linkage.
- [ ] Verify PDF outputs, member notices and public report hashes in real browsers.
- [ ] Accessibility, camera alternative, data minimization/retention/deletion, threat model, backup/restore, operational monitoring.
- [ ] Supervised, synthetic **end-to-end staging acceptance** and stakeholder authorization.
- [ ] Keep production voting disabled pending all approvals.

## Routine for subsequent chats
1. Read this file and `SPEC.md` from the latest `main`, then inspect the latest relevant commits and Actions.
2. Continue implementation directly on `main`, in small testable commits. Do not repeat completed tasks without inspecting the code.
3. Run/review CI after each major change. Keep safety gates on.
4. Update the dated session log below **on main** with changed files, commit identifiers, verification results, current blockers and next concrete step.

## Dated session log
### 2026-11-02 — Render flow-preparation development (continued)
**User direction:** Finish code features against `SPEC.md` on `main`; user will personally review the deployed Render flow and provide feedback. All changes in this log are committed directly to `main`. Use `docs/RENDER_FLOW_REVIEW.md` to guide that review.

**Completed source-code increments:**
- **Results integrity:** Browser-side SHA-256 of the canonical published aggregate report, fail-closed before displaying/downloading if the report differs from the server-stored fingerprint. `public/js/report-integrity.js`; protected route to serve script; `tests/mongodb-report-integrity-browser.test.js`. This is a content-integrity check, NOT independent election-tally certification.
- **Candidate editing/audit:** All candidate add/update/remove mutations now use the MongoDB `connection` and transaction-bound sanitized `auditLogs` entries. Expanded both mock tests and disposable replica-set integration to exercise add/update/remove and key-provisioning locks. `database/candidate-maintenance.js`, `mongo-auth-preview.js`, `tests/mongodb-candidate-maintenance.test.js`, `tests/mongodb-replica-integration.test.js`.
- **Super Admin flow:** Key-provisioning now has an explicit freeze/delivery confirmation; supervised delivery status screen and Super Admin-only `GET /api/superadmin/elections/:electionId/custodians` show provider-accepted timestamps and independent custodian confirmation without revealing shares. `database/custodian-status.js`, `services/brevo-email.js`, `database/key-provisioning.js`, admin console, OpenAPI and tests. No automatic resend of lost secret shares; policy/recovery design remains pending.
- **Additional atomic audit:** `createAdmin`, member-status activation/deactivation and member-profile correction use MongoDB transactions with sanitized audit events and authorized operator IDs. Added/updated tests in `tests/mongodb-admin-users.test.js`, `tests/mongodb-member-status-audit.test.js`, `tests/mongodb-member-profile-audit.test.js`. Member status activation continues to be blocked after electorate freeze; the strongest concurrent roster-freeze race still needs an independent review.
- **Audit UI:** Safe outcome, candidate ID and admin target references are included in protected staff audit filters; no private ballot selections or biometric templates.
- **User review preparation:** `docs/RENDER_FLOW_REVIEW.md` and README link; `SPEC.md` implementation checkpoint. User can report PASS/FAIL/NOT RUN by step without sharing passwords, face data, OTPs or key shares.

**Verification method:** `npm test` includes all added regressions; the `ci-diagnostics-report` GitHub Actions workflow runs a disposable local MongoDB replica set and credential-free public staging smoke probe. Check the latest `ci-reports/LATEST_TEST_REPORT.json` **for the exact `main` commit** before assuming a green result. Do not confuse CI tests and public HTTP probes with an authenticated end-to-end browser trial.

**Known incomplete acceptance and independent gates:**
1. Full authenticated real-browser Render staging walkthrough from `docs/RENDER_FLOW_REVIEW.md`, including consented face enrollment/login, role-based profile edits, candidate photos, and PDF downloads.
2. Brevo real two-recipient key deliveries, delivery/bounce status and approved lost-key/revocation/recovery process. Provider API acceptance is not guaranteed inbox receipt.
3. Actual MongoDB Atlas role-bound election lifecycle transactions, simultaneous roster changes and concurrent vote/receipt proof on an isolated synthetic staging database (not on the live cooperative data).
4. Independent security review of ballot secrecy, spoof-resistant identity, accessibility alternative, retention/deletion, encryption-key rotation and disaster recovery/backup/restore; official go-live signoff.
5. OpenAPI response schemas are a baseline; refine against actual response bodies and HTTP status codes.

**Next:** wait until Render reflects latest green `main`, have user follow `docs/RENDER_FLOW_REVIEW.md` with consenting synthetic test participants, triage their sanitized feedback and fix issues directly on `main`. **Never enable actual cooperative voting without all acceptance and formal approval.**

### 2026-11-02 — direct-main implementation and security increment
**Current development policy:** use `main` for future changes, update this handoff after every development session, and treat `SPEC.md` as the authoritative acceptance criteria. Do not invent finished status.

**Implemented directly on main during this session:**
1. **Candidate edit parity:** `database/candidate-maintenance.js` now handles guarded `update` alongside add/remove; new staff-only `PATCH /api/admin/elections/:electionId/candidates/:candidateId`; edit dialog and photo replacement in `public/mongo-admin-console.html`; extended `tests/mongodb-candidate-maintenance.test.js`. Candidate name changes reject duplicates per position; JPG/PNG signatures, sizes, and existing lease lock remain enforced. Actual browser and live Atlas race tests still pending.
2. **Origin/CSRF defense:** `database/request-origin.js` requires exact browser `Origin` on unsafe methods and rejects non-same-origin Fetch Metadata. Integrated in `mongo-auth-preview.js`; `tests/mongodb-origin-check.test.js` covers missing, malformed, foreign, same-site/sibling and same-origin cases. Live Render proxy behavior still needs a browser check.
3. **Super Admin email recovery:** `database/superadmin-email-change.js`, new `adminEmailChangeChallenges`/cooldown indexes, and the Super Admin-only API `/api/superadmin/email-change/{request,confirm}`. Two separate 6-digit codes are sent to the current and new email, stored as hashes, verified in a five-minute window with attempt bounds, then the address change and session revocation occur in one MongoDB transaction with a sanitized audit event. UI inside Super Admin staff settings, mock regression test `tests/mongodb-superadmin-email-change.test.js`. **Needs controlled live Brevo verification**; no email addresses or OTPs are documented here.
4. **API contracts:** `openapi.yaml` generated as a 45-operation inventory of current API entry points, with documented selected JSON fields, high-level responses, role classifications and explicit staging status. `tests/mongodb-openapi-contract.test.js` ensures registered HTTP routes appear in the inventory. **Not yet a finalized exact response/schema contract**; refine before declaring full API parity.
5. **Navigation and docs:** removed the obsolete Test Biometrics link, reconciled the UX-02 wording in `SPEC.md`, updated `README.md` and `docs/FINAL_ACCEPTANCE_REHEARSAL.md`.
6. Existing PR #1 dashboard/history changes merged to `main` as `6d67139320022370e4eec425cd3c466b0a3f58fa`; this file originated in commit `4d583c75f8d01b0857393ee7b4a6e2ba0e3263cf`.

**Verification evidence:** JavaScript/contract CI on the application code at commit `4fd34ed32e291470c04fa1d858c4b604c268a0d6` passed: https://github.com/bhwcooperativeguimbaph-commits/bhwvotingsystem/actions/runs/41457753112 . Earlier last full unit/replica report successfully completed at `849357e36c4a6777f970e794468fcf101ab09b4d`: https://github.com/bhwcooperativeguimbaph-commits/bhwvotingsystem/actions/runs/41457392909 . Subsequent documentation commits were made; check fresh `main` HEAD and most recent green runs rather than treating this prior SHA as final.

**Remaining HIGH-PRIORITY requirements:** browser end-to-end acceptance against latest Render deployment and isolated Atlas staging database; real two-address Brevo delivery; member face challenge/login with consenting test participant; key-custodian confirmation, vote concurrency, receipt PDFs, and finalized report rendering; privacy/anti-spoofing threat model; retention/deletion policy and accessible alternative identification; backup/restore and stakeholder review. Main deployment must not enable voting until approved.

**Additional staging diagnostics and repository conventions:**
- Added root `AGENTS.md` (commit `93cb08921f2ff0e1f38e3c05ba373c70a976bc82`) to make the handoff/spec/main-branch workflow easy for future coding assistants to find.
- Strict same-origin middleware initially caused a **false-failing staging script** that omitted the browser `Origin` header. Updated `scripts/check-staging-deployment.js` and `scripts/smoke-mongo-preview.js` to send same-origin headers on mutation probes; committed regression checks that enforce those headers. Added sanitized category output for challenge failures (no secret or biometric output).
- A transient subsequent staging run failed a cookie-consumption assertion; the **next run passed** without weakening the face-challenge binding rules. Monitor for recurrence and investigate any repeat failures.

**Latest VERIFIED automated evidence for commit `c860291bb7f909b196dda7e0c1b4701252c03434`:**
- `ci-reports/LATEST_TEST_REPORT.json` shows `installExit=0`, `testExit=0`, `integrationExit=0`, `stagingExit=0` and `passed=true` with `stagingPublicGatePassed=true`.
- GitHub report: https://github.com/bhwcooperativeguimbaph-commits/bhwvotingsystem/blob/ci-reports/LATEST_TEST_REPORT.json
- GitHub staging gate: https://github.com/bhwcooperativeguimbaph-commits/bhwvotingsystem/actions/runs/41458454773
- This verifies JavaScript/offline contracts, a **disposable local MongoDB replica set**, and a safe credential-free public Render staging smoke check, including anonymous auth boundaries, face-challenge browser cookie isolation and replay rejection. **No real or synthetic vote was submitted in staging by this gate.** This does NOT establish real Atlas transactional behavior, browser biometrics and PDF usability, actual Brevo delivery to two custodians or go-live approval.

**Very next task:** perform the coordinated acceptance with only consenting synthetic participants and separate staging database/credentials in `docs/FINAL_ACCEPTANCE_REHEARSAL.md`. Record real browser camera enrollment/login, distinct Brevo custodian deliveries and confirmations, an encrypted ballot/receipt transaction, and final report PDF/verification. Independently review `openapi.yaml` responses, face spoofing risks, data retention/deletion, accessible alternatives, backup/restore, then obtain election-official/security sign-off. Keep real voting disabled.

**Exact final `main` HEAD may advance when this handoff itself is committed; use GitHub branch HEAD and fresh CI to establish subsequent evidence.**

### 2026-11-02 — development resumed after context transfer
- User requested persistent GitHub handoff notes and development **on main**, with completion of SPEC as the target.
- Squashed already-tested PR #1 to main: `6d67139320022370e4eec425cd3c466b0a3f58fa`.
- This handoff file established on main. Additional changes in this chat should be appended here after each milestone.
- Next: inspect remaining specs, implement missing features and security controls with tests, check CI, and update this entry.
