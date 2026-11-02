# Render UI/flow review — BHW Guimba Voting System

**Review stage:** synthetic/staging usability feedback, **not authorization for a real election**.  
**Reference:** [SPEC.md](../SPEC.md), [DEVELOPMENT_HANDOFF.md](../DEVELOPMENT_HANDOFF.md), [FINAL_ACCEPTANCE_REHEARSAL.md](FINAL_ACCEPTANCE_REHEARSAL.md).  
**Separate staging deployment:** https://secongvoting.onrender.com (verify which SHA Render actually deployed before testing).

## Before you begin
- Confirm GitHub Actions on latest `main` passed and Render deployed that SHA. A green GitHub check does **not** prove the browser is serving the new build.
- Use **only** a separate `BHWVotingDB_Staging` / `_Test` database with synthetic records. Never cast actual cooperative votes from a test build.
- Real facial descriptors are sensitive personal data even if the registration name is fictitious. Use only your own data or a specifically consenting adult test participant. Do not send recordings, descriptors, passwords, OTPs, custodian shares or private identity information back in feedback.
- Keep `ENABLE_MONGODB_VOTE_TEST` **off** on the main/nonstaging deployment. In an isolated synthetic staging database, voting can be tested only under the existing explicit guard and rehearsed procedures.

## Suggested visual walkthrough

| Step | Screen / route | What should work |
| --- | --- | --- |
| 1 | `/` | Branded landing page, modest animation, separate Member/Admin buttons, responsive navigation, clearly labeled rehearsal state |
| 2 | `/admin-auth-preview` | Wrong password rejected; correct password prompts for emailed Brevo OTP; login and refresh preserve staff session |
| 3 | `/admin-console` → Dashboard | Counts, accepted ballots, latest election frozen-eligible turnout, charts and safe empty states |
| 4 | Registration → `/member-enrollment-preview` | Required first/last name and address, optional middle name, 18+ Philippine calendar, fixed Guimba chain and blank barangay choice |
| 5 | Capture biometrics | Camera opens in dialog only after valid form, left/right/blink challenge, cancel stops camera, success shows member ID; test only with consent |
| 6 | Members Table | Search/pagination, profile-edit modal, activate/deactivate safeguards, biometric replacement with written reason; view protected audit entries |
| 7 | Setup Election | Four wizard steps; create arbitrary position names and maximum selections, upload JPG/PNG candidate photos, review schedule in Philippine time |
| 8 | Candidate management | Add, edit name/photo, remove a single candidate before key provisioning; reject duplicates, invalid photo and over-removal |
| 9 | Super Admin → Users & Roles | Create ordinary admin, change its status; regular admin must not see Super Admin-only functions |
| 10 | Super Admin recovery settings | Two separate verification codes sent to old/new recipient addresses; successful change revokes sessions |
| 11 | Key custody | Final freeze warning shows both independent recipients, freezes roster/candidates; view provider-accepted vs independently confirmed states without seeing shares |
| 12 | `/custodian-confirm` | Two different custodians privately confirm separate shares; first alone does not unlock voting |
| 13 | `/member-preview` | Consented enrolled member logs in with face challenge; refresh keeps session; ballot respects configurable per-position limits |
| 14 | Synthetic vote + receipt | Staging-only: explicit ballot confirmation, exactly one vote, owner-only receipt/history and PDF without candidate selections |
| 15 | Finalize and `/results` | After election end, both valid custodian shares unlock results once; public report verifies SHA-256 and exports aggregate PDF |
| 16 | Audit and logout | Member/Admin actions distinguishable in the protected log; deactivated users and logged-out sessions lose access |

### Distinguish acceptable behavior from a defect
- An election with no frozen electorate shows **Pending** instead of an invented turnout percentage.
- A pre-finalization report is **locked**, not publicly accessible.
- Provider acceptance **does not mean** a custodian has confirmed receipt.
- Voting on the main deployment remains **disabled by design**.
- A logged-out user cannot view admin APIs; an ordinary admin cannot issue shares or finalize results.

## How to send actionable feedback

For each observed issue, provide a **sanitized** entry:

```text
PAGE / ROLE:
STEP:
EXPECTED:
ACTUAL:
SCREEN SIZE: Desktop / Mobile
TIME (Philippine time):
DEPLOYED COMMIT (if known):
BROWSER:
SCREENSHOT: (redact names, addresses, email, OTPs, faces, shares, receipts)
```

Record the result as **PASS / FAIL / NOT RUN**. A blocked or skipped test must stay NOT RUN, never PASS.

## Still required before production
- Full staging transaction flow on actual Atlas + Brevo and real-browser PDF export checks.
- Independent review of face-spoofing resistance, accessibility and an alternative identity method, privacy/retention/deletion practices, ballot secrecy, recovery/backup and official election procedures.
- Explicit authorized election-official signoff and release process. Never turn on real voting solely because screenshots or automated tests look correct.
