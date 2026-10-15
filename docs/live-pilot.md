# Operator-only live booking-link pilot

This is a separate `booking-link-pstn-smoke` protocol. The default runner remains an offline simulation. A live result measures one requested booking-link SMS at a controlled recipient; it does not establish full receptionist quality, appointment creation, transfer media or independent certification.

## Build and verify

Use the root's pinned Node 18 runtime for `npm ci` and `npm test`. Use Node 22 in `services/pilot` for its independent `npm ci`, `npm run typecheck` and `npm test`. The service test command builds the actual Wrangler artifact and exercises it in workerd with synthetic provider responses; external provider requests are intercepted. A dry-run build does not dial or deploy.

Deploy the service separately from the Pages website. Its bindings are a singleton SQLite Durable Object coordinator and a private R2 evidence bucket. Supply `CANONICAL_ORIGIN`, `TARGET_CONFIG_JSON`, `TWILIO_AUTH_TOKEN`, `OPERATOR_TOKEN`, `BUDGET_CENTS` and `SETUP_CENTS` as private secret bindings. Never put real numbers or tokens in Wrangler configuration, public issues or committed plans. Operator tokens must contain at least 32 characters and be generated randomly. Disable request/body logging and keep evidence storage private.

`TARGET_CONFIG_JSON` contains the exact account SID, caller number, target number and expected SMS sender. Its canonical digest is part of each plan. A signed callback must also match the configured account, number lease and call identity. The fixed SMS webhook route has no operator credential in its URL. Only an admitted active lease can accept it.

## API and lifecycle

All `/operator/` routes require `Authorization: Bearer <operator token>` over HTTPS. The public website has no run admission endpoint.

| Route | Purpose |
| --- | --- |
| `POST /operator/pilots` | Admit a strict digest-bound plan against the configured target, total budget and exclusive number lease |
| `POST /operator/pilots/:id/start` | Persist dispatch intent, then create one bounded call; uncertainty blocks redial |
| `GET /operator/pilots/:id` | Restricted state inspection; contains private endpoint/receipt data |
| `POST /operator/pilots/:id/reconcile` | Reconcile owned call termination, receiving inbox and provider usage |
| `GET /operator/pilots/:id/export` | Private normalized evidence bundle for deterministic replay |
| `GET /operator/pilots/:id/result` | Allowlist-projected result with no phone numbers, SMS bodies or oracle URL |
| `POST /operator/stop` | Stop admissions and attempt owned-call termination |

Provider webhook routes are `/webhooks/twilio/voice`, `/speech`, `/status` , `/sms` and `/reject`. Pin the dedicated number’s inbound voice URL to `/webhooks/twilio/reject`; signed inbound calls to that number are rejected without trial evidence. The official pinned Twilio SDK verifies the configured canonical URL and complete form fields before state mutation. Raw accepted callbacks and reconciliation snapshots are retained privately. Configure a seven-day deletion lifecycle for this pilot’s raw R2 evidence. Each admitted plan also pins seven-day retention for private Durable Object state; alarms and periodic reconciliation purge full receipts, endpoint mappings and snapshots, retaining only budget, cleanup and integrity tombstones. Provider-side retention is separate and must be disclosed to participants.

The fixed caller listens for a greeting, asks for a selected employee's booking link and explicitly consents to a text to caller ID. It can answer one consent clarification and then terminates on an acknowledgment. Unknown dialogue, silence or expired limits remains a caller limitation rather than an invented successful conversation. The unscored readiness variant only listens for a greeting and hangs up; it makes no business request and should generate no SMS.

Plans permit one concurrent call, four turns, no automatic redial, a 120-second overall call deadline and 60 seconds of settlement. The number stays quarantined for another 300 seconds. The final result requires reconciliation after quarantine, so a complete attempt takes approximately eight minutes from admission. Keep the number assigned exclusively throughout this window. A provider call time limit and the coordinator watchdog independently bound the call. Ambiguous creation is reconciled by provider identity and the owned endpoints before any further action.

## Evidence and budget limits

An incoming SMS webhook at the controlled number is receipt evidence. Spoken promises, successful API requests and outgoing delivery-status claims are insufficient. The signed receipt must match the provider inbox reconciliation; missing callbacks, replay conflicts, wrong scope, missing pages or failed reconciliation cannot yield healthy closure. Different provider message IDs remain distinct messages even if their bodies match. Exact booking URL, recipient, multiplicity and receipt deadline are checked independently of vendor telemetry.

The first protocol deliberately reserves the full conservative cost allowance for every attempt permanently. Observed provider usage is reported separately and may lag billing; target model charges are unmeasured. A completed attempt can retain a final budget hold without claiming the reserve equals its actual cost. This prevents later runs from spending credits provisionally released by incomplete billing. Number rental and readiness calls consume the same aggregate authorization. Ten consecutive reconciliation failures bound automatic observation recovery. Explicit stop always has an independent termination attempt; automatic termination has its own ten-attempt limit and the provider enforces the call time limit. Exhausted or ambiguous state needs operator intervention and is never silently retried or passed. Successful polling does not consume emergency cleanup attempts. Known cumulative provider usage across account/day scopes is also an admission floor: observed spending above the authorization stops admissions even if reservations were lower.

Replay a private exported bundle with `replayPilot` from `src/pilot/replay.ts`. Replay checks scope, plan/bundle digests and closure consistency, then recalculates the redacted result. It verifies recorded evidence consistency under operator custody; it cannot authenticate an externally forged replacement history. Keep raw provider evidence and access records available for the agreed review period.

Results are unranked internal research. Publication requires review and the participant's agreed publication scope. The complete M3/M4 milestones and independent-operation requirements in `specifications.md` remain pending after a smoke test.
