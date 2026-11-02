# BHW Guimba Voting System — Product and Engineering Specification

**Version:** 1.0 (implementation baseline)  
**Date:** 2026-11-01  
**Target:** Node.js web application on Render, MongoDB Atlas database `BHWVotingDB`  
**Status:** **PARTIALLY IMPLEMENTED — NOT APPROVED FOR LIVE VOTING**

> This file is the source of truth for what must be built, tested, and approved. A checked-off feature means it has met the acceptance criteria, not merely that an isolated module exists. Existing implementation is split between legacy MySQL `server.js` and MongoDB `mongo-auth-preview.js`. The latter does not yet serve the full voting website.

## 1. Goals and boundaries

Deliver an accessible BHW cooperative election platform for **Guimba, Nueva Ecija, Philippines** supporting authorized member enrollment, facial login with the existing challenge sequence, election configuration, encrypted voting, custodial key handling, receipts, results, and administrative oversight.

**Binding decisions**
- **Fresh database:** `BHWVotingDB`. **No MySQL data migration** and no import of legacy member or ballot records.
- **Backend:** MongoDB Atlas via Node MongoDB driver. Retire MySQL dependency from the production execution path only after feature parity tests.
- **Hosting:** Render web service; bind to `0.0.0.0:PORT`. Support Render Free limitations.
- **Email:** Brevo Transactional Email HTTPS API, preferred over blocked SMTP ports; administrator OTP and separate election key-custodian deliveries. Never expose API credentials to browsers.
- **Facial challenge:** preserve the current **turn-left, turn-right, blink** interaction, randomized permitted ordering, short-lived one-use challenge, matching threshold and ambiguity rejection. This does **not** prove independent anti-spoofing/liveness; document and assess that risk before a real election.
- **Election position limits requested:** **Kagawad = at most 1** selection, **Kapitan = at most 2** selections. These are project-specific rules, not assumptions about public elections.
- **Candidate photos:** JPG or PNG only. Validate MIME, file signatures, and server-side size.
- **Member authentication:** a successful member login survives page refresh until expiration or logout. Admin login must not expose member camera.
- **Preserve existing frontend layout and user-facing behavior** where reasonable; adapt API to frontend contracts or update them together.

## 2. Roles, access, and privacy

| Role | Allowed capabilities | Not allowed |
| --- | --- | --- |
| Super Admin | Initial provisioning, admin management, elections, member approval, reports, audit | Bypass ballot secrecy, view plaintext individual votes |
| Admin / authorized election staff | Enroll/manage members, maintain candidates/election as configured, observe turnout | Manage superadmin credentials; vote on another member's behalf |
| Member / voter | Face login, view eligible ballot, cast exactly one ballot/election, obtain receipt, read notifications | Inspect other members, edit submitted ballot, view protected results prematurely |
| Key custodian | Receive designated key material and perform authorized disclosure/release steps | Receive other custodians' key material or all key shares by default |
| Anonymous visitor | View explicitly public election metadata and access login | Vote, enroll others, download protected reports, read turnout if not authorized |

Use server-side role checks on **every** protected route. Deny by default. No role or voter identifier may be trusted from request bodies. Cookie settings: `HttpOnly`, `Secure` under HTTPS, appropriate `SameSite`, path scope; store **hashes only** of session tokens; enforce TTL and invalidation at logout/account deactivation.

### Privacy and biometric safeguards
- Encrypt facial templates with AES-256-GCM using `BIOMETRIC_KEY` stored only in server secrets. Never log raw descriptors or photos.
- Registration/biometric updates require an authenticated authorized operator, member identity checks, and an explicit consent/retention policy.
- Distinct faces with distances within the existing ambiguity margin must fail closed; inactive identities cannot log in.
- Challenge must be bound to request/session, one-use, time-limited, and atomically consumed before issuing a session. Multi-instance deployment needs shared state (not only process memory).
- Existing browser-reported gestures are not trustworthy presentation-attack detection. Obtain an explicit security decision and appropriate independent protections before deployment in a consequential real election.
- Restrict biometric access, encrypt backups, document retention/deletion and breach response.

## 3. User-facing functional specifications

