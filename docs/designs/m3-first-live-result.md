# M3: first live result and public results registry

Status: proposed design for review. No live provider resources have been provisioned. This document does not admit a run or authorize spending.

## Intended result

Call an authorized synthetic Receptionaly endpoint, ask for a named employee's booking link, explicitly consent to a text to caller ID, receive that text at a benchmark-owned number, and deterministically evaluate the receipt. Preserve the original attempt and cleanup evidence. The same black-box path must work for another vendor without proprietary code or a tester-owned Twilio account.

The first result is a narrow internal research smoke test, not completion of M3, a full receptionist score or independent certification. The public website must distinguish development simulations, local service conformance and real outcome evidence.

## Approach and alternatives

Use a bounded TwiML caller for the initial booking-link smoke test. Twilio `<Gather>` listens to a greeting or response; `<Say>` speaks a fixed request or consent response. An explicit action URL and empty-input action advance a finite state machine. Cap turns, call duration and total attempts. No general caller LLM is needed for this first path. Pin the selected speech configuration and disclose any opaque provider revision.

This is a deliberately limited, turn-based caller. Interruptions, simultaneous speech, adaptive dialogue, transfer audio and natural-conversation quality are outside its claims. Unexpected dialogue is retained as a caller limitation/inconclusive result; it never creates a pass or causes unlimited retries. Repeated requests that could duplicate business effects are not automatic recovery actions.

An alternative is a bidirectional Media Streams caller with an audio worker, ASR and TTS. It supports the later transfer/media work but adds substantial audio/timing and deployment dependencies before the first SMS outcome. A human caller is useful for unscored setup checks, but is a separate manual protocol and cannot silently substitute for the frozen automated cohort.

The full M3 acceptance criteria in specifications.md remain unchanged. A successful TwiML smoke test does not prove bidirectional transfer audio.

## Components and boundaries

- Public code: new live-pilot schemas, caller state machine, Twilio boundary, authenticated receipt collector, quota/lease logic, deterministic evaluation, redacted report export and website registry rendering.
- Private companion: Receptionaly endpoint/configuration references, native fixture setup and private integration evidence. No proprietary source moves into the public repository.
- Cloudflare: separate Worker control/webhook service; Durable Objects serialize pilot admission, number leases, callback state and deadlines. Private R2 holds restricted receipts/transcripts. The existing static Pages site remains separate.
- Secrets: provider auth and operator API credentials are secret bindings. No credential, target number, number inventory or raw transcript is checked into either repository.

The first service is operator-only. A private operator token admits a preconfigured target; browsers cannot supply arbitrary dial destinations. There is no public run button or anonymous submission API. External teams initially receive manually reviewed setup instructions and finite credits.

The pinned official Twilio SDK validates signatures. A Worker compatibility test must pass before deployment; SDK incompatibility blocks that deployment rather than silently replacing authentication with a weaker check. All callback URLs use an exact configured HTTPS origin; forwarded headers cannot choose the signature URL. Validate the complete form parameter set, account identity, call/message IDs, expected endpoints and active lease after signature verification. A valid provider signature alone is insufficient trial correlation.

## Trial lifecycle and evidence

1. Register an operator-approved target and synthetic fixture/configuration digest. Record the expected sending identities, booking URL and authorized counterpart numbers privately.
2. Freeze a new live-pilot plan. It is not a modified `core-offline` plan: the current fake-only schemas/CLI remain valid and continue rejecting live flags. Keep caller goals/turn policy apart from evaluator-only expected outcomes.
3. Atomically reserve the run budget and exclusively lease Number A, including its settlement and quarantine windows. Number B is reserved only when its separate recipient path is tested. A shared pilot coordinator enforces one active trial initially.
4. Persist an intent before calling the provider; create one call from A to the authorized target, bind its returned ID, and enforce a provider call time limit plus a watchdog. If call creation times out with uncertain outcome, reconcile before any retry. Never dial again merely because a response was lost.
5. Validate and durably retain provider callbacks. Map the fixed caller states to greeting, request, clarification/consent, acknowledgment and termination. The caller never receives the oracle. Provider transcripts are observations, not proof of message delivery.
6. Receive inbound SMS at A. Reconcile authenticated destination, expected sender, unique provider message ID, time window and active lease. The raw receipt is private. Its normalized, scoped event can establish `message.delivered` at the controlled endpoint; provider acceptance or the target's spoken promise cannot.
7. Observe the full declared settlement window, including duplicates and late messages. Reconcile incoming messages through the provider API before declaring healthy closure. Missing callbacks, API uncertainty, ambiguous sender/lease attribution or reconciliation failure prevent a pass. An unrelated inbound SMS is not automatically attributed to the target.
8. Terminate/reconcile every owned call, preserve incomplete cleanup as infrastructure failure, retain the number lease through quarantine, and reconcile charges. The evaluator checks exact URL, intended recipient, multiplicity, deadline and forbidden observed effects. It cannot infer absence of unobservable effects such as booking mutations; scenarios requiring those observations are unsupported in this profile.

