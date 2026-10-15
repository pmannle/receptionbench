# Authoring an adapter

An adapter translates a vendor system into ReceptionBench's neutral lifecycle. It does not decide whether the business task passed. The evaluator derives that decision from scoped, authoritative evidence. The current scored runner uses a fake adapter; the generic process boundary supports local adapter conformance in M2. Conformance and local service integration do not establish voice-system benchmark performance.

## Begin with the contract

Use the exported `ReceptionBenchAdapter` type and associated schemas in the current checkout (`src/schemas.ts`, re-exported by `src/index.ts`) as the source of truth. Inspect the fake adapter in `src/fake.ts` for a runnable simulation example. Check the current CLI help for conformance options; do not assume a future transport is already available.

The lifecycle provides `describe`, `prepare`, `health`, `snapshot` and `cleanup` operations. Caller requests and real voice execution require a separate transport; they are not part of this process protocol. Match exact SDK method signatures rather than copying this prose into a separate contract. A private implementation can remain in a sibling package and communicate over the supported process protocol without importing proprietary code into the core.

## Implementation checklist

1. Declare capabilities explicitly, including unsupported delivery, executed callbacks, appointment mutation, warm transfer, media verification or return behavior. A request recorded is distinct from its execution.
2. Map only public synthetic business fixtures into an isolated namespace. Bind the fixture receipt to the exact fixture and trial context. Reject mismatches, invalid scopes and malformed inputs.
3. Keep expected outcomes, assertions, hidden seeds and evaluator oracle fields out of provisioning and vendor requests. The adapter receives business facts, not the answer key.
4. Use a fresh caller session and business scope per trial. Do not share state across repetitions or tenants. Record the adapter version and target configuration digest.
5. Obtain recipient-side, booking-state or media evidence from an independently scoped observer where the profile requires it. Classify vendor-reported events as diagnostic. A successful dial does not prove a working bridge; a sent URL does not prove an appointment.
6. Make cleanup idempotent, namespace-restricted and ownership-checked. Preserve the original failure, attempt cleanup after errors/timeouts and verify residual state. Never delete unrelated tenant data.
7. Reject wrong-tenant events, replayed callbacks and out-of-scope destinations. Bound process output and execution time; terminate failed child processes and retain diagnostics without secrets.
8. Publish the capability and evidence gaps with your result. Unsupported tasks and operational failures must not silently disappear from the denominator.

## Verification progression

Start with offline schema and lifecycle tests against synthetic fixtures. Exercise repeated setup/cleanup, deliberate failure, namespace collision, malformed process output, receipt mismatch, missing evidence and unsupported capability paths. Then, if separately authorized, verify the mapper against a disposable local service/database with an independent scoped read. Record what was actually executed, the source/configuration revision and the cleanup result.

A database row round trip is local integration evidence. It cannot establish message delivery, a completed booking, caller audio, a warm transfer or a successful callback without the corresponding outcome observer. A conformance pass is never a score or certification.

Live transports require controlled counterparts, authorized targets and budgets, recording/privacy decisions, cleanup/watchdog support and declared evidence boundaries. They are outside the default contribution loop. Do not load a global environment file, production credentials or paid providers simply to run a local conformance test.

## Contribution package

Include a capability table, lifecycle mapping, synthetic test setup, exact verification commands, required local prerequisites, evidence-authority map, cleanup rules and known gaps. Keep private implementation details and source pointers in the private package. See [vendor participation](vendor-participation.md) for the shared evaluation rules.

## Generic process protocol (0.1)

`ProcessAdapter` in `src/process-adapter.ts` launches one explicitly configured executable per operation with no shell. Each child receives one newline-terminated JSON request on stdin and must exit successfully after emitting exactly one JSON response on stdout. Persist the synthetic scope in your disposable local service across invocations. Do not log on stdout. Output limits include stderr, which is discarded rather than exposed in public diagnostics.

Requests have `protocolVersion: "0.1"` and `operation: "describe"`, `"prepare"`, `"health"`, `"snapshot"` or `"cleanup"`. All but describe include `context`; prepare includes the business `fixture`; the other operations include `targetId`. No caller scenario or oracle is sent. Successful responses are `{ "protocolVersion": "0.1", "ok": true, "result": ... }`; errors are `{ "protocolVersion": "0.1", "ok": false, "error": { "code": "...", "message": "...", "retryable": false } }`. Exact result shapes are enforced by the SDK schemas.

A local configuration file contains an absolute executable path and argument array, not a shell command:

```json
{
  "protocolVersion": "0.1",
  "command": "/absolute/path/to/node",
  "args": ["/absolute/path/to/private-adapter/cli.mjs"],
  "environmentRefs": [],
  "timeoutMs": 10000,
  "maxOutputBytes": 65536
}
```

Use actual absolute paths for your checkout. `environmentRefs` names only explicitly forwarded variables; values stay outside the config. PATH and LANG are available, while runtime-injection environment names are rejected. The process boundary is not a sandbox for untrusted code.

```sh
npm run build
node dist/src/cli.js adapter check \
  --process-config /absolute/path/to/adapter-config.json \
  --allow-local-integration
```

The opt-in acknowledges that a configured local executable runs and may provision your configured disposable service. Conformance validates fixture receipts, idempotent prepare, health, strict snapshots, wrong-namespace rejection and idempotent cleanup. Its report is explicitly `adapter-lifecycle-only`; `run --offline` remains fake-only. `npm run schemas` exports the `adapter-request` and `process-adapter-config` JSON Schemas. The process protocol does not confer a voice score, send messages or supply a caller/media transport.