### F01 — Initial administrator bootstrap and access
- One-time, idempotent creation of Super Admin for a fresh database, with strong salted scrypt password hash, verified email address, and no plaintext secrets in logs.
- Login: password -> server-side 6-digit emailed OTP -> session issued only upon valid unexpired OTP. Per-account cooldown, max attempts, atomic consume/replay protection, five-minute expiry, and rate limiting.
- Deliver OTP via Brevo HTTPS; show errors without disclosing credentials or OTP. Support changing Super Admin recovery email through authenticated verification or a controlled one-time recovery workflow.
- Account disable, password reset/recovery, email change and logout must revoke sessions appropriately.
**Acceptance:** successful and failed-password paths; delivery to intended address; wrong/expired/replayed OTP rejected; session survives refresh and ends after logout.

### F02 — Authorized member enrollment
- Super Admin/Admin accesses member registry and registers new voters. Never allow anonymous enrollment.
- Capture required verified member identity, full name, area, Guimba address, and consent; validate Philippine PSGC hierarchy against trusted server-side data—not user-supplied names/codes alone.
- Address restriction: Region III / Central Luzon -> Nueva Ecija -> Guimba -> valid barangay; reject all other addresses.
- Capture/validate a 128-number facial descriptor and securely store encrypted biometric template; handle duplicate and ambiguous face registrations; support controlled re-enrollment.
- Unique stable member ID, status (Active/Inactive), timestamps, audit entries, and paginated member list/search. Deactivation revokes access and blocks voting.
- Operator must be able to correct member information and replace facial enrollment using authenticated endpoints.
**Acceptance:** authorized happy path and refresh; invalid city/barangay, invalid descriptor, duplicate face/identity, missing consent, oversized payload, and unauthorized requests all rejected.

### F03 — Existing facial challenge and member login
- Pre-scan returns generic recognized/not-recognized/ambiguous response without leaking the matched name.
- Challenge returns randomized existing gesture sequence, unique nonce, expiration; retain current UI.
- Face login matches encrypted templates on the server, enforces matching/ambiguity thresholds, consumes challenge exactly once, creates secure member session; no inactive member login.
- Member dashboard restores from `GET /api/session`, with `fullName`, `memberId`, `hasVoted`; no auto-logout on page refresh.
- Member camera hidden/stopped on opening the Admin view; admin login must not require member camera.
**Acceptance:** initial/refresh/logout, challenge replay, expired challenge, face ambiguity, inactive member, role separation and camera lifecycle tested in browser.

### F04 — Election creation and maintenance
- Super Admin/authorized staff create election with title, start/end datetime and timezone rules, state transitions (Draft, Scheduled, Active, Closed, Finalized), positions, candidate cards and JPG/PNG photos.
- Enforce **Kagawad max 1** and **Kapitan max 2** selections. Selection limits are authoritative server-side.
- Add/edit/remove **individual candidates** without deleting a whole position; reject duplicate candidate IDs/names in a position and invalid photos. Define behavior if candidate changes after first ballot (freeze or version ballot; must be decided before launch).
- Enforce at most one open election as designed; schedule boundary and authorization tests. Prevent concurrent activation of conflicting elections using DB constraints/coordination, not solely a prior read.
- Read-only election info compatible with frontend, including candidates, positions, photos, limits and date windows.
**Acceptance:** draft-to-close workflow; individual removal; validation; simultaneous create/activate; timezone boundary; cannot edit a ballot definition after votes without an auditable policy.

### F05 — Secure voting and receipt
- Require authenticated **Active** member, open election inside time window, server-validated candidate IDs/position limits, no duplicated candidate, and available encryption keys.
- Store ciphertext only (AES-GCM or audited equivalent) with integrity metadata. No selections in logs/receipt. Use a MongoDB **transaction** for ballot + receipt/notification and a unique compound `(electionId, memberId)` index.
- **Exactly one accepted ballot per member per election**, even on simultaneous requests, retries, or refresh; distinguish client error vs duplicate (409).
- Receipt reference generated by server only; member can download a working PDF receipt without revealing selections. Do not reveal member-vote mapping to public endpoints.
- Voting must update dashboard state and `hasVoted` promptly. Handle DB failure without issuing false success.
- Review ballot secrecy: current schema links `memberId` and encrypted ballot for duplicate enforcement; a privacy-preserving separation or explicit audited threat model is required before release.
**Acceptance:** integration test two parallel votes => exactly one committed; tampering, invalid choices, closed election, missing encryption keys, retry and PDF download.

