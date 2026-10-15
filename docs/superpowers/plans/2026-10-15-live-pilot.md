# First live pilot implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver the approved booking-link SMS pilot and a public results registry without changing the fake-only runner's behavior.

**Architecture:** Pure TypeScript contracts and state transitions are independently testable without network access. A separate Cloudflare Worker uses a single pilot-coordinator Durable Object for atomic admission, provider dispatch tracking, authenticated callbacks, deadlines and number leases; private R2 retains restricted evidence. The static website consumes an explicitly reviewed registry, initially empty.

**Tech Stack:** Existing TypeScript/Zod/node:test core; pinned official Twilio SDK; separate Node 22 Cloudflare Worker tooling, SQLite-backed Durable Object, private R2; existing buildless Pages website.

**Spec:** [Approved design](../../designs/m3-first-live-result.md).

## Global Constraints

- Default tests make no provider requests. `core-offline` remains fake-only and rejects live execution flags.
- Keep credentials, actual numbers, number inventories and transcripts out of both repositories. The owner's target and aggregate USD 10 authorization are held only in ignored private configuration.
- One concurrent trial, no automatic redial, at most four caller turns, 120-second call limit and 60-second receipt settlement.
- Separate caller goals from evaluator-only expected outcomes. Preserve original attempts, unsupported effects, incomplete evidence and incomplete cleanup.
- Number acquisition/rental requires its own explicit allowance; existing unrelated application numbers are not repurposed.
- Recording is off. Provider transcripts establish only their declared observation scope. Full-duplex and transfer-media work remain later M3 work.
- Fake, self-reported, benchmark-operated and independently audited results remain distinct. First live smoke results are unranked internal research.

## Review Focus

- Process restart between provider call acceptance and response persistence must not cause a second dial.
- A signed callback from another account, wrong destination or quarantined lease must not create trial evidence.
- Duplicate content with a different message ID must remain two effects, while an identical callback replay remains one.
- Disconnection or partial receipt collection must prevent a healthy observation-closure claim.
- A complete-looking JSON report must not turn simulation or an unmatched pilot into a ranked system result.

---

### Task 1: Live contracts and atomic pilot state

**Files:** Create `src/pilot/contracts.ts`, `src/pilot/state.ts`, `tests/pilot-state.test.ts`. Keep actual authorization data in the private `.state/` directory.

**Interfaces:** `PilotPlanSchema` and `PilotStateSchema` are strict versioned schemas separate from `PlanSchema`. Export `admitPilot(plan: unknown, state: PilotState, nowMs: number): PilotState`, `markDispatchIntent(state: PilotState, nowMs: number): PilotState`, `bindCall(state: PilotState, callId: string): PilotState`, and `markDispatchUnknown(state: PilotState): PilotState`. Provider identifiers, private endpoint configuration, public report fields and caller/evaluator inputs have distinct types.

- [x] Write tests asserting rejection of altered plan digests, invalid/over-budget integer-cent reservations, expired authorization, already-leased/quarantined numbers, concurrent attempts and implicit retries. Assert that an intent restored after restart cannot be dispatched again.
- [x] Run `npm test`; observe failures because the new contracts/transitions are absent.
- [x] Implement strict schemas and pure transitions with a version field suitable for transactional compare-and-set persistence. Track reservations, billed/uncertain amounts, settlement/quarantine deadlines and terminal cleanup independently.
- [x] Run the complete root suite with the offline guard; all old fake-only tests and new state tests must pass.
- [x] Commit the contracts and tests.

### Task 2: Authenticated receipt ingestion

**Files:** Create `src/pilot/receipts.ts`, `src/pilot/provider.ts`, `tests/pilot-receipts.test.ts`; add a lockfile-pinned official Twilio SDK dependency only after inspecting the selected release's runtime/exports.

