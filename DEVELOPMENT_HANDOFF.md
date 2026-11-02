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
### 2026-11-02 — development resumed after context transfer
- User requested persistent GitHub handoff notes and development **on main**, with completion of SPEC as the target.
- Squashed already-tested PR #1 to main: `6d67139320022370e4eec425cd3c466b0a3f58fa`.
- This handoff file established on main. Additional changes in this chat should be appended here after each milestone.
- Next: inspect remaining specs, implement missing features and security controls with tests, check CI, and update this entry.