### F06 — Election keys and custodian email
- Configure designated key custodians with verified addresses and role-authorized creation.
- Generate/share only appropriate custodian-specific token/material; deliver separately to **different** recipients via Brevo HTTPS. Never send combined election key in one message or include sensitive tokens in logs.
- Delivery request/retry must be auditable and idempotent; rate-limit and handle rejected/bounced email. Design recovery, quorum, revocation and lost-token procedures.
- Disclose/decrypt results only under authorized post-election policy and verified custodian contributions.
**Acceptance:** different recipient addresses work, no token leakage/cross-delivery, failed delivery retries do not duplicate usable shares, unauthorized disclosure fails.

### F07 — Dashboards, notifications, results, reporting
- Admin dashboard: member counts, actual valid ballot turnout, per-area statistics, election status, timeline/history, and authorized activity.
- Turnout derived from **recorded ballots**, not UI counters; correctly handle 0 eligible members. Eligibility denominator must be frozen or versioned at election start if membership changes.
- Member dashboard: election state, vote status, notifications, receipt; no others' records.
- Results: enforce disclosure timing and authorization; report tally consistency, finalized-result hash/integrity, downloadable PDFs, historical archive.
- Notification read/unread endpoints and audit trails; no plaintext vote content.
**Acceptance:** known synthetic data produces correct totals, percent, per-area views, notification state, history and report PDF downloads; closed/finalized election stays immutable.

### F08 — Administrative account management
- Super Admin can register/deactivate admins and configure appropriate permissions without allowing privilege escalation.
- Recovery email, password reset, MFA cooldowns and outstanding challenges protected and logged.
- Remove old Test Biometrics UI and backend endpoint completely; no dead navigation.
**Acceptance:** RBAC matrix tests; disabled admins cannot use old sessions; sensitive routes inaccessible to members.

## 4. Database collections and indexes

Target database name comes from `MONGODB_DB_NAME=BHWVotingDB`, **never hard-coded**. Fresh installation; no legacy MySQL import.

| Collection | Essential fields / constraints |
| --- | --- |
| `admins` | `adminId` unique, `username` unique, role, status, hashed password, MFA email |
| `members` | `memberId` unique, identity, validated Guimba location, status, timestamps |
| `biometricRegistrations` | `biometricId` unique, member/admin reference, encrypted `facialEncoding`, status; ensure 1 active per identity with a **controlled** unique partial index |
| `authSessions` | `tokenHash` unique, accountId, role, `expiresAt` TTL |
| `adminMfaChallenges` | `challengeHash` unique, code hash, attempts, expiry TTL, consumed |
| `adminMfaCooldowns` | `adminId` unique, nextAllowed |
| `elections` | `electionId` unique, title, state, dates, config version |
| `candidates` | `candidateId` unique, electionId, position, maxVotes, validated image |
| `ballots` | `ballotId` unique, electionId, ciphertext, hash, status; **no member ID or receipt link** |
| `receiptCodes` | receiptCode unique, `(electionId,memberId)` unique; confirms acceptance without linking to ballot ciphertext |
| `keyCustodians` | `(electionId,email)` unique, token/share status, delivery tracking |
| `memberInbox` | notificationId unique, memberId, electionId, notification/read state; supports multiple messages per election |
| `finalReports` | electionId unique, finalized hash and report metadata |
| `auditLogs` | timestamp index, actor, action, outcome, no secrets |

**Known issue:** preexisting `biometricRegistrations.memberId` index used sparse nonunique options; changing it directly caused MongoDB error 86. Do not drop/change it blindly. Design and execute controlled unique/partial-index migration after checking duplicates. Validate unique indexes against **actual Atlas**, not mocks only.

**Transactions:** election creation, ballot+receipt issuance, disclosure/finalization and any multi-collection consistency writes must use supported Atlas transactions and majority durability where appropriate. Handle transient transaction retries carefully.

## 5. Required HTTP/API contracts

Preserve/adapt the existing frontend paths. Names below are planning contracts, not proof of availability.

