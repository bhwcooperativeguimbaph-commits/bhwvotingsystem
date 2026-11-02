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

**Very next task:** check newest `main` CI + replica-set workflow, inspect failures, run the safe staging smoke check, then conduct the coordinated staging acceptance in `docs/FINAL_ACCEPTANCE_REHEARSAL.md`. Independently review `openapi.yaml` schemas and address known remaining security/policy gates. No claim of production readiness.

### 2026-11-02 — development resumed after context transfer
- User requested persistent GitHub handoff notes and development **on main**, with completion of SPEC as the target.
- Squashed already-tested PR #1 to main: `6d67139320022370e4eec425cd3c466b0a3f58fa`.
- This handoff file established on main. Additional changes in this chat should be appended here after each milestone.
- Next: inspect remaining specs, implement missing features and security controls with tests, check CI, and update this entry.
