# M0/M1 verification record

Verified locally on 2026-10-14 (America/Los_Angeles), Node 18.20.8, npm 10.8.2 and SQLite CLI 3.51.0. The repository was initially a specification-only directory without Git history. Work was implemented directly there; no original history was imported.

| Check | Observed result |
| --- | --- |
| TypeScript build / `tsc --noEmit` | Passed |
| Full `npm test` | 32 tests passed, zero failures |
| Full tests with `NODE_OPTIONS=--require=./scripts/offline-guard.cjs` | 32 passed; Node network entry points blocked |
| `validate scenarios/public` | Ten valid cases |
| `adapter check --adapter fake` | Conformance passed: prepare idempotency, fixture receipt, health, scoped snapshots, repeated cleanup |
| CLI run under network guard with only PATH in environment | Ten of ten simulated tasks passed; zero external cost |
| CLI replay under the same restricted environment | JSON report deep-equal to the original report |
| Eleven injected fake failure modes | Expected task counts asserted, including vendor crashes remaining scored failures |
| Golden evidence | Pass, fail, missing, exact duplicates, false delivery claims, cross-tenant rejection, mismatched bridge legs |
| Separate code review | Booking mutation, vendor failure taxonomy, clock and bridge issues reproduced and corrected with regression tests |

The local example is `runs/m1-final/` with `bundle.json`, `report.json`, `report.html`, ten SQLite files and a checkpoint. `runs/verification-summary.json` records the checks. Run artifacts are ignored by Git. Test commands were invoked through the installed npm CLI because this workstation's plain `npm` command is wrapped by a separate application.

The offline guard is a verification aid, not an OS sandbox. The code contains no real network transport or model driver. The CLI also rejects live flags and non-fake transports before preparation. Cached packages were used when the registry could not resolve; the runtime itself needs no registry access.

Test coverage checks include strict event/schema validation, malformed scenario predicates and payloads, mismatched fixture hashes, missing caller fields, missing capability declarations, unsafe fixture URLs, duplicate references, producer impersonation, authority escalation, wrong trial/namespace, conflicting replays, durable reopen, observed absence versus lost evidence, wrong content/recipient, duplicate and late effects, forbidden creation/change/cancellation, privacy disclosure, accepted/distinct bridge legs, wall/monotonic timing, unsupported capability denominators, category weights, Wilson/pass-k values, escaped HTML, CLI error/exit behavior, report replay and checked-in fixture consistency.

These are tests of independently authored benchmark code against simulation evidence. No original product tests, paid models, live calls, external messages, migrations, deployments or publication were run. M0 product capability rows remain source-inspected or located, never locally or live verified.

M1 does not claim process crash resume, live cleanup reconciliation, real delivery/media verification, independently calibrated semantic judges, aggregate bootstrap intervals, paired comparisons or a complete benchmark pilot. Those remain recorded in the milestone plan and private evidence-gap report.