| Endpoint | Method | Access | Required behavior |
| --- | --- | --- | --- |
| `/health` | GET | Public | Status without secrets |
| `/api/face-prescan` | POST | Public throttled | Generic face match check |
| `/api/face-challenge` | POST | Public throttled | One-use gesture challenge |
| `/api/login-face` | POST | Public throttled | Verified member login |
| `/api/admin/login-password` | POST | Public throttled | Password and OTP initiation |
| `/api/admin/login-otp` | POST | Public throttled | Consume OTP, issue admin session |
| `/api/session`, `/api/logout` | GET / POST | Cookie | Restore/revoke session |
| `/api/geo/:level/:code?`, `/api/areas` | GET | Configured | Valid PSGC hierarchy |
| `/api/admin/register-member` | POST | Admin | Validate member + biometric enrollment |
| `/api/admin/members`, `/api/admin/update-member`, `/api/admin/update-member-face` | GET/POST | Admin | List, edit, reenroll |
| `/api/admin/election/create`, `/api/admin/initialize-election` | POST | Admin | Setup election + candidates |
| `/api/admin/candidate/add` | POST | Admin | Add candidate; add explicit remove/edit endpoints |
| `/api/election-info`, `/api/election/active` | GET | Public read-only | Active election, position limits and candidates |
| `/api/vote` | POST | Member | Encrypted transactional ballot + receipt |
| `/api/member/notifications`, `/.../:id/read` | GET/POST | Member | Notification list and read state |
| `/api/admin/monitoring`, `/api/admin/area-stats`, `/api/admin/timeline-stats` | GET | Admin | Turnout statistics |
| `/api/admin/history`, `/api/admin/logs` | GET | Admin | History, safe audit log |
| `/api/admin/disclose-results`, `/api/admin/final-report/:id` | POST/GET | Authorized | Custodian-controlled final reports |
| `/api/superadmin/register-admin`, `/api/superadmin/users`, `/api/superadmin/toggle-status` | POST/GET | Super Admin | Admin account lifecycle |
| `/api/superadmin/set-email`, `/api/superadmin/request-reset`, `/api/superadmin/verify-reset`, `/api/superadmin/reset-status` | Mixed | Defined auth/recovery | Protected recovery |

Document actual JSON request/response schemas and status codes in an `openapi.yaml` before declaring API parity. Authentication includes Origin/CSRF protections and request-size limits.

## 6. Email delivery specifications

- Preferred provider: **Brevo v3 HTTPS transactional API** `POST /v3/smtp/email`; sender verified in Brevo.
- Server-only variables: `BREVO_API_KEY`, `BREVO_FROM_EMAIL`. Maintain sender authorization and account sending status.
- Use separate templates, purposes and rate limits for `ADMIN_LOGIN_OTP`, `PASSWORD_RECOVERY`, `CUSTODIAN_KEY_SHARE`, and notifications as approved.
- Record provider message ID and delivery status, **not** message contents containing secrets. A successful HTTP response is acceptance by provider, not guaranteed inbox delivery; use delivery/bounce event handling as available.
- Test delivery to **two different authorized recipients** before enabling key-custodian workflow. Protect against recipient enumeration and resend abuse.
- SMTP fallback must not silently circumvent policy or attempt blocked Render Free ports.

## 7. Deployment and environment

**Required secrets/config (never commit values):**
- `MONGODB_URI`, `MONGODB_DB_NAME=BHWVotingDB`
- `BIOMETRIC_KEY` (64 hex characters; controlled backup and rotation plan)
- `INITIAL_SUPERADMIN_USERNAME`, `INITIAL_SUPERADMIN_EMAIL`, `INITIAL_SUPERADMIN_PASSWORD` (bootstrap only; remove plaintext bootstrap password from Render once safely provisioned and recovered)
- `BREVO_API_KEY`, `BREVO_FROM_EMAIL`
- `PORT` provided by Render
- `ENABLE_MONGODB_AUTH_PREVIEW` only for guarded preview, not a production switch
- Other election encryption/custodian secrets as explicitly implemented, with secure rotation

