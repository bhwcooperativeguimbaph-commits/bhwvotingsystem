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
| 1 | `/` | Branded access-only landing, Member/Admin buttons, no top tabs, session status, election metadata, portal cards or rehearsal messages |
| 2 | `/admin-auth-preview` | Wrong password rejected; correct password hides username/password fields, shows only emailed OTP input; login/refresh preserve staff session |
| 3 | `/admin-console` → Dashboard | Separate Dashboard view with election totals, timeline/day and area charts plus turnout tables; privacy-suppressed small area counts |
| 4 | Registration → `/member-enrollment-preview` | Registration opens within admin sidebar; required names/address, optional middle name, 18+ Philippine date, Area dropdown with Add area action, Guimba barangay required |
| 5 | Capture biometrics | Camera opens only after valid form, captures encrypted facial descriptor and compact encrypted profile portrait with informed consent; cancel stops camera; success shows member ID |
| 6 | Members Table | Separate Members view with search/pagination, profile edits, status changes and biometric update reason; separate Audit view with filters |
| 7 | Setup Election | Separate Setup election view with four wizard steps, configurable positions and maxima, valid candidate photos and Philippine-local schedule |
| 8 | Candidate management | Add, edit name/photo, remove a single candidate before key provisioning; reject duplicates, invalid photo and over-removal |
| 9 | Super Admin → Users & Roles | Create ordinary admin, change its status; regular admin must not see Super Admin-only functions |
| 10 | Super Admin recovery settings | Two separate verification codes sent to old/new recipient addresses; successful change revokes sessions |
| 11 | Key custody | Final freeze warning shows both independent recipients, freezes roster/candidates; view provider-accepted vs independently confirmed states without seeing shares |
| 12 | `/custodian-confirm` | Two different custodians privately confirm separate shares; first alone does not unlock voting |
| 13 | `/member-preview` | Member login camera starts automatically; only Login button, face errors/success dialog; profile landing shows name, ID, enrollment portrait (or initials for older records), bell notifications and Logout; Ready to vote opens separate ballot |
| 14 | Synthetic vote + receipt | Staging-only: select photographed candidates, review a list of names with Confirm vote or Cancel to change, exactly one accepted ballot, automatically download a receipt, offer a manual retry button, then return to member profile |
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

## Updated interface review (2026-11-02)

The public landing screen is **access only**. No election name, current session, schedule, candidate list, or registered voter information should appear there. Members authenticate first, then see their own profile and eligibility.

The Admin interface now uses discrete hash-routed sidebar views (`#view-dashboard`, `#view-registration`, `#view-setup`, `#view-history`, `#view-members`, `#view-audit`, `#view-operations`, and Super Admin-only `#view-users`). Registration appears in a protected same-origin embedded form so the sidebar stays visible. Confirm no duplicate top tabs or giant all-sections scroll on desktop/mobile.

The member login attempts to start the camera on page access. If browser camera permission is refused, an error dialog appears and **Login** remains available to retry. On success, expect the personal profile hub, a collapsible notification bell with Mark as read, and a disabled **Ready to vote** control until an authorized eligible election is actually open. Existing accounts registered before photo storage was introduced may show initials until a consented new photo is captured through an approved future profile workflow.

**Safety distinction:** UI wording is final-style, but real voting remains blocked in the backend unless its isolated staging testing condition is explicitly met. A polished page is not approval to use real members or ballots. Never disclose actual voter data or private custodian shares in screenshots.
