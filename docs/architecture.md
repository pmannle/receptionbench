# Offline architecture and trust boundaries

The implementation follows the technical specification's M1 slice, with a single TypeScript package to keep the initial interfaces small. Modules have distinct responsibilities:

| Module | Responsibility |
| --- | --- |
| schemas | Strict runtime validators and inferred TypeScript contracts; compile fixture/scenario references |
| fixtures | Independently authored synthetic business and ten executable cases |
| fake | Adapter lifecycle and bounded request protocol; configurable defective behavior |
| runner | Frozen zero-cost admission, unique trial namespaces, orchestration, cleanup, manifests and replay |
| evidence | SQLite transaction store; trusted identity binding, scoping, deduplication and conflict rejection |
| evaluator | Deterministic required/forbidden assertions, multiplicity, deadlines and bridge integrity |
| scoring | Equal category/scenario means, exclusions, conservative denominator, Wilson and pass-k |
| reports / cli | Escaped local reports and stable JSON CLI |

## Information flow

`prepare(context, businessFixture)` never receives caller private facts or the oracle. The fake protocol `respond(context, targetId, callerRequest)` receives only the explicit request. The runner's simulation environment observes returned effects and creates scoped evidence under locally configured producer identities. Only the evaluator sees expected outcomes. Snapshots remain diagnostic and do not award task success.

The full scenario is kept in the evidence bundle for offline evaluation, not sent to the adapter. Hidden scenarios are never part of this public package. Private adapters must not import the public oracle into provisioning or caller-model prompts.

## Evidence semantics

Event authority is checked against a trusted in-process ingress identity and allowed event types. A vendor may report acceptance, but cannot generate sink delivery or observation-closure events through that identity. Duplicate producer/event IDs deduplicate; changed content at the same key raises a conflict. Distinct IDs for two delivered messages represent two effects and fail a one-message assertion. Producer sequence is not treated as global ordering. Scoring checks both local monotonic elapsed time and receipt wall time, and does not use carrier shared-parent IDs to correlate unrelated legs.

A primary pass needs every required assertion, no forbidden effect, and complete healthy observation through the settlement window. When observation is incomplete, missing assertions and unobserved forbidden effects remain unknown. Independent evidence of a mismatch or forbidden effect still fails. A bridge needs accepted, distinct caller/counterpart legs and both simulated nonce directions. These checks establish simulation consistency only.

`evaluate` is a low-level function for normalized evidence; ingestion identity authentication belongs to the collector. Replay accepts only the declared simulation producer identities and types. There is no public callback ingress, credential handling or signature verifier in M1. Entire bundles and local caller code are under operator control. Report and event hashes are integrity checks, not signatures or evidence of external-world truth.

## Persistence and recovery

Each trial uses a SQLite file bound to its full context. `BEGIN IMMEDIATE`, primary-key uniqueness and content comparison protect concurrent duplicate insertion. SQLite commits close before ingestion returns; `synchronous=FULL` is configured. CLI arguments are passed without a shell. Trial databases survive adapter failures and can be reopened to read events. Checkpoints preserve completed trials; they do not resume the process. Output directories are reserved by `run.lock` and are not overwritten by a later run.

Adapter execution failures remain failed tasks; collector/storage failures and incomplete cleanup make the run incomplete. No retries are made, avoiding duplicate actions. M1 has no billable resources. Live orchestration later needs expiring leases, crash reconciliation and a watchdog before it can operate real legs.

## Scope and versions

SDK/schema 0.1, fixture/suite/evaluator/adapter versions and configuration hashes are recorded. M1 runs the named `core-offline` deterministic English salon simulation. Seeds are recorded but introduce no randomness into the fake system. The simulation business clock is fixed; real observation timestamps are reserved for later transports. Any evaluator change requires a new version/cohort before public comparisons. Aggregate scenario bootstrap and paired comparisons are deferred to M4; no aggregate interval is fabricated here. Audio latency/duration fields are explicitly unavailable.


## Local process boundary (M2)

`ProcessAdapter` implements the lifecycle over bounded per-operation JSON subprocess requests. It is explicitly selected for local integration checks, uses selective environment references, validates both envelopes and operation results, and redacts untrusted error details. The generic conformance checker is independent of the fake adapter and tests unique namespaces, fixture receipts, idempotency, scoped reads and cleanup of every known target, including a defective second prepare. This boundary does not change the fake-only scored runner or assign independent outcome authority to snapshots. See [process protocol](process-adapter.md) and [local integration evidence](m2-local-integration.md).
