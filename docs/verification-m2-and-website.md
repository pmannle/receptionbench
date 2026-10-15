# Verification: M2 process boundary and community website

Verified 2026-10-15 on the existing local Node/npm environment.

- Full public suite: 44 tests pass with Node network entry points blocked by `scripts/offline-guard.cjs`. Existing ten-case fake execution and deterministic replay remain green.
- New process checks: strict envelopes and results, malformed/oversized output, timeouts, child environment isolation, rejected oracle fields, receipt rollback, redacted private errors, wrong-namespace reads and cleanup of a non-idempotent second preparation. A non-Error rejection also fails conformance.
- Private adapter: nine tests pass against disposable PostgreSQL, native directory/routing behavior reconciles via independent scoped reads, actual public CLI lifecycle conformance passes. Owned fixtures, containers and volumes are removed.
- Website: six data/content tests pass. Browser QA covered desktop and a 412×914 viewport, three evidence cases, clipboard status, participation brief download and mobile navigation. Module syntax and TypeScript checks pass. Local HTTP preview responds 200.
- Separate read-only review found a second-prepare target leak; a regression test reproduced it, and the conformance checker now attempts cleanup for every known target, continuing after failures and preserving the original failure.
- The original reference checkout's revision and dirty-path inventory are unchanged. No production/hosted migrations, paid models, calls, messages, public deployment or outreach occurred.

At the time of the M2 checks, the site had no configured public destinations. The owner subsequently approved the public repository and contact address, which are now configured. It provides offline commands, contribution documentation and downloadable briefs without pretending a registration was submitted. Real vendor-score comparison and broader-domain claims remain unverified; publication status is recorded separately in the launch notes. The private integration's complete scope is described in [M2 local evidence](m2-local-integration.md).