**Interfaces:** `PilotProvider` exposes `createCall(request: DialRequest): Promise<{callId: string}>`, `getCall(callId: string): Promise<CallObservation>`, `stopCall(callId: string): Promise<void>`, `listReceipts(scope: ReceiptScope): Promise<ProviderReceipt[]>`, and `reconcileUsage(scope: ReceiptScope): Promise<UsageObservation>`. `verifyWebhook(request: Request, config: WebhookConfig): Promise<VerifiedWebhook>` uses the official SDK against a configured canonical URL, full parameter set and expected account. `ingestReceipt(state: PilotState, receipt: VerifiedWebhook, nowMs: number): PilotState` checks scoped identity and records deduplication/conflicts.

- [x] Write failing tests for invalid signatures, canonical-host substitution, cross-account/trial callbacks, wrong sender/destination, expired leases, identical replay, conflicting replay, different-ID duplicate content and out-of-order terminal call events.
- [x] Observe the expected failures, then implement bounded request parsing, SDK validation and identity/lease correlation. Never log raw credentials or provider error bodies.
- [x] Test the real SDK validator with synthetic signed requests. Keep provider network behavior behind the explicit interface; no default live credential reads.
- [x] Run the full offline suite; commit after it passes.

### Task 3: Bounded caller and Cloudflare service

**Files:** Create `src/pilot/caller.ts`, `tests/pilot-caller.test.ts`, `services/pilot/package.json`, `services/pilot/tsconfig.json`, `services/pilot/wrangler.jsonc`, `services/pilot/src/worker.ts`, `services/pilot/src/coordinator.ts`, and Worker-runtime tests under `services/pilot/test/`. Lock service dependencies separately; do not change the root Node 18 support contract.

**Interfaces:** `nextCallerTurn(state: CallerState, observation: CallerObservation): CallerTransition` generates bounded fixed caller actions without the oracle. `renderTwiml(action: CallerAction, callbackUrl: string): string` XML-escapes inputs and uses absolute explicit action URLs. The service exposes protected `POST /operator/pilots`, `POST /operator/pilots/:id/start`, `GET /operator/pilots/:id`, `POST /operator/stop`, and signed `POST /webhooks/twilio/{voice,speech,status,sms}`. A singleton `PilotCoordinator` serializes admission and lease ownership in durable transactions. IDs in URLs never replace account/lease/call validation.

- [x] Write failing caller tests for silence, missing greeting, consent clarification, unexpected dialogue, XML metacharacters, exhausted turns and expired call deadlines. Assert no caller input contains an expected URL or oracle bundle.
- [x] Write Worker tests for operator authentication, arbitrary-target rejection, intent-before-dispatch, ambiguous create response, restart reconciliation, concurrent admission, stop/watchdog behavior and complete SDK validation in the actual Worker runtime.
- [x] Implement caller/TwiML generation and the separate Worker with secrets supplied through bindings. Set the provider call time limit and persist the dispatch intent before invoking `createCall`. Persist uncertainty on lost responses; block further dialing until reconciled.
- [x] Implement durable alarms and periodic reconciliation, with bounded retries and no blind call-creation retry. Store raw restricted receipts in private R2; persist their hashes/references durably before evidence closure.
- [x] Run the full root suite and separate Worker-runtime suite. Run a deployment dry-run to verify SDK bundling/compatibility without publishing or placing calls; commit when all pass.

### Task 4: Live outcome export and deterministic replay

**Files:** Create `src/pilot/evaluate.ts`, `src/pilot/replay.ts`, `tests/pilot-evaluate.test.ts`, and `docs/live-pilot.md`. Extend the service's protected status/export path without allowing raw evidence access from the public website.

**Interfaces:** `evaluatePilot(plan: PilotPlan, state: PilotState): PilotResult` produces a strict `booking-link-pstn-smoke` report with counts, receipt references, closure/cleanup health, bounded caller limitations, cost uncertainty and an unranked research label. `replayPilot(bundle: unknown): PilotResult` validates scope and digests and rescores normalized recorded evidence. Public export is an explicit allowlist projection; internal numbers/transcripts/provider responses are never spread into it.

