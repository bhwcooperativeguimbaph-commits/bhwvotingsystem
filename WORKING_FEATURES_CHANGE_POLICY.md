# Working-feature preservation rule (user directive)

**Authority:** Explicit instruction from the project owner, November 3, 2026.
**Scope:** Every future ChatGPT/coding-agent session and every change proposed for this repository, including the `main` branch.

## Non-negotiable rule
**Do not change, replace, redesign, remove, refactor or reconfigure ANY feature that is already working unless the user explicitly asks you to change that feature.** Do not interpret a request to fix one issue as permission to redesign adjacent screens, change unrelated workflows, disable functionality, adjust authentication rules or rewrite the application.

## Operating procedure
1. Read this rule, `AGENTS.md`, `DEVELOPMENT_HANDOFF.md` and the user's latest instructions *before* editing.
2. Identify the exact reported defect and the minimum files/functions necessary to fix it. Preserve every unrelated behavior, route, field, feature, design, data contract and security control.
3. Make small, surgical changes; retain functional defaults and backward compatibility. Never remove a working feature to make a test pass.
4. Add narrowly scoped regression checks for the requested fix and for any immediately affected working behavior. Run existing tests and check deployment evidence; report what was and was not actually tested.
5. When an otherwise-working feature must be changed to resolve the reported defect, or if a broader architectural change is unavoidable, **get the user's explicit permission first**; otherwise leave it unchanged and explain the limitation.
6. Do not silently modify production/environment settings, secrets, databases, biometric identity, voting permissions, ballot handling, audit history or election results.
7. On finishing a session, update `DEVELOPMENT_HANDOFF.md` with the exact requested scope, surgical changes, verified checks and pending manual checks.

### Current authorized scope (November 3, 2026)
- Shorten the administrator login's recovery link to **Forgot password** (do not change the recovery flow).
- Move registration's Street / house / sitio address to immediately below Guimba barangay, retaining all validation and data fields.
- Fix registration biometric capture appearing as a darkened, apparently frozen page inside the embedded admin Registration screen. Maintain the standalone capture dialogue, consent checks, camera challenge, member enrollment and success flow.
- All other previously working functionality remains off limits until the user specifically requests its modification.
