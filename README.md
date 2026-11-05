# BHW Guimba Voting System

**Current state:** integrated MongoDB Atlas application; **development/rehearsal only**, not authorized for an official election.

This repository replaces the old MySQL entry point with a MongoDB-backed election portal. It uses **BHWVotingDB** as a fresh MongoDB Atlas database. No old MySQL records require migration.

## Application entry point

- Render build command: `npm ci`
- Render start command: `npm start` (runs `node mongo-auth-preview.js`)
- Legacy MySQL reference server: `npm run start:legacy-mysql`; do not run this on Mongo-only Render.
- Local syntax and offline mock tests: `npm test`.
- Atlas readiness diagnostic: `npm run audit:mongodb`.
- Render public smoke checks: GitHub Actions → **MongoDB Preview Staging Smoke Test** (manual run).
- Full specifications and launch criteria: [SPEC.md](SPEC.md).
- Cross-chat development continuation and verified/pending work: [DEVELOPMENT_HANDOFF.md](DEVELOPMENT_HANDOFF.md).
- Staging UI walkthrough and sanitized feedback checklist: [docs/RENDER_FLOW_REVIEW.md](docs/RENDER_FLOW_REVIEW.md).
- Owner's final full-flow staging checklist: [docs/OWNER_FULL_FLOW_ACCEPTANCE.md](docs/OWNER_FULL_FLOW_ACCEPTANCE.md).
- Public `/health` exposes the Render `gitCommit` when available, and CI staging smoke rejects a deployment SHA that does not match the tested `main` commit.
- Staged HTTP endpoint inventory and selected JSON contracts: [openapi.yaml](openapi.yaml) (not yet complete production API parity).

## Render configuration

Use Render **Environment** for private values; never commit or paste secrets into GitHub or screenshots.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Atlas database connection string (secret) |
| `MONGODB_DB_NAME` | `BHWVotingDB` |
| `BIOMETRIC_KEY` | Exactly 64 hexadecimal characters; 256-bit biometric encryption key |
| `BREVO_API_KEY` | HTTPS transactional mail API key |
| `BREVO_FROM_EMAIL` | Verified sender registered with Brevo |
| `ENABLE_MONGODB_AUTH_PREVIEW` | `true` during restricted development |
| `ENABLE_MONGODB_VOTE_TEST` | **Leave unset/false**. Real vote requests stay blocked. |

The `INITIAL_SUPERADMIN_*` variables are for **one-time** account bootstrap and are not used to override existing administrator records. Remove unnecessary bootstrap credentials after provisioning is verified.

Resend and Gmail SMTP keys are not required by the MongoDB application's email-OTP flow. Brevo HTTPS is the selected provider.

## UI routes

| Page | Route |
| --- | --- |
| Home portal | `/` |
| Administrator password + Brevo OTP | `/admin-auth-preview` |
| Administration dashboard | `/admin-console` (staff session required) |
| Enroll Guimba member using facial challenge | `/member-enrollment-preview` (staff) |
| Member login, ballot, receipt and notifications | `/member-preview` |
| Confirm independent key-custodian receipt | `/custodian-confirm` |
| Published aggregate results + PDF export | `/results` |
| Administrator email-code recovery | `/admin-password-recovery` |

## Key security decisions

- An encrypted ballot contains no member identifier or receipt reference. Unique participation is tracked separately with a compound unique index on `electionId` and `memberId`.
- A ballot, participation record, receipt and member notification are inserted in one MongoDB transaction.
- Member biometric descriptors are encrypted with AES-256-GCM. Two distinct enrolled faces cannot use the same biometric enrollment identity in the guarded workflow.
- Facial challenges are generated and atomically consumed from MongoDB using short expiry and network binding. **Client-reported blinks and head turns are not certified presentation-attack detection.**
- The Super Admin alone provisions custodian shares, creates/deactivates staff accounts, and finalizes results with both custodian shares.
- Super Admin recovery/OTP address changes require a logged-in Super Admin plus separate email codes from both the current and proposed address; successful changes revoke sessions.
- Candidate names and JPG/PNG photos may be edited, added or removed only before key provisioning; the database enforces the editing lease.
- State-changing browser requests require an exact same-origin `Origin` header and reject cross-site Fetch Metadata.
- All database results shown publicly are finalized **aggregate** candidate totals, not member selections.
- A green smoke workflow is a connectivity and access-control check, **not** a security audit or permission to open voting.

## Final acceptance before real voters

1. GitHub Actions syntax and regression tests green on the exact deployed commit.
2. Deployment starts with MongoDB, creates expected Atlas indexes and passes the readiness audit.
3. Browser enrollment works on synthetic consenting users; duplicate faces and non-Guimba addresses are rejected.
4. Super Admin and regular admin OTP login, staff permissions, password recovery and session revocation are verified.
5. Two independent custodians receive and separately confirm key shares through Brevo.
6. Secure ballot UI enforces each configured position's administrator-selected maximum; simultaneous duplicate submissions cannot double-vote.
7. Authenticated members see their own receipt PDF and notifications; other members cannot view them.
8. Election closes, two-share decryption produces aggregate-only report, PDF export and integrity hash verification succeed.
9. Security/privacy review verifies biometric retention and deletion, accessibility, backup/restore, spoof-resistance risks and approved election procedures.
10. Supervising election officials explicitly approve live launch. **No live vote flag is enabled automatically.**

See [SPEC.md](SPEC.md) for the detailed engineering requirements and known limitations.