Provider IDs establish deduplication; conflicting replay is rejected and diagnosed. A new ID with duplicate SMS content is a distinct business effect. Out-of-order status callbacks cannot regress terminal state. The incoming event's server receive time and provider metadata are both retained; untrusted timestamps cannot backdate a late receipt.

Provider/local timestamps, operator custody, plan/configuration digests and event hashes support replay and review; hashes are not independent-world attestation. `observation.closed` is emitted only after documented health/reconciliation checks, not solely because a timer elapsed.

## Admission, cost and operations

Actual target numbers, a dedicated operator-controlled account/subaccount, owned number inventory, agreed test permissions/retention and a total spending cap are required before live admission. Code can be built and tested without them. Do not load the product's production environment files.

Represent reserved costs as integer currency units with explicit currency and operator-reviewed upper-bound tariffs. Reserve caller voice, provider speech, incoming messaging, possible multiple messages, retries and target-side test costs where applicable. Do not assume a per-run reservation is an absolute provider billing cap: externally generated inbound traffic and delayed billing can exceed predictions. Restrict the pilot, reconcile usage, stop admissions conservatively and disclose residual uncertainty. Number acquisition/rental requires its own explicit allowance.

First-run defaults proposed for approval: one concurrent trial, no automatic redial, at most four caller turns, 120-second call limit and 60-second receipt settlement. The total money cap and approved endpoint are supplied by the owner, not invented by the implementation. Transfer routing is disabled for this pilot fixture; unexpected onward routing must stop the run and be investigated before resumption.

The operator kill switch stops admissions and attempts termination of all owned calls. Durable alarms and a separate periodic reconciliation check recover stuck runs. Incomplete termination or uncertain billing keeps the run visibly incomplete. Raw transcripts/receipts have private access and the admission-pinned deletion policy; public reports contain no phone numbers or provider credentials. Recording is off for this first receipt-focused protocol unless separately configured and authorized; no audio fidelity claim follows from transcripts.

## Public leaderboard path

Start with a versioned, reviewed static results registry consumed by a leaderboard page. This fits the existing Pages site and makes every publication an explicit, reviewable change. The initial registry is empty, with clear instructions for contributions and an explanation of pending live evaluation. Never display fake scores as system results.

A result record identifies system/version (or opaque), suite and evaluator digests, profile, transport, language, caller policy, observation mode, date, operator/reviewer relationship, scheduled/valid/verdict counts, evidence coverage, per-scenario intervals, critical violations, completion, costs/uncertainty and redacted replay-artifact references. Private evidence may have a public digest and an access policy; publication never exposes phone mappings, transcripts or hidden cases by default.

Review distinguishes self-reported, benchmark-operated and independently audited evidence. Receptionaly results are labelled internal research and disclose the operator's conflict. No certification badge is inferred from a successful test. Entries require participant publication permission and a reproducible, reviewed artifact; the existence of an uploaded JSON file is insufficient.

The first smoke result appears as a result card, unranked. Numerical ranking waits for a reviewed frozen cohort, predeclared sample counts, compatible versions/conditions, minimum evidence coverage, completion gates and the M4 uncertainty/reporting work. Do not sort incomparable profiles into one table or fabricate an aggregate interval from scenario Wilson intervals. Preserve superseded reports and explain versioned rescoring.

## Implementation sequence and verification gates

1. Add strict live-pilot admission/state contracts and a provider interface. Offline tests cover quota reservation, exclusive leases, unknown call-creation outcome, crash recovery and cleanup. Default tests make no provider requests.
2. Add Twilio signature/identity validation and durable SMS/call ingestion. Test forged signatures, canonical URL attacks, cross-account/tenant callbacks, replay conflicts, different-ID duplicates, out-of-order callbacks, wrong sender/number and late receipt quarantine.
3. Add the finite-state TwiML caller, explicit action URLs, XML escaping, turn/deadline bounds, protected dispatch and watchdog reconciliation. Test silence, unexpected dialogue, ambiguous dispatch and SDK compatibility in the Worker runtime.
4. Add live-pilot evidence export and replay, with distinct transport/profile/version labels and an explicitly limited oracle. Demonstrate no pass for wrong URL/recipient, duplicates, late or missing evidence, unhealthy closure and incomplete cleanup.
5. Add the static registry/schema/page with empty-state rendering and review documentation. Test that simulation, incomplete or mismatched cohorts cannot become ranked entries. No result is invented to populate the UI.
6. After operator target/limits/provider setup, deploy the backend, perform an unscored readiness check and one admitted smoke attempt. Inspect evidence, cleanup and charges before scheduling repetitions. Publication of actual results is a separate reviewed step.

## Documentation sources checked

- [Twilio Gather](https://www.twilio.com/docs/voice/twiml/gather): speech input, explicit action URLs, empty-input behavior and speech-provider configuration.
- [Twilio secure webhooks](https://www.twilio.com/docs/usage/webhooks/webhooks-security): signature verification and evolving parameters.
- [Twilio Media Streams](https://www.twilio.com/docs/voice/media-streams): later real-time media transport.
- [Cloudflare Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) and [alarms](https://developers.cloudflare.com/durable-objects/api/alarms/): persistent serialized coordination and retryable timers.
