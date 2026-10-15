# M2 local reference integration: verified scope

The private reference adapter and the public process boundary are implemented. A disposable PostgreSQL integration exercised a selected historical directory/routing schema slice from the reference system, a native Python directory reader through an injected local RPC transport, and the native SQL routing transaction. No production model, provider, call or messaging worker was started.

| Surface | Verified evidence | Boundary |
| --- | --- | --- |
| Fixture lifecycle | Scoped synthetic account/directory, exact mapped fixture round trip, idempotent prepare | Local fixture readiness, not an answered endpoint |
| Directory/routing | Native reader and routing RPC, expected recipient, one durable lead and two events | Selected historical schema slice with minimal auth/account support |
| Booking link | Native directory link and assignment snapshot match expected URL | Link configuration only; no delivery or appointment claim |
| Isolation | Wrong owner/context denied; another namespace retained during cleanup | Disposable local database, no production RLS/caller claim |
| Teardown | Independent reads confirm zero owned fixture rows; container and volumes removed | No real call legs existed |
| Public SDK boundary | Actual CLI process conformance succeeds against the private adapter | Lifecycle-only report; no task score |

The adapter declares `routing.team` and `booking.link` for this local integration scope. `business.info` is unsupported: the business name is mapped natively, but hours/timezone are metadata rather than the product's native fact retrieval path. Policies and logical endpoint references are metadata only. Storing those values does not establish that the system enforces them. Snapshots label these limits and remain vendor diagnostics.

Nine private tests cover fixture lifecycle, separate-process idempotency, scope/ownership, malformed/oracle-bearing requests, digest mismatch and failure cleanup. The source integration independently reconciles the durable routing outcome and an idempotent replay. Public conformance uses a fresh namespace and validates the exact neutral process contract. Full current migrations, complete application startup/onboarding, semantic speech behavior, message delivery, callback execution, booking mutations, transfer media and return remain unverified.

Source-specific mapping code, original file pointers, selected migration details, local credentials and integration reports remain in the separate private adapter package. The public core imports no reference-system code. Original checkout revision and existing changes were preserved. Original model/provider test launchers were not executed.

This is an integration baseline under internal research, not a comparable receptionist-quality score or independent certification. Full M2 readiness requires the current application/onboarding mapping and reconciled evidence for each declared scored profile. M3 adds caller/transport and controlled receiving endpoints before scoring real voice tasks. Public participation can begin with adapter authoring and synthetic evaluator contributions while these pieces are developed.
