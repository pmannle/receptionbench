# ReceptionBench

ReceptionBench is a vendor-neutral benchmark for business outcomes in AI receptionist tasks. This checkout implements **M0 static audit, M1 offline simulation, and an opt-in local adapter conformance boundary** from the supplied technical specification. It runs independently with a fake adapter and synthetic salon data. It does not evaluate real voice systems yet.

Project repository: [pmannle/receptionbench](https://github.com/pmannle/receptionbench). See [CONTRIBUTING.md](CONTRIBUTING.md) to propose an adapter or evaluator case.

Requirements: Node **18.20.8**, npm **10.8.2**, and the `sqlite3` executable on PATH. Versions of npm dependencies are locked. No credentials or Receptionaly installation are needed. The initial runtime pin matches the verified development environment; supported production runtimes will be reviewed before release.

```sh
npm ci --ignore-scripts
npm run build
npm test
node dist/src/cli.js doctor
node dist/src/cli.js validate scenarios/public
node dist/src/cli.js adapter check --adapter fake
node dist/src/cli.js plan --out run-plan.json
node dist/src/cli.js run --plan run-plan.json --offline --out runs/demo
node dist/src/cli.js replay --bundle runs/demo/bundle.json
node dist/src/cli.js report --run runs/demo --format html --out runs/demo/view.html
```

Use a fresh output directory for each run. `npm run bench -- <command>` is equivalent to invoking the CLI. With dependencies installed, build, tests, validation, execution and replay require no network. `npm ci --offline --ignore-scripts` also works when the locked packages are cached.

Ten cases cover business hours, named routing, skill routing, booking-link receipt, staff messages, corrected callback details, accepted transfers, return after transfer, declined text consent and private-contact refusal. They are contract examples, not the reviewed sixty-scenario pilot bank.

```sh
node dist/src/cli.js plan --fault broken-bridge --out broken-plan.json
node dist/src/cli.js run --offline --plan broken-plan.json --out runs/broken
```

Failure modes: `acceptance-only`, `wrong-recipient`, `duplicate-text`, `late-delivery`, `broken-bridge`, `no-return`, `privacy`, `missing-evidence`, `cleanup-error`, `crash`, `unsupported`. `--repetitions` and `--seed` freeze the schedule. The fake system is deterministic; repetition statistics here do not establish independent model reliability. Exit codes: 0 satisfied, 1 scored failure/unsupported, 2 configuration/invalid evidence, 3 incomplete/infrastructure. Live execution is unavailable.

The SDK exports schemas and types, adapter conformance checks, planner/runner, evidence store, evaluator, scoring and report helpers from `src/index.ts` (compiled under `dist/src`). `npm run schemas` exports Draft-7 JSON Schemas and synthetic fixture/scenario JSON from the same runtime definitions. The compiler additionally checks references, capabilities, URLs, fixture hashes, deadlines and predicate payload types. Shared schemas intentionally cover more event types than this M1 runner exercises.

Each run saves a frozen plan inside `bundle.json`, source/dependency/configuration digests, independently scoped trial SQLite databases, a checkpoint and JSON/HTML reports. Replay validates scope, provenance bindings, roster and hashes, then recomputes verdicts without adapter calls. Missing evidence is inconclusive; absence after a healthy complete observation window fails. Unsupported required capabilities and vendor crashes are scored failures. Category/scenario weights are equal; partial completion is diagnostic. Reports expose scheduled/valid counts, completion, conservative bounds, individual Wilson intervals, `pass^1/3/5`, critical-event and critical-trial counts.

SQLite is accessed through argument-based subprocess calls with escaped SQL literals; there is no shell execution. Each event transaction is durable and idempotent. Trial scope is bound in database metadata. This initial store is local-only and is not an API accepting caller-supplied SQL or identities.

See [architecture and trust boundaries](docs/architecture.md), [M0 public summary](docs/m0-summary.md), [implementation plan](docs/plans/m0-m1.md), and [verification notes](docs/verification.md). The source-specific M0 audit is intentionally stored outside this repository.

All transfer/audio/message receipts in this version are **simulated**. The fake adapter receives business provisioning and bounded caller requests; the evaluator alone receives oracle assertions. The local harness owns ingress identities and converts fake effects to simulation receipts. This tests the verifier, not an independent delivery or media channel. Hashes check integrity relative to trusted artifacts; they do not certify a malicious operator's self-authored bundle.

REST hosting, real transports and counterpart services, full-stack Receptionaly integration and state readers, process resume, aggregate bootstrap/paired comparison, live latency measurement, hidden evaluation and independent certification remain future work. A checkpoint preserves completed trial evidence after interruption; there is no automatic resume or evidence-based live cleanup reconciler. Live calls, external messages, paid model/provider runs and vendor source-history migration are outside the current workflow. Public repository and community-site release are authorized; this source document does not assert a completed push or deployment.

Code, documentation and the website are licensed under [Apache-2.0](LICENSE); independently authored synthetic fixture/scenario data are dedicated under [CC0-1.0](LICENSE-DATA). See [provenance and scope](docs/provenance.md). `private: true` prevents accidental npm publication. The [public technical specification](specifications.md) is source-neutral; the original source-specific inventory is retained privately outside this repository.


A local community website is available under [website/](website/README.md). Run `npm run site:preview` and open `http://127.0.0.1:4173`. It includes an evidence explorer, methodology, offline quickstart and browser-local participation briefs. Contribute through [GitHub issues](https://github.com/pmannle/receptionbench/issues/new/choose). The community website is live at [receptionbench.pages.dev](https://receptionbench.pages.dev).

The neutral process adapter lets vendor teams test their lifecycle without putting private implementation details in the public core:

```sh
node dist/src/cli.js adapter check \
  --process-config /absolute/path/to/private/process-config.json \
  --allow-local-integration
```

This explicitly executes a selected local program and may provision its configured sandbox. It is not the default offline test workflow and does not run scored calls. See [process protocol](docs/process-adapter.md), [adapter authoring](docs/adapter-authoring.md), [contribution guide](CONTRIBUTING.md), and [vendor participation](docs/vendor-participation.md). The first private local reference integration verifies a declared historical directory/routing slice against disposable PostgreSQL; current full-stack, speech, message-delivery and media checks remain dependent work.