**Known commands today:**
- `npm run start:atlas-probe`: isolated Atlas probe
- `npm run start:mongo-auth-preview`: *partial* authentication preview; voting disabled
- `npm start`: default MongoDB portal (requires explicit preview environment guard and MongoDB credentials); `npm run start:legacy-mysql` preserves the legacy MySQL server for reference
- `npm test`: syntax and mock-backed tests; does **not** prove end-to-end readiness
- `npm run audit:mongodb`: read-only database readiness check
- `npm run bootstrap:superadmin`: one-time guarded provisioning

**Production cutover gate:** add a new explicitly named MongoDB production start script only when complete; never repoint `npm start` while features remain absent. Stage against synthetic data; freeze release, backup, verify indexes and secrets, audit logs, cookies, HTTPS, and rollback.

## 8. Implementation backlog and evidence (as of 2026-11-01)

Status legend: **Verified** = user demonstrated against Render; **Partial** = code exists but integration/security or tests incomplete; **Missing** = not yet integrated in MongoDB app.

| Workstream | State | Evidence / next needed |
| --- | --- | --- |
| Atlas connection and `BHWVotingDB` | **Verified** | Render probe connected |
| Super Admin bootstrap | **Verified** | User saw successful initialization |
| Brevo administrator OTP delivery | **Verified** | Provider screenshot showed Delivered |
| Super Admin OTP/session | **Verified** | Browser displayed `Authenticated role: superadmin` |
| MongoDB member directory/status | **Partial** | Protected routes committed; verify runtime and authorization |
| Member creation, PSGC checks, biometric enrollment | **Partial** | Repositories exist, endpoints/UI not integrated |
| Existing facial challenge and member login | **Partial** | MongoDB preview exists; needs real enrolled test users |
| Election setup and per-candidate maintenance | **Partial** | Election create route exists; lifecycle/races/UI need work |
| Ballot validation/encryption/write | **Partial** | Isolated adapters; no active MongoDB `/api/vote` |
| Custodian key share email and disclosure | **Missing** | Design + authorized workflows + Brevo testing |
| Receipts and PDFs | **Partial** | Legacy frontend PDF exists; Mongo API integration absent |
| Dashboard, history, audits, notifications | **Partial** | Isolated turnout module; full API not integrated |
| Super Admin management/recovery | **Partial** | OTP login implemented; full account lifecycle incomplete |
| Complete frontend on MongoDB | **Partial** | New branded MongoDB portal and connected role-specific pages; full legacy UI parity and browser acceptance still pending |
| Security and integration tests | **Missing** | Real Atlas/browser election scenarios and security review |
| Production readiness | **NOT READY** | No live voting approval |

## 9. Definition of Done — non-negotiable

- [ ] All required MongoDB API routes implemented and documented; no production route depends on MySQL.
- [ ] Full existing website works with MongoDB for admin, members and voters.
- [ ] Role/CSRF/session/MFA/biometric authorization tested; no secrets or templates leaked.
- [ ] Trusted server-side Guimba/PSGC validation works end-to-end.
- [ ] Election configuration, individual candidate edit/remove, JPG/PNG validation and position limits work in UI and API.
- [ ] Secure election key management and independent custodian email deliveries to multiple addresses tested.
- [ ] Ballot encryption, integrity, **unique voter/election constraint**, atomic receipt, double-submit race and retry tests pass against Atlas.
- [ ] Secret ballot privacy and facial spoofing risks reviewed and explicitly accepted or mitigated for intended election use.
- [ ] Receipt PDF download, dashboards (nonzero turnout), notifications, history, disclosure/final report PDFs all pass browser tests.
- [ ] Real-database integration tests and end-to-end tests (including failure paths) pass; CI security dependency advisories assessed.
- [ ] Render staging healthy, backups/rollback documented, monitoring and audit logging active; no secret-bearing debug output.
- [ ] Stakeholders sign off on a non-production rehearsal election; **only then** enable real voting.

## 10. Recommended implementation sequence

1. Freeze API contracts and provide authenticated member registration with validated PSGC data and atomic biometric enrollment.
2. Verify complete member face challenge/login/logout and privilege boundaries on seeded **synthetic** accounts.
3. Complete election CRUD, lifecycle, individual candidate management and concurrent-election protection.
4. Design and verify encryption/custodian token model, then implement Brevo key-share delivery and quorum-based results disclosure.
5. Integrate `/api/vote` with atomic ballot+receipt transaction, correct candidate mapping, race-safe uniqueness and failure handling.
6. Integrate notifications, results, dashboards, PDFs and full frontend.
7. Complete real Atlas integration tests, browser end-to-end checks, privacy/security review and controlled Render cutover.

