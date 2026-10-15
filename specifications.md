# ReceptionBench technical specification and Codex handoff

Draft 0.1 • 14 October 2026 • Public source-neutral edition, 15 October 2026

ReceptionBench measures whether an AI receptionist completes a caller’s intended business task correctly, consistently, and within the business’s policy. Receptionaly is the first reference adapter. The benchmark core, fixtures, outcome definitions, and scoring must remain usable without Receptionaly or its database schema.

This document specifies the intended system and phased acceptance criteria. The current implementation covers the offline core and local adapter conformance; later milestones remain proposed. Public source and website release have been authorized, but this document does not establish that publication or deployment has completed. It authorizes no live call, external message, paid model run or production validation.

## 1. Objectives and boundaries

The primary unit is a scenario trial: a fresh synthetic business environment, a caller goal, a receptionist configuration, controlled counterparts, an evidence bundle, and a verdict. A scenario can have several legitimate successful outcomes. The evaluator checks business outcomes and forbidden effects, rather than requiring a vendor’s internal tool sequence.

Initial release scope is English-language reception for synthetic service businesses, with salon fixtures as the first domain pack. Publish this scope explicitly. Build a second synthetic service-business pack before claiming cross-industry coverage. Booking-link handoff belongs in the core profile. Actual appointment creation, cancellation, and rescheduling belong in separately declared capability profiles with authoritative booking evidence.

Deliver an open-source local runner, TypeScript SDK, scenario schemas, public fixtures, deterministic evaluator, reports, and adapter conformance suite. Add hosted orchestration and a verified leaderboard only after reproducibility and independent operation are demonstrated. Python callers and telephony helpers may run behind a process protocol; a TypeScript SDK does not require rewriting proven Python audio infrastructure.

