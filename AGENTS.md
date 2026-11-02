# Agent instructions — BHW Guimba Voting System

For any future coding assistant session in this repository:

1. **Start with [DEVELOPMENT_HANDOFF.md](DEVELOPMENT_HANDOFF.md) on the latest `main` branch**, then read [SPEC.md](SPEC.md), [README.md](README.md) and [docs/FINAL_ACCEPTANCE_REHEARSAL.md](docs/FINAL_ACCEPTANCE_REHEARSAL.md).
2. **User-designated working branch is `main`.** Make small testable commits there; do not silently return to an earlier feature branch. Check actual HEAD and CI before editing so new commits do not overwrite others' work.
3. At the **end of every coding session**, update [DEVELOPMENT_HANDOFF.md](DEVELOPMENT_HANDOFF.md) on `main` with what was changed, exact commit SHA(s), test evidence, issues that remain, and the next concrete development task. Do not represent a mocked/offline or synthetic test as live acceptance.
4. Keep changes aligned with `SPEC.md` and preserve the MongoDB/Render/Brevo architecture. `server.js` is a legacy MySQL reference; production-path code is `mongo-auth-preview.js` and `database/`.
5. Never expose or commit secrets, private custodian shares, OTP codes, user biometric descriptors, or individual ballot selections. The app uses synthetic rehearsal data until explicitly approved.
6. Never enable real voting. `ENABLE_MONGODB_VOTE_TEST` must remain absent or false outside the restricted, isolated, synthetic staging database. Facial gestures reported by the browser are not independent anti-spoofing evidence.
7. Run or check `npm test`, protected-route contract tests, local replica-set integration and the relevant GitHub Actions report for each substantive change. A passing CI run is not enough for official election authorization.

**Current status and remaining acceptance gates are maintained only in the handoff document.** Do not duplicate an outdated completion statement here.