**No step may be reported as complete solely because its script was committed.** Add links to passing CI runs, relevant staging test logs, and acceptance evidence alongside each checked item.

## 11. MongoDB rehearsal implementation — 2026-11-01

**Code added; not production acceptance evidence.** The Render authentication preview now has protected member enrollment, verified Guimba dropdowns, a camera-based enrollment preview reusing the original facial challenge, member face-login/ballot rehearsal, and administrative election setup, directory, turnout, and key-custodian operations.

- UI: `/admin-auth-preview`, `/admin-console` (superadmin), `/member-enrollment-preview` (superadmin), `/member-preview`, `/custodian-confirm`.
- APIs: `POST /api/admin/register-member`, `GET /api/geo/:level/:code?`, `GET /api/admin/members`, `PATCH /api/admin/members/:memberId/status`, `POST /api/admin/initialize-election`, `POST /api/admin/elections/:id/provision-keys`, `POST /api/key-custody/confirm`, `POST /api/vote` (disabled unless `ENABLE_MONGODB_VOTE_TEST=true`), `GET /api/receipts/:code`, `GET /api/admin/turnout/:electionId`, `POST /api/admin/elections/:id/disclose-results`, `GET /api/elections/:id/results`.
- Ballot encryption: AES-256-GCM per ballot with RSA-OAEP-SHA256 wrapping of a new AES key; election private key split into **2-of-2 XOR shares** and emailed individually via Brevo. Store public key and share hashes, not private key or plaintext shares. Both custodians must independently confirm possession before votes are accepted.
- Transactions: ballot plus receipt committed together; result finalization writes aggregate report only; single-active-election constraint is enforced with a MongoDB partial unique index.
- New standalone test pages are **rehearsal tools**, not the final original production frontend. The feature-gated vote endpoint remains **OFF** in Render unless deliberately enabled for synthetic tests.
- Required verification not yet done: complete `npm test` run on latest commit, deployment startup/index creation, enrollment with synthetic biometric participant, two Brevo custodian delivery confirmations, real MongoDB transactions, parallel ballot submissions, PDF receipt download, tally disclosure, production security/privacy review.
- Browser gesture challenges are still **client reported**. They are not independent anti-spoofing; **never claim certified liveness**.
- Run `MongoDB Preview Staging Smoke Test` GitHub Action after deploying latest code. It uses no secrets and checks health, PSGC data, and unauthorized vote/admin rejection.
- Real-user election deployment remains **blocked** pending remaining API/frontend parity, operational audits, key custody review, retention policy, and stakeholder sign-off.


## 12. Changes after first successful staging smoke test

The user confirmed a green **MongoDB Preview Staging Smoke Test #1** on 2026-11-01. This validates only the public health endpoint, Guimba barangay response, and anonymous authorization boundaries; it does not prove secure voting.

Subsequent commits implemented:
- Pre-start **individual candidate add/remove**, strict Kagawad = 1 / Kapitan = 2 election limits, JPG/PNG validation, and a per-election editing lease. Add/remove is rejected once an election has started or has any ballots.
- A member inbox notification created in the **same MongoDB transaction** as the encrypted ballot and server-issued receipt, with member-only listing and mark-as-read endpoints and UI.
- Turnout eligibility snapshot on the first qualifying read after voting starts, preventing subsequent account changes from rewriting previously captured percentages. **Caveat:** without an exact scheduled snapshot trigger, an enrollment/status change between start and first snapshot can affect the denominator; resolve before real elections.
- CI regressions for candidate edits, the critical MongoDB ballot/receipt/active-election/session indexes, and historical turnout. The GitHub Actions JavaScript workflow now executes a locked dependency installation before tests.
- New elections must start in the future so key custodians can receive and confirm their shares before voting begins.

**Mandatory remaining evidence:** latest CI results, Render deploy with current commit, synthetic member enrollment and challenge login in a browser, two distinct custodians receiving and confirming their keys, authenticated synthetic voting (only with an explicit rehearsal flag), receipt PDF, atomic duplicate-vote rejection, and finalized aggregate results after the configured close. Additional privacy/security review and complete original frontend/API parity remain open.

