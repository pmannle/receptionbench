# Local process adapter protocol v0.1

The process adapter is a neutral lifecycle boundary for implementations that should remain outside the public core. It supports Python, TypeScript and other executable adapters using stdin/stdout JSON. It does not add a real caller or transport to the scored fake-only runner.

The command is a trusted program explicitly selected by the operator. This is not a sandbox for arbitrary code, and `--allow-local-integration` does not make an executable safe. Select a reviewed adapter configured only for an owned disposable local environment. Default `npm test`, fake conformance and offline scored runs do not require private code or local databases.

## Configure

Keep the adapter config in its private package:

```json
{
  "protocolVersion": "0.1",
  "command": "/absolute/path/to/python3",
  "args": ["/absolute/path/to/adapter.py", "--state-dir", "/absolute/path/to/private-state"],
  "environmentRefs": ["RECEPTIONBENCH_LOCAL_DB_URL"],
  "timeoutMs": 10000,
  "maxOutputBytes": 65536
}
```

Use environment references for scoped local credentials; never put secret values in command arguments or JSON config. Nothing inherits from the parent environment except PATH and a fixed locale, plus the explicitly named references. Runtime injection variables such as NODE_OPTIONS/PYTHONPATH are rejected. The process reference does not give the system under test access to the oracle.

```sh
node dist/src/cli.js adapter check \
  --process-config /absolute/path/to/private/process-config.json \
  --allow-local-integration
```

A conformance result includes `scope: "adapter-lifecycle-only"`, declared capabilities, missing capabilities, snapshot record count and cleanup completion. `ready` means these lifecycle checks passed; it does not mean a voice endpoint answered or that task outcomes were verified.

## Wire format

Each operation starts a new subprocess. Durable state, ownership tokens and idempotency must live in the adapter's explicitly configured private state or sandbox, rather than process memory. One request JSON object is written to stdin and input closes. Return one JSON object on stdout; logs must not be mixed into stdout.

```json
{"protocolVersion":"0.1","operation":"describe"}
```

Other requests have an exact set of fields:

| Operation | Additional request fields | Result schema |
| --- | --- | --- |
| describe | none | DescriptionSchema |
| prepare | context, fixture | PreparedSchema |
| health | context, targetId | `{ "ready": boolean }` |
| snapshot | context, targetId | SnapshotSchema |
| cleanup | context, targetId | `{ "complete": boolean }` |

Success wraps the result: `{"protocolVersion":"0.1","ok":true,"result":...}`.
Failure wraps a safe error: `{"protocolVersion":"0.1","ok":false,"error":{"code":"scope_mismatch","message":"Target scope mismatch","retryable":false}}`.
The bridge validates this envelope and the operation result. Raw stderr and adapter error details are not printed by the CLI, because they may contain private records or credentials. Maintain detailed diagnostics inside the private adapter with appropriate access control.

Requests are strict runtime schemas: no scenario, oracle, hidden expectation, or undeclared fields. The fixture digest is verified before prepare. A preparation receipt must match the exact supplied fixture; if a returned valid target ID accompanies a malformed receipt, the bridge attempts scoped cleanup before rejecting it. The adapter itself must rollback preparation if it fails before returning a usable target ID.

Process runtime and combined stdout/stderr are bounded. The bridge kills the process group on timeout/output overflow on the verified macOS/Linux platforms; this is not a replacement for resource leases or a live-call watchdog. A killed process may leave partial state that must be reconciled using the adapter's private ownership ledger.

The conformance checker uses a fresh namespace, checks repeated prepare and cleanup, verifies fixture receipt and strict snapshot/health shapes, and requires a wrong-namespace read to fail. Cleanup is attempted after subsequent conformance failures. It does not grant independent authority to vendor snapshots, infer unobserved persistence, score unsupported tasks, or place calls.

Executable Draft-7 schemas for the config and requests are generated into `schemas/process-adapter-config.schema.json` and `schemas/adapter-request.schema.json` by `npm run schemas`. TypeScript exports are available from `src/index.ts` and its compiled module.