Use the multi-scenario, multi-metric approach of [HELM](https://arxiv.org/abs/2211.09110) and the final-state verification and repeated-trial reliability approach of [τ-bench](https://arxiv.org/abs/2406.12045). ReceptionBench’s telephone endpoints, transport measurements, profiles, and governance below are proposed extensions, not claims of endorsement or compatibility with those projects.

## 2. Evidence and source-neutral M0 summary

The initial static audit identified the boundary between vendor-specific implementation and a portable business-outcome benchmark. Source-specific inventories, revisions and audit pointers are retained privately and are excluded from this public specification. No proprietary source, prompts, migrations, customer data or vendor Git history are distributed in the public core.

Evidence levels are **reported** (documentation or a participant says it exists), **source inspected** (implementation or assertions were read), **located** (a symbol was found but behavior was not fully traced), **locally verified** (a recorded local check passed) and **live verified** (an authorized controlled run has independent outcome evidence). Source inspection alone cannot establish delivery, appointment creation or working media.

The public M0/M1 implementation provides independently authored synthetic business fixtures, a neutral adapter contract, fake-adapter execution, deterministic outcome assertions, evidence storage, replay and reports. M2 adds explicit local process-adapter conformance; local persistence and lifecycle checks remain distinct from scored voice-system evaluation. See [the public audit summary](docs/m0-summary.md), [verification notes](docs/verification.md) and [adapter protocol](docs/process-adapter.md) for implementation status.

Receptionaly is the first reference system. Private integration details remain outside this repository. A second vendor, independent hidden-test custody and real caller/media transports are pending; there is no claim of independent certification or a verified vendor leaderboard.

## 3. Mandatory repository audit instructions

Codex must complete these steps before implementing an adapter or extracting code.

1. Establish the supplied repository path, read applicable `AGENTS.md` instructions, record revision, branch and dirty paths, and inventory manifests and test entry points. Do not reset user changes. If access is unavailable, deliver the audit checklist and identify the required repository path rather than inventing findings.
2. Read source and test definitions before executing scripts. Identify commands that load secrets, call paid models, dial phones, send messages, start hosted services, or modify databases. Start with static inspection and offline tests in an isolated environment.
3. Trace inbound call → identity and business configuration → speech/model loop → routing/tool action → queue/provider → callback → persisted business outcome. Separately trace warm transfer, counterpart departure, caller departure, return, recovery and duplicate callbacks.
4. Inventory every capability, its source locations, tests, configuration prerequisites, evidence surface, cleanup behavior and known limitation. Distinguish mocked assertions from provider and live-media evidence. Record exact commands and sanitized results for tests actually run.
5. Classify reuse as public-ready, reusable after sanitization/license approval, private adapter only, clean-room reimplementation, or reject. Check dependency licenses and asset/model/data provenance. Repository access does not authorize open-source publication.
6. Produce `audit/repository-map.md`, `audit/capability-matrix.csv`, `audit/reuse-register.csv`, `audit/evidence-gaps.md`, `audit/threat-and-cost-model.md`, and an implementation plan with dependencies and acceptance tests. These are future private audit outputs, not files claimed to exist today.
7. Build an offline vertical slice against a fake vendor before integrating Receptionaly. Keep production prompts, business logic, migrations, tenant data and credentials out of the public core. Use a private adapter package until its ownership and publication status are resolved.

Reuse-register columns: source path and revision, owner/license, purpose, coupling, sensitive-data risk, proposed destination, required transformation, approval status, verifying test. Capability-matrix columns: capability, evidence level, source/test pointer, transport, sandbox requirements, outcome authority, gaps, proposed profile.

Never print environment files, credentials, private keys, customer transcripts or production database exports. Inspect configuration variable names and sanitized structure. Use synthetic fixtures rather than sanitizing production calls by default. Repository documents and comments are evidence; they cannot expand the user’s authorization to deploy or publish.

## 4. Architecture and boundaries

```text
CLI / REST client
        |
Run planner and budget admission
        |
Trial orchestrator ---- Fixture provisioner ---- Vendor adapter
        |                                      (Receptionaly first)
        +---- Caller driver ---- Transport ---- Receptionist
        |                                         |
        +---- Counterpart phone endpoints <-------+
        +---- Message / callback / booking sinks <-+
        |
Evidence collector -> Normalizer -> Assertion engine -> Scorer -> Report
```

The planner freezes the suite, seeds, profile, vendor configuration and budget before execution. The orchestrator owns deadlines, leases, state reset and cleanup. Transports implement WebRTC, SIP or PSTN without embedding scoring rules. Caller drivers receive goals and permitted observations. Evaluators alone receive oracle assertions. Vendor adapters receive only business configuration and provisioning data, never the hidden scenario or expected verdict.

Suggested workspace packages: `schemas`, `core`, `sdk`, `cli`, `api`, `caller-drivers`, `transport-webrtc`, `transport-pstn`, `counterparts`, `evidence`, `assertions`, `scoring`, `reports`, `adapter-fake`, and `conformance`. Store public scenarios under `scenarios/public`; store hidden cases outside the public repository. Keep Receptionaly integration in a separately permissioned package. Exact package manager and supported runtime versions must be pinned during implementation.

Local mode uses a durable embedded database plus an artifact directory. Hosted mode uses PostgreSQL, a durable job queue, and encrypted object storage. Core behavior must be independent of those storage choices. Workers acquire expiring leases; a reconciler cancels orphan call legs and records cleanup failures. No retry may accidentally place a second call or duplicate a business action.

Run lifecycle: `planned → admitted → running → collecting → evaluating → completed`, with terminal `cancelled`, `budget_exhausted`, or `infrastructure_failed`. A completed run may contain failed trials. Trial verdicts are `pass`, `fail`, `inconclusive`, `infra_error`, and `unsupported`; each has reason codes and evidence references.

## 5. Evaluation modes and tracks

| Dimension             | Definition                                                                                                                                        | Comparison rule                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Black-box             | Controlled caller communicates through an authorized number or endpoint; evaluator observes caller audio and controlled counterpart/sink outcomes | Claims limited to externally observable effects. Unknown internal state is not a pass                         |
| Instrumented          | Adapter additionally exposes normalized events and scoped state snapshots                                                                         | Vendor telemetry is attributed, not automatically trusted; reconcile with independent sinks                   |
| Deterministic control | Fixed synthetic state, prerecorded utterances, explicit finite-state caller, scheduled endpoint behavior                                          | Inputs and evaluator are reproducible; model outputs, audio timing and carrier behavior can remain stochastic |
| Adversarial           | Bounded adaptive callers, conflicting instructions, interruptions, corrections and failure injection                                              | Freeze attack policy/model/version/budget; separate from deterministic-control score                          |
| Exploratory           | New attack search or scenario authoring                                                                                                           | No ranked score; promote reviewed cases into a future frozen suite                                            |

Publish separate leaderboards by suite version, profile, observation mode, transport, language and track. A matched externally verified outcome subset can be compared across modes only when its assertions and environment are identical. More instrumentation must not award extra task points.

Black-box access to an arbitrary public number is insufficient authorization for unattended benchmarking. The run requires an approved target, synthetic business configuration or documented known facts, and controlled destinations. Without those, label results observational and do not rank them as standardized evaluations.

## 6. TypeScript adapter and event contract

The following is the design contract. The current SDK source and exported runtime schemas define the implemented subset; real transports and hosted APIs remain planned. Generate runtime validators and OpenAPI types from shared versioned schemas. Treat every adapter response as untrusted input.

```ts
type Capability =
  | "business.info"
  | "routing.team"
  | "booking.link"
  | "message.deliver"
  | "callback.request"
  | "callback.execute"
  | "transfer.warm"
  | "transfer.return"
  | "booking.mutate";

type TransportEndpoint =
  | { kind: "pstn"; numberRef: string }
  | { kind: "sip"; uriRef: string }
  | { kind: "webrtc"; connectionRef: string };

interface BusinessFixture {
  schemaVersion: string;
  fixtureId: string;
  contentHash: string;
  publicFacts: Record<string, unknown>;
  directory: Array<Record<string, unknown>>;
  policies: Record<string, unknown>;
}

interface TrialContext {
  trialId: string;
  namespace: string;
  deadline: string;
  idempotencyKey: string;
}

interface PreparedTarget {
  targetId: string;
  endpoint: TransportEndpoint;
  fixtureReceiptHash: string;
}

interface Snapshot {
  schemaVersion: string;
  observedAt: string;
  records: Array<Record<string, unknown>>;
  evidenceRefs: string[];
}

interface ReceptionBenchAdapter {
  describe(): Promise<{
    adapterVersion: string;
    systemVersion: string;
    capabilities: Capability[];
    observationMode: "black-box" | "instrumented";
  }>;
  prepare(ctx: TrialContext, fixture: BusinessFixture): Promise<PreparedTarget>;
  health(ctx: TrialContext, targetId: string): Promise<{ ready: boolean }>;
  snapshot(ctx: TrialContext, targetId: string): Promise<Snapshot>;
  cleanup(ctx: TrialContext, targetId: string): Promise<{ complete: boolean }>;
}

interface EvidenceEvent {
  schemaVersion: string;
  eventId: string;
  trialId: string;
  callId?: string;
  legId?: string;
  correlationId: string;
  parentEventId?: string;
  producerId: string;
  sequence: number;
  occurredAt: string;
  receivedAt: string;
  monotonicMs?: number;
  type: string;
  authority: "vendor" | "provider" | "benchmark-sink";
  payload: Record<string, unknown>;
  evidenceRefs: string[];
}
```

`snapshot` in black-box mode returns observed records only and explicitly identifies unavailable fields; it must never infer unobserved persistence. `prepare` may provision through an API or validate a manually configured business. It returns a receipt proving the supported fixture subset matches. Reject mismatched fixtures before a scored run. `cleanup` is idempotent and deletes only resources owned by the trial namespace.

Replace broad example records with discriminated JSON Schema unions before freezing SDK v1. Required event types include call started/answered/ended, speech turn, tool intent/result, message accepted/delivered/failed, callback requested/completed, transfer requested/ringing/accepted/bridged/ended/returned, booking created/changed/cancelled, and cleanup result. Each type defines required IDs, time units, nullable fields and provenance. Vendor-specific fields live under a namespaced extension.

Deduplicate on producer plus event ID. Sequence numbers are producer-local; never infer total ordering across independent systems from timestamps alone. Verify callback signatures and replay windows. Evidence authority is assigned from authenticated ingress identity, not trusted from the submitted `authority` string. Preserve conflicting evidence and resolve it through the evaluator’s documented hierarchy.

## 7. REST API and CLI

REST v1 is asynchronous and tenant scoped. All endpoints require scoped authentication except explicit local-only development mode. Mutating requests support `Idempotency-Key`; repeating a key with different content returns conflict. Secrets are credential references, not JSON payloads.

| Endpoint                            | Contract                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /v1/suites`                    | Available immutable suite manifests and profile requirements                            |
| `POST /v1/targets`                  | Register adapter/configuration references and authorized transport endpoints            |
| `POST /v1/runs`                     | Submit suite digest, target ID, track, repetitions, seed, limits; return 202 and run ID |
| `GET /v1/runs/{id}`                 | State, budget usage, counts, manifest digest and report references                      |
| `POST /v1/runs/{id}/cancel`         | Stop scheduling, terminate owned active legs, collect evidence and clean up             |
| `GET /v1/runs/{id}/trials`          | Cursor-paginated trial summaries and evidence coverage                                  |
| `POST /v1/trials/{id}/events:batch` | Authenticated event ingestion with bounded batch size and deduplication                 |
| `GET /v1/runs/{id}/report`          | JSON report; optional HTML/JUnit artifact links                                         |
| `POST /v1/replays`                  | Rescore an authorized evidence bundle with a specified evaluator digest, without calls  |

Return machine-readable error code, safe message, request ID and retryability. Use 400 for invalid schemas, 403 for authorization, 409 for state/idempotency conflict, 422 for incompatible profile, and 429 with retry delay for rate limits. Authenticate artifact downloads separately; paginate evidence and impose payload limits.

Proposed CLI examples:

```sh
receptionbench doctor --config bench.config.json
receptionbench validate scenarios/public
receptionbench adapter check --adapter fake
receptionbench plan --suite core-v0.1 --target receptionaly-local --repetitions 5
receptionbench run --plan run-plan.json --offline
receptionbench run --plan run-plan.json --allow-live --budget-usd 25
receptionbench report --run RUN_ID --format html
receptionbench replay --bundle evidence.bundle --evaluator evaluator-manifest.json
receptionbench compare --baseline BASE_ID --candidate CANDIDATE_ID
```

The offline flag rejects any external transport or model dependency. Live execution requires an admitted plan with destination allowlist, cost ceiling and credentials. CLI exit codes: 0 completed and gates satisfied; 1 scored regression/failure; 2 configuration error; 3 incomplete or infrastructure failure; 4 cancellation/budget stop. JSON output mode must be stable and redact secrets. CLI and API produce identical run manifests and scoring.

## 8. Scenario taxonomy and fixtures

Core categories are business facts, routing and directory, booking-link handoff, messages and callback requests, warm transfers and return, and policy/privacy. Each category initially receives ten distinct reviewed scenarios: 60 public scenarios total. Rephrasings alone do not count as distinct tasks. Extension packs cover completed bookings, executed callbacks, multilingual interaction, accessibility, concurrency and extended recovery.

Include named and unnamed recipient selection; service/skill constraints; similarly named staff; changed preference; unavailable employee; closed hours and time zones; corrected phone number; declined text consent; wrong booking link; duplicate delivery; urgent versus routine escalation; private-number requests; attempted instruction override; conflicting directory content; silence, noise and interruption; no answer, busy, voicemail, decline, accepted transfer, counterpart disconnect, caller disconnect and repeated return events.

Each scenario declares business fixture, capability profile, caller private facts, public instructions, allowed success alternatives, required/forbidden effects, evidence requirements, deadlines, severity, randomness, cost bounds, and reset strategy. Keep scenario intent separate from a particular vendor’s tool names. Use actual executable schemas, not free-form evaluator prose, for outcome predicates.

Example YAML for the future schema:

```yaml
schemaVersion: "0.1"
id: transfer.no_answer.callback
version: "1.0.0"
category: transfer
profile: core-instrumented
track: deterministic
requires: [transfer.warm, transfer.return, callback.request]
businessFixture: synthetic-salon-v1
clock:
  businessTime: "2026-01-15T10:00:00-08:00"
  zone: America/Los_Angeles
caller:
  driver: finite-state-audio
  scriptRef: transfer-no-answer-v1
  privateFacts:
    name: Jordan Example
    callbackNumberRef: caller-sink
  goal: Speak with Casey; if unavailable, request a callback.
counterparts:
  - id: casey
    endpointRef: staff-sink
    behavior: ring-no-answer
    ringSeconds: 12
limits:
  maxCallSeconds: 120
  settleSeconds: 30
  maxTransfers: 1
  maxCostUsd: 1.50
oracle:
  all:
    - id: intended-recipient
      predicate: transfer.attempt_target
      equals: casey
      authority: benchmark-sink
    - id: caller-resumed
      predicate: transfer.return_media_confirmed
      equals: true
      withinSeconds: 8
      relativeTo: counterpart.ringing_ended
      authority: benchmark-sink
    - id: callback-saved
      predicate: callback.record_matches
      expected:
        recipientId: casey
        callerNumberRef: caller-sink
        count: 1
      authority: verified-state
    - id: request-arrived
      predicate: callback.notification_received
      expected: { recipientId: casey, count: 1 }
      authority: benchmark-sink
  forbidden:
    - predicate: transfer.bridge_established
    - predicate: booking.created
    - predicate: private_contact.disclosed
severity: high
```

All references must resolve through a fixture manifest. Phone references resolve only to owned, approved test endpoints; illustrative phone numbers must never be dialed. The callback record assertion requires instrumented verified state and therefore is not silently used in a black-box profile. Publish an explicitly different black-box assertion set if only notification delivery can be observed.

The schema compiler must reject unknown predicates, arbitrary embedded code, unresolved references, incompatible authority requirements, conflicting deadlines and unsupported capabilities. Oracle bundles must be held apart from vendor provisioning and caller prompts. The finite-state audio script must include bounded branches for early greetings, clarification, transfer offer, return, and callback confirmation. Unexpected dialogue yields a defined verdict rather than an unbounded caller loop.

## 9. Ground truth and evidence

Before a trial, record canonical synthetic state and its hash. After the call, wait the scenario’s fixed settlement window, collect final state and sink receipts, and compute the permitted state delta. Assert both what must happen and what must remain unchanged. Reconcile recipients, content, multiplicity, consent, ordering constraints and deadlines.

| Outcome                 | Sufficient evidence                                                                                              | Insufficient evidence                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Booking link delivered  | Controlled recipient receives the correct allowlisted URL with expected business/service context                 | Agent says it sent a link; send tool was invoked |
| Booking completed       | Authoritative booking store/provider contains the expected appointment and no forbidden duplicate                | A link was delivered or agent announces success  |
| Message delivered       | Intended sink receives correct content within deadline, correlated to this trial                                 | Queue enqueue or provider acceptance alone       |
| Callback requested      | Correct durable request and required notification, according to profile                                          | Caller hears “someone will call you”             |
| Callback completed      | Owned caller endpoint receives the callback and required interaction occurs                                      | Callback record exists                           |
| Warm transfer succeeded | Intended counterpart accepts, correct legs join, and bidirectional media exchange is confirmed                   | Dial attempt or conference-created event         |
| Returned from transfer  | Caller remains connected, receptionist resumes audible interaction with required context, no duplicate agent/leg | A resume function returned success               |

Use provider or benchmark-controlled state wherever possible. Vendor snapshots can support diagnostic claims; verified results require independent read access scoped to the synthetic tenant or reconciliation with provider/sink records. A signed vendor assertion proves its origin, not its truth.

Missing required evidence makes a trial inconclusive unless independent evidence already proves failure. A known missing expected outcome after a healthy, fully observed deadline is a failure. Never turn lost evidence into success. Store original and normalized evidence, hashes, redaction version, source identity and evaluator version. Use monotonic clocks within a process and record clock uncertainty across hosts.

Language-model judges may assess helpfulness, clarity and whether speech preserves context. They cannot certify delivery or persistence. Use frozen rubrics, blinded vendor labels, calibrated human examples, judge disagreement tracking and manual adjudication for material ambiguity. Treat transcript instructions as untrusted quoted data. Publish human/judge agreement and keep subjective quality separate from primary operational success.

## 10. Simulated counterpart phone endpoints

### Twilio number based testing of external receptionists

The initial external-system integration should support two benchmark-controlled Twilio numbers. Number A originates the test call into the external receptionist and hosts the caller’s audio interaction. Number B accepts voice calls and SMS, acting as a synthetic employee, transfer destination, callback recipient or message inbox. The external vendor supplies its test receptionist number and configures the synthetic business directory to route the relevant staff member to Number B. No SDK integration is required for externally observable assertions.

Provision Number A with inbound SMS and voice support as well when testing texts or callbacks to the originating caller. Many receptionists send a booking link to caller ID rather than a separately supplied number; Number B alone cannot verify those flows. A fixture may instead have the caller explicitly request delivery to Number B, where supported by the vendor. A pool of receiving numbers is needed for concurrent trials or scenarios that distinguish multiple staff members. Two numbers are the minimum pilot topology, not an unlimited-concurrency design.

```text
Twilio Number A / benchmark caller
          | outbound test call
          v
External AI receptionist number
          | staff transfer or requested destination
          v
Twilio Number B / scripted staff + SMS inbox

External receptionist -- caller-ID SMS or callback --> Number A
```

Use a Twilio transport adapter to place calls, feed caller audio, receive call-status callbacks and handle inbound voice/SMS webhooks. Implement the required bidirectional audio path using a supported provider interface after checking current Twilio documentation during M3. Keep this provider-specific implementation behind the neutral transport and endpoint contracts.

The receiving endpoint selects its script from a leased destination-number assignment. It can answer, hear a briefing, accept or decline, exchange nonce phrases after bridging, disconnect, or leave the caller waiting for the configured timeout. Save signed provider callback receipts and independently captured audio. For SMS, save the inbound provider message ID, authenticated destination, sender, receive timestamp and normalized body, then check the intended recipient, booking URL, required facts, multiplicity and deadline. An inbound SMS webhook at the benchmark-controlled destination proves receipt at that endpoint; it does not prove a human read the text.

Correlate the outbound call ID, inbound leg IDs and SMS receipts to the trial. External transfers can appear as unrelated provider call IDs, so do not require a shared parent call ID. Use exclusive destination leases, known sending identities where available, bounded observation windows and task-specific tokens when appropriate. A timestamp alone is insufficient in concurrent runs. Quarantine numbers through the late-arrival window before reuse; classify ambiguous late messages as inconclusive rather than assigning them to the next trial.

Provide a manual onboarding manifest for external vendors: test receptionist number, approved caller number, synthetic business facts, directory mapping to receiving endpoints, messaging destinations, consent policy, supported capabilities and configuration version. The operator verifies the mapping with an unscored readiness call. Missing vendor logs do not block transfer-media or text-receipt scoring; assertions about internal callback records remain unavailable in the black-box profile.

M3 must include an external-system demonstration that originates a call from Number A, verifies a transfer to Number B with bidirectional audio, receives a requested text at Number B, and receives a caller-ID text at Number A. Include wrong-number, duplicate-text, no-answer and delayed-delivery failures. Record all leg and messaging charges against the same run budget.

### Endpoint behavior and verification

Build a separately controlled endpoint service representing staff, owners, callers awaiting callbacks and voicemail. Use provider test accounts or owned SIP/PSTN endpoints. Map logical endpoint IDs to approved phone resources at run time, never in public fixtures.

Behaviors: answer immediately; answer after delay; busy; no answer; decline; voicemail; accept after briefing; require DTMF; hang up before bridge; hang up after bridge; remain silent; send a spoken correction; disconnect concurrently with the caller. Every behavior has a versioned state machine, maximum duration and expected receipt events.

For accepted transfers, use short generated nonce phrases in both directions to prove media exchange and isolation. A carrier “answered” event must not prove that the intended human role accepted. For return tests, the caller asks a context-dependent follow-up after staff departure; check audio plus retained task facts. Test that the caller cannot hear private briefing if the fixture requires separation.

Inject duplicate, late and out-of-order provider callbacks in the controlled integration track. Do not forge callbacks against a real vendor’s public production endpoint. Concurrency tests must verify that trial A cannot connect to trial B’s staff or leak its message. Teardown must terminate all owned legs, revoke short-lived tokens, release resource leases and verify no billable call remains.

## 11. Scoring and statistical reliability

Pre-register scenario weights, denominators, exclusion rules, sample sizes and gates in the suite manifest. For each trial, primary success is one only if every required assertion passes and no forbidden effect occurs. Partial completion is diagnostic, never substituted for primary success.

For scenario `i`, let `n_i` be valid scored trials and `s_i` successful trials. Its success rate is `s_i / n_i`. The primary score is 100 times the equal-weight mean of category means; scenarios within each category receive equal weight. Optional profiles have their own fixed denominators. Report per-category results, critical violation counts/rates, delivery accuracy, transfer success, return success, task duration, first-response latency, interruption recovery and total cost separately.

Required capabilities declared unsupported count as failures for that full profile. A vendor may instead publish a narrower named profile before running; it must not omit difficult scenarios after seeing outcomes. Infrastructure errors and inconclusives do not enter the valid-trial success denominator, but always publish their counts, scheduled-trial completion rate, and conservative success bound using all scheduled trials as the denominator. A ranked run requires at least 95% valid completion overall and in every category; below that, report it as incomplete. This threshold is a proposed release rule, not an empirical guarantee.

For repeated-trial reliability, report `pass^k = mean_i[C(s_i,k) / C(n_i,k)]` for `k=1,3,5` when every included scenario has at least `k` valid independent repetitions. Use category weights as above. Interpret this as estimated probability that all `k` attempts succeed, distinct from “at least one of k attempts succeeds.” Reset state and caller session between repetitions. Publish seeds, attempt counts, model/config changes and correlation risks.

Use 95% Wilson intervals for an individual scenario’s Bernoulli success rate. For the aggregate score and `pass^k`, use a fixed-seed, category-stratified cluster bootstrap over scenario IDs, preserving each scenario’s trial group; publish 10,000 bootstrap resamples and the percentile method. For paired version comparisons, resample matched scenario groups and compute the paired score difference. Describe these aggregate intervals as uncertainty across sampled scenarios; they do not capture all real-world deployment uncertainty. Report raw counts and avoid decimal precision unsupported by the sample size.

Freeze sample size before evaluation. Pilot: 60 scenarios × 5 repetitions = 300 trials per track/configuration. Verified release proposal: 60 public plus at least 60 independently authored hidden scenarios × 10 repetitions = at least 1,200 trials per track/configuration. A pilot must assess whether intervals are narrow enough for intended decisions; these counts are budgets, not a claim of sufficient statistical power. Hidden and public scores remain separately visible.

Measure latency at the caller’s audio boundary: end of caller speech to first audible meaningful response, excluding filler according to a versioned rule. Record p50/p95 and sample counts, timeout rate, codec, transport, region and clock method. Do not average away unanswered calls; include them as timeouts and failed tasks where applicable. Report conditional latency among responses alongside timeout rates.

Any observed critical privacy breach or wrong-party confidential delivery prevents a clean safety badge, regardless of average score. Zero observed violations must be reported as zero out of N with an interval, never as proof of safety. Keep vendor operational failures in the score. Rerun only failures attributable to benchmark infrastructure under a predeclared rule, preserve the original attempt, cap retries and disclose replacements.

## 12. Fairness and hidden evaluation governance

Receptionaly receives the same published business policy, preparation time, scenario distribution, repetitions, failure treatment and scoring as other vendors. Do not encode Receptionaly’s current implementation choices as universal correct behavior. A business policy may require consent or a particular recipient, but should allow any correct internal execution path.

Freeze and hash vendor configuration before the evaluation window. Record underlying model/version where available; opaque vendor versions are labeled opaque. Randomize/interleave vendor run order across time blocks to reduce carrier and provider effects. Keep budgets, audio conditions, fixture complexity and caller behavior comparable. Publish model/caller limitations, domain coverage and subgroup counts; avoid broad accent or demographic fairness claims from tiny synthetic samples.

Public development cases are open. Active hidden cases and seeds are access controlled and are not bundled with the OSS runner. An independent evaluator executes hidden trials. Receptionaly product developers must not administer the hidden bank; until independent custody exists, label results internal research and do not claim independent certification.

Maintain reviewer conflict disclosures, two-person scenario approval, access logs, submission rate limits, contamination reports, appeal procedures and evaluator change records. Hidden feedback should identify failure category and provide reviewer access to evidence without automatically revealing the entire active bank. Rotate compromised cases; retire and publish cases when safe. Use independently authored policies and business templates, not only renamed public cases.

Commit to a salted digest of the hidden suite and protocol before runs, then disclose the manifest to authorized auditors; release salts and retired content later. Do not tune thresholds, caller behavior or hidden case selection after seeing vendor scores. Correct evaluator defects through versioned rescoring of all affected vendors, retaining previous reports and explaining changes. Commercial sponsorship must not alter inclusion or scoring rules.

## 13. CI, reproducibility and regression gates

Every pull request runs schema validation, evaluator truth-table tests, adapter conformance, event replay, fake-vendor end-to-end trials, and adversarial tests against the evaluator itself. No paid calls are required for the default contribution workflow. Include golden evidence bundles for pass, fail, missing evidence, duplicate events, false delivery claims, cross-tenant events and transfer races.

Scheduled authorized integration runs use dedicated sandbox tenants and capped budgets. Nightly small suites detect drift; release candidates run the complete frozen matrix. Compare matching suite/evaluator/profile/transport configurations. Do not compare unrelated historical scores as regressions. A suggested gate is no new critical violation and a paired 95% interval whose lower bound exceeds a predeclared non-inferiority margin of minus two percentage points; otherwise mark the release inconclusive or regressed rather than automatically acceptable. Teams may choose stricter margins before running.

Every run manifest records source and image digests, suite/fixture/evaluator/adapter versions, target config digest, caller model and prompt hash, TTS/ASR versions, audio hashes, seeds, locale, business clock, wall-clock window, region, timeouts, provider identity, capability declaration, admitted budget and exclusions. Replay means rescore recorded evidence; it does not mean replaying audio will reproduce a hosted model’s answer.

## 14. Privacy, security and cost controls

Use synthetic names, messages, organizations, booking stores and owned numbers. Keep private source pointers and audit reports private; published reports use portable source references only for approved open-source files. Store secrets through references to a secret store or local environment, with scoped test credentials and redacted logs. Raw audio, transcripts and phone mappings require access control and encryption.

Proposed retention defaults: raw audio/transcripts 7 days, restricted normalized evidence 30 days, deidentified aggregate reports indefinitely. Pin retention at admission; document deletion from object stores, caches and backups and provider-specific retention limitations. Recording and telecom requirements must be resolved for the actual test jurisdiction before live operation; this specification does not establish legal consent.

Enforce allowed targets, countries and message destinations at the transport layer, including transfer destinations and redirect chains. Block emergency, premium-rate and non-test destinations. Reject callback URLs or booking URLs that escape approved hosts; prevent server-side requests to private infrastructure except explicitly configured local services. Authenticate callbacks, isolate tenants and prevent fixture instructions from accessing secrets or the oracle.

Each plan includes maximum calls, call duration, concurrent legs, messages, model tokens, retries, wall time and USD cost. Reserve worst-case per-trial cost before admission, including all transfer legs and caller-model usage. Reconcile provider usage afterward. For delayed billing, use conservative reservations and stop scheduling before remaining funds can be exceeded. Provide a kill switch and watchdog that terminate live legs; report any uncertainty in final billed totals.

## 15. Versioning and publication

Version SDK/API, schema, suite, fixtures, evaluator, caller policy and adapter independently. Immutable reports reference all versions by digest. Breaking interface changes increment major versions; scoring or fixture changes that affect outcomes create a new suite/evaluator release and comparison cohort even if the software patch appears small. Preserve migration tools and supported version ranges.

The project owner selected Apache-2.0 for independently authored benchmark code and documentation, and CC0-1.0 for independently authored synthetic fixture/scenario data. See LICENSE, LICENSE-DATA and docs/provenance.md for exact scope. Dependencies retain their own licenses. Do not copy a proprietary file into the public repository merely because its tests are useful. Audio assets need redistributable provenance; hidden assets remain private until retired and approved.

Publish methodology, schemas, public cases, evaluator, synthetic evidence examples, known limitations and report schema. Distinguish self-reported, benchmark-operated and independently audited results. A leaderboard entry must include scope, configuration, interval, evidence coverage, critical violations, cost, date and reproducibility artifacts. A single scalar score must not obscure those fields.

## 16. Milestones and acceptance criteria

| Milestone                 | Deliverables                                                                           | Acceptance criteria                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 Repository audit       | Map, capability matrix, reuse register, evidence gaps, execution plan                  | Every claimed capability has an evidence level; proprietary boundaries and execution side effects are recorded; no live-verification claim without receipts            |
| M1 Offline core           | Schemas, fake adapter, planner, event store, evaluator, CLI, JSON/HTML reports         | Ten representative scenarios run without network or secrets; replay yields identical verdicts; malformed and forged evidence cannot pass; fake failures are detected   |
| M2 Receptionaly adapter   | Private adapter, fixture mapper, snapshots, conformance tests                          | Isolated synthetic tenant provisions and cleans up; no core import depends on Receptionaly; state and sinks reconcile; unsupported features are explicit               |
| M3 Voice and counterparts | WebRTC/PSTN transports, endpoint state machines, message/callback sinks                | Authorized tests demonstrate accept, decline, timeout, voicemail, caller drop, counterpart drop and return; media checks detect a broken bridge; no orphan legs remain |
| M4 Benchmark pilot        | 60 reviewed public cases, repetition runner, scoring/intervals, cost report            | 300-trial planned pilot per track reports all scheduled outcomes; unit fixtures verify statistical formulas; error taxonomy and judge calibration are reviewed         |
| M5 Independent beta       | Second non-Receptionaly adapter, second domain pack, hidden bank, independent custody  | Same core and fixtures evaluate both systems; hidden access is separated from product developers; independent operator reproduces scoring from evidence                |
| M6 Public release         | Versioned packages, docs, hosted API if required, governance and publication checklist | Licenses/provenance cleared; no secrets/private code in distribution; full release cohort meets completion criteria; reports and appeal/rescore process published      |

M2 depends on M0 and M1. M3 depends on transport and authorization readiness. M4 follows stable outcome verification. M5/M6 are prerequisites for public independent benchmark claims. A useful internal pilot can ship earlier under the appropriate label.

Cross-cutting release tests must demonstrate: repeated setup and cleanup; callback replay resistance; wrong-tenant rejection; crash recovery; deterministic rescoring; no pass with missing required evidence; no false booking from a sent link; no false transfer from a dial event; no hidden oracle in vendor requests; budget exhaustion cleanup; and identical primary outcomes when instrumentation is added to an otherwise identical externally verifiable case.

## 17. Copyable Codex implementation handoff

> Build ReceptionBench according to this specification, beginning with M0. Inspect the explicitly supplied Receptionaly repository and applicable instructions before writing integration code. Record the current revision and preserve existing changes. If the repository is unavailable, report that boundary and proceed with the independent offline design and fake adapter.
>
> Treat source inspection as audit evidence, not proof that tests pass. Produce the private capability matrix, reuse register and evidence-gap report. Identify which functions can be reused with approval, which belong in a private adapter, and which require a clean implementation. Do not expose secrets, production records, proprietary prompts or business logic in the public benchmark.
>
> Implement a vendor-neutral offline vertical slice first: typed schemas, fake adapter, synthetic fixtures, event ingestion, deterministic outcome assertions, scoring, and replayable reports. Then integrate Receptionaly through the same adapter contract. Keep business outcomes independent of its tool names and database schema. Add controlled counterpart endpoints before claiming verified warm transfer or return behavior.
>
> Follow the milestone acceptance criteria and retain evidence for every completion claim. Run offline validation first. Live calls, external messages, hosted migrations, publication and deployment require the applicable explicit authorization and admitted limits. Report exact capabilities verified, unresolved gaps and the next milestone. Do not claim an independent benchmark until independent hidden-test custody and a second vendor adapter have been demonstrated.

## 18. Release decisions and remaining prerequisites

The owner selected [the project repository](https://github.com/pmannle/receptionbench), phil.mannle@gmail.com as the participation contact, Apache-2.0 for code/documentation and CC0-1.0 for synthetic fixture/scenario data. Website hosting is planned on the Cloudflare default URL; no deployed URL is asserted here. Source preparation does not establish a completed push or deployment.

Before dependent live or independent milestones, resolve authorized sandbox targets and spending limits, executed callback scope, the independent hidden-bank operator, and the second vendor/domain. Public source availability does not complete M5/M6 independent evaluation criteria or authorize provider/model runs.