**Testing safety:** Never enable `ENABLE_MONGODB_VOTE_TEST=true` for real voters. A passing public smoke test must not be treated as approval to begin a live election.

## 13. Unified MongoDB UI and privacy-first ballot architecture

**Implementation committed, not yet end-to-end accepted.**

- The default `npm start` now launches `mongo-auth-preview.js`, with the MySQL server explicitly isolated as `npm run start:legacy-mysql`.
- Root `/` serves a single branded BHW Guimba portal, with shared styling and the existing Guimba emblem across login, staff administration, member enrollment, member ballot, custodian confirmation, recovery and published-result pages.
- Ordinary administrator accounts have scrypt password hashes and Brevo email OTP login, with role-based access checks and a Super Admin-only management UI. Deactivation revokes their sessions. Separate password recovery uses emailed expiring codes and revokes sessions after reset.
- Member directory offers status controls and Guimba-validated profile corrections. Biometric enrollment records consent and enrolling staff identity with encrypted templates.
- Candidate management includes photo uploads, restrictions to JPG/PNG, and individual pre-start add/remove operations; the voting UI shows candidate photos.
- Finalized election aggregate results are published through `/results`, with report-hash verification and standalone PDF export. No individual ballot selections or voter IDs appear in public reports.
- **Ballot privacy change:** the `ballots` collection stores `ballotId`, electionId, encryptedVote, voteHash and a coarse time bucket, **never memberId or receiptCode**. A separate `voterParticipation` collection uniquely indexes `(electionId,memberId)` and stores private acceptance receipts. `receiptCodes` and member inbox relate to participation, not ballot ciphertext.
- Schema initialization auto-drops obsolete voter-linkage indexes **only if old ballot/receipt collections are empty**. If they contain data, startup must halt for reviewed migration. User explicitly specified fresh `BHWVotingDB` and no MySQL history to migrate.
- The former `database/ballots.js` voter-linked writer is retired and throws on use. The authoritative vote path is `database/vote-service.js`.
- Audit events for enrollment, election creation, key issuance, ballot acceptance and result finalization are inserted inside their corresponding MongoDB transactions without copying vote selections or private key shares.
- Optional `ENABLE_MONGODB_VOTE_TEST` remains **absent/false** in Render; it is not needed for portal/UI development and must not be enabled for a real election without full acceptance.
- **Remaining mandatory gates:** full automated CI results for latest commit; MongoDB deployment and index migration verification; end-to-end facial enrollment/session workflows; two-recipient Brevo custodian receipts; live Atlas transaction concurrency tests; PDF format/download checks; permissions, privacy/anti-spoofing, accessibility and disaster-recovery reviews; complete original frontend parity; stakeholder rehearsal and approval.
- **Agreed development sequence:** complete code and UI changes first; user conducts one coordinated browser acceptance test afterward. No intermediate user testing required simply to continue coding.


## 14. Final UI preparation and persistent authentication challenges

Additional completed code (not yet live acceptance evidence):
- Corrected automated election-limit assertion and added UI navigation/DOM integrity checks.
- Registered member directory now provides paginated records rather than stopping at the first 100; original street address, birthdate, gender and Guimba address are preserved.
- Candidate photo upload request limit now accommodates validated 500 KB JPG/PNG photos.
- Face login and enrollment challenges are issued and **atomically consumed** in MongoDB (`faceChallenges` with unique challenge hash, network hash and TTL) instead of the server's volatile JavaScript Map.
- `scripts/mongodb-readiness.js` now validates unique `voterParticipation`, receipts, session TTL and absence of legacy member-linked ballot indexes.
- The root `README.md` explains MongoDB default startup, the Brevo-only OTP provider, interface pages and the final acceptance procedure.
- Syntax of the updated server, challenge service and all eight browser pages was independently checked through source compilation, and all eight UI pages passed static DOM ID/reference and navigation checks. **A complete live CI and Atlas transactional test has not been observed for these new commits.**

Real voting remains disabled because `ENABLE_MONGODB_VOTE_TEST` is absent. Do not enable it for actual elections without the final supervised acceptance and presentation-attack risk assessment.
