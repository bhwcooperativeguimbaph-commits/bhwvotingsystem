# BHW Voting System — owner full-flow acceptance

**Status: NOT YET EXECUTED.** This is an evidence checklist for the owner's future supervised staging test, not a production release certificate. CI, mocks and a local replica set do not establish browser, physical-camera, live Atlas, or two-inbox Brevo acceptance.

## Safety and preflight

1. Compare the most recent `main` SHA with GitHub Actions and with the `gitCommit` field in `https://secongvoting.onrender.com/health`. If missing or different, check Render's deployed commit before testing.
2. Use only an isolated `BHWVotingDB_Staging` or `_Test` database and synthetic election records for vote submission. **Never enable vote-test mode on the operational `BHWVotingDB` database.**
3. Enrollment produces a sensitive *real* facial descriptor, even with a synthetic account name. Use only a consenting adult test participant, and never send faces, identity documents, real names, OTPs, email addresses, receipts or private key shares in feedback.
4. Prior screenshots exposed key material. **Do not reuse previously disclosed shares or OTPs.** Create a fresh synthetic election and use two independent consenting custodians who control separate test inboxes.
5. For automated readiness, verify `npm test`, the disposable MongoDB replica-set integration, protected-route tests and the exact-commit staging public smoke report. `npm run audit:mongodb` is a separate *read-only* operator diagnostic requiring access to the intended test database.
6. Record the deployed SHA, database **name only** (not URI), browsers, time in Asia/Manila, and whether a backup restoration drill was actually performed.

## Owner full-flow test

Mark each result **PASS / FAIL / NOT RUN**. Do not infer PASS from a mock or CI check.

| Test | Expected outcome | Result |
| --- | --- | --- |
| F01 — Public landing | Member/Admin login gateway only; no private data or unauthorized pages | NOT RUN |
| F02 — Admin login | Correct password → six-digit email OTP, bad/expired/replayed codes rejected, refresh/logout works | NOT RUN |
| F03 — Registration form | Short registration frame, fixed sidebar, validation, 18+ dates, Guimba barangays, Area and address order | NOT RUN |
| F04 — Camera registration | Consented capture card visible, permission and retry work, Cancel releases camera, success reports member ID | NOT RUN |
| F05 — Facial member login | Fresh bound challenge works once, errors are clear, user remains logged in across refresh | NOT RUN |
| F06 — Member profile | Own identity and consented portrait/initials, bell, history, logout, readiness state | NOT RUN |
| F07 — Staff management | Regular Admin cannot access Super Admin keys/users/disclosure; status changes revoke sessions | NOT RUN |
| F08 — Staff recovery and email change | Two independent address codes, accurate dialogs, invalid codes fail, sessions revoked | NOT RUN |
| F09 — Member and audit views | Member search/page/edit/status, mandatory biometric update reason, reliable staff actor names | NOT RUN |
| F10 — Election setup | Manila-local dates, dynamic positions, maxima, photos; candidate edit allowed before custody only | NOT RUN |
| F11 — Active-election lock | No new setup while the election is active; scheduled start/end visible | NOT RUN |
| F12 — Key issuance | Exactly two distinct test custodians receive private shares through Brevo | NOT RUN |
| F13 — Custodian confirmations | 0/2 and 1/2 block vote readiness; only independently confirmed 2/2 can enable synthetic vote flow | NOT RUN |
| F14 — Ballot | Eligible synthetic member reviews choices and submits once; invalid and duplicate requests rejected | NOT RUN |
| F15 — Receipt and retry | Only after accepted transaction: random receipt, date/time, PDF auto/manual, retry does not double-submit | NOT RUN |
| F16 — Election close and disclosure | Before end denied; invalid shares denied; correct two shares finalize exactly once | NOT RUN |
| F17 — Results / notifications | Permanent integrity-verified aggregate PDF/CSV, one announcement, suppressed small area counts | NOT RUN |
| F18 — UX / accessibility | Desktop + mobile, focus/keyboard dialogs, failed camera and network recovery | NOT RUN |
| F19 — Operations | Live Atlas staging transaction behavior, security checks, backup/restore, monitoring, incident response | NOT RUN |
| F20 — Independent authorization | Biometric/spoofing and ballot-secrecy review, retention/deletion policy, accessible login alternative, official signoff | NOT RUN |

## Feedback format (without secrets)

```text
TEST ID:
RESULT: PASS / FAIL / NOT RUN
PAGE / ROLE:
EXPECTED:
ACTUAL:
BROWSER / DEVICE:
PHILIPPINE TIME:
DEPLOYED SHA:
SCREENSHOT: redacted, if useful
```