- [x] Write failing tests for correct receipt, wrong URL/recipient, two distinct-ID messages, late receipt, missing reconciliation, caller limitation, incomplete cleanup, changed bundles and private-data redaction.
- [x] Implement receipt-based evaluation. Require complete healthy observation and exact expected booking URL; no spoken promise, acceptance event or timer alone can pass. Unobservable forbidden effects are unsupported, not silently absent.
- [x] Verify deterministic replay matches the original result and rejects forged closure/scope/digest values. Record operator custody limitations rather than treating hashes as signatures.
- [x] Run root and service suites; commit the replayable pilot result implementation.

### Task 5: Empty public results registry and leaderboard page

**Files:** Create `website/results.json`, `website/results.mjs`, `website/leaderboard.html`, `src/results-registry.ts`, `tests/results-registry.test.ts`, and `docs/results-publication.md`; update `website/index.html`, `website/styles.css` and `tests/website.test.ts` for navigation and accessible empty-state content.

**Interfaces:** `ResultsRegistrySchema` validates review/publication metadata, compatible cohort identifiers and redacted artifact references. `validateResultsRegistry(input: unknown): ResultsRegistry` rejects simulation as system performance and rejects unsupported ranking claims. Browser rendering uses text nodes for submitted display values. The initial maintained registry has zero entries.

- [x] Write failing tests for an empty registry, missing publication permission/review provenance, simulations marked ranked, incomplete/mismatched cohorts, unsafe artifact URLs, injected HTML and private number/token fields.
- [x] Implement the registry validator and accessible leaderboard page. Show methodology, participation links and clear empty-state copy; do not invent placeholder scores or participant endorsements.
- [x] Test the public registry with the same maintained schema used in CI; check navigation without JavaScript and responsive rendering. No public form can create an entry.
- [x] Run root/service tests and site checks, then commit. Deploy the static site only after verification; do not publish actual participant results without their separate publication scope being agreed.

### Task 6: Authorized readiness and first live attempt

**Files:** Private ignored `.state/authorized-pilot.json`, private secret bindings and run evidence; public `docs/live-pilot.md` remains source-neutral.

**Interfaces:** Consume the approved private authorization and the tested protected service API. Use an explicitly selected dedicated provider account/subaccount and exclusively assigned voice/SMS number. Retain the authorization, manifest, original attempt, evidence, usage reconciliation and teardown privately.

- [ ] Verify provider access read-only; identify the dedicated account and number inventory. Resolve any number purchase allowance, expected SMS sending identity, target fixture readiness, service retention and deployment bindings before admission. Never repurpose an unrelated application's active number.
- [ ] Deploy the verified backend; inject scoped secrets without printing them. Confirm an unauthorized request cannot trigger calls and the kill switch works through a non-dialing dry-run.
- [ ] Reserve all planned readiness/scored calls and provider speech/message/target costs under the owner's aggregate USD 10 cap. If upper bounds cannot fit or charges are uncertain, do not dial.
- [ ] Execute the declared unscored readiness check, inspect configuration/receipt evidence, then admit one scored attempt if the remaining reserved budget and setup permit. Preserve the original attempt; no automatic redial.
- [ ] Independently reconcile receipt collection, all owned call termination, quarantined lease and usage. Report the actual result and limitations; no success claim without its recorded evidence. Do not publish the result automatically.

## Execution and review

Recommended execution: native implementation in this session, task by task, preserving the two-repository layout. The components share contracts, so sequential implementation avoids concurrent interface churn. The work stays on a feature branch; the normal checkout is retained unless the owner requests an additional worktree. The owner approved direct execution in the existing checkout. Tasks 1–5 are implemented; live operation awaits provider/account setup.