## Explicitly unresolved release blockers

- Browser-reported blink/turn gestures **are not certified presentation-attack detection**; independent review and a practical accessible identity alternative are necessary for consequential elections.
- Anonymous ciphertext without a voter ID does not alone eliminate inference from small groups or timing/ordering. A ballot-secrecy review remains mandatory.
- The existing **2-of-2 private share** design has no approved silent lost-share recovery mechanism; inventing bypass/escrow would require a new security design and explicit owner authorization.
- Biometrics and other personal data need finalized consent, retention, deletion, access and incident policies. Backup existence is not a demonstrated restore.
- Real voting remains **disabled** until evidence for all required checks, independent reviewer findings, and election-official authorization are recorded. Do not change production flags based solely on automated test results.

See [FINAL_ACCEPTANCE_REHEARSAL.md](FINAL_ACCEPTANCE_REHEARSAL.md) for the longer 23-scenario security/transaction rehearsal, and [RENDER_FLOW_REVIEW.md](RENDER_FLOW_REVIEW.md) for navigation details.

## November 5 targeted regression checks (owner report)

After confirming that Render has the same exact commit SHA as GitHub:

- **Navigation:** Visit `/admin-console` and `/member-enrollment-preview` while logged out. Both protected HTML routes must return to `/`. Protected APIs must remain inaccessible (HTTP 403). The member login screen remains publicly accessible but must not expose a ballot without a valid member session. Confirm the visible Back to landing link from both logins.
- **Admin dashboard:** With no Active election, expect **No active election**, no stale historical turnout in the current-election card, and historical reports still available under the results section.
- **Member directory:** Enter the Members tab without pressing Refresh; active members should appear automatically. The default status is Active. Check searchable First name, Last name, Member ID, Area, Photo, Status, and existing edit/disable actions. Switch to Inactive/All and confirm pagination. Portraits belong only to consenting members and must not leak to logged-out users; legacy accounts without consented portrait show initials.
- **Short shares:** Create a **fresh disposable synthetic election** and verify each of two separate Brevo recipients gets only their own short code (under 90 visible characters). Each confirms privately; results must require **both** authentic codes. Do not paste either code in feedback. Existing elections issued before the upgrade still require their original long codes; these are not rekeyed.
- **Login performance:** The camera must detect whether a face is visible before starting gesture tasks. Member-registry matching remains *after* the bound challenge, because a prechallenge membership lookup would expose the biometric enrollment status of unrelated people. Record camera setup and challenge usability problems without submitting face images.

**Security note:** the screenshot shared on November 5 shows an entire private custodian share. Do not reuse that share for an official election. Its parent election can be used only for controlled test/diagnostic purposes; use a newly generated election for any later authorized process.

## November 5 follow-up targeted acceptance — new changes

Use only consented synthetic test data. In feedback, redact face photographs, member identity and **all 12-word recovery phrases**, including browser input fields.

| Case | Staging observation | State |
| --- | --- | --- |
| P01 | Open **Members table**; use the row's biometric icon. The existing member's full-width reason and consent fields appear **inside Members**, not on Registration. Cancel and successful updates return to Members. | NOT RUN |
| P02 | Create a fresh **synthetic** election with two distinct test-recipient inboxes. Each recipient receives exactly one **12-word BHW custody phrase**, not a wallet seed. | NOT RUN |
| P03 | Election reaches scheduled voting time before custodians confirm receipt; an eligible synthetic member can vote **only after the public encryption key was issued and eligibility frozen**, without any receipt-confirmation requirement. | NOT RUN |
| P04 | Attempt results publication before scheduled end: server refuses with a specific **Election is still running** response. | NOT RUN |
| P05 | After end, submit two authentic but **reversed** custody phrases. Server verifies the pair and publishes once. Entering the same phrase twice or one invalid phrase never publishes. | NOT RUN |
| P06 | Archive the published report, see it under **Archived election results**, verify the same public report and hash, then Restore. Reopening must not send duplicate notifications. | NOT RUN |
| P07 | Old, previously issued v1/v2 custodian shares still work for their original elections; **do not reuse any screenshot-exposed shares in a real election**. | NOT RUN |

The old UI's claim that receipts must be confirmed before *voting* is superseded. Confirmation remains an optional delivery acknowledgement, not a cryptographic proof or voting prerequisite. Neither this checklist nor CI authorizes a real cooperative election.
