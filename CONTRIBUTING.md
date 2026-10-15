# Contributing to ReceptionBench

ReceptionBench is building a vendor-neutral way to measure AI receptionist business outcomes. The available scored runner is an offline simulation with synthetic salon cases and a fake adapter. M2 reference-adapter work is underway; real voice transport, a reviewed pilot, a second vendor and independent hidden-test custody remain later milestones. Contributions should preserve those distinctions.

Use [GitHub contribution issues](https://github.com/pmannle/receptionbench/issues/new/choose) for adapters and evaluator cases, or email a participation brief to [phil.mannle@gmail.com](mailto:phil.mannle@gmail.com). The repository includes adapter/evaluator issue templates and a pull request template. There is no enrollment service or public leaderboard submission. The local website at `website/` can generate a participation brief without sending information anywhere.

## Start locally

Use Node 18.20.8, npm 10.8.2 and `sqlite3` on PATH, then run:

```sh
npm ci --ignore-scripts
npm run build
npm test
node dist/src/cli.js doctor
node dist/src/cli.js validate scenarios/public
node dist/src/cli.js adapter check --adapter fake
```

Installation may use network access; build, tests and fake-adapter runs require no credentials or network once dependencies are present. Follow README.md for a complete plan/run/replay example, always using a fresh run output directory. Preview the buildless community site using the instructions in `website/README.md`.

## Useful contributions

- **Evaluator counterexamples:** provide the smallest synthetic evidence bundle that incorrectly passes, fails or becomes inconclusive. Include the expected verdict and rule, rather than only the current output.
- **Public scenarios:** propose an English-language receptionist task with synthetic business facts, caller intent, allowed outcomes, forbidden effects, required evidence and deadlines. Booking-link handoff must not imply an appointment was created.
- **Adapters:** implement the neutral lifecycle, declare unsupported capabilities and keep vendor-specific/private schemas outside the core. See [adapter authoring](docs/adapter-authoring.md).
- **Methodology review:** challenge evidence authority, failure treatment, coverage, reproducibility or planned statistical procedures. Distinguish implemented behavior from proposed specification.
- **Documentation and accessibility:** correct inaccurate claims, clarify local workflows or improve keyboard/mobile usability without external tracking.

## Review expectations

Describe the concrete behavior change and its business-outcome consequence. Include reproducible commands, relevant checks, scope limitations and any fixture/evaluator version impact. Add tests for verifier behavior and meaningful regressions. A test failure should demonstrate the problem before a logic fix. No paid API, real phone call or external message belongs in the default test workflow.

Missing required evidence must never produce a pass. Vendor telemetry alone cannot prove delivery, recipient state or media connectivity. Preserve fresh trial scopes, oracle separation, provenance checks, explicit unsupported outcomes and idempotent ownership-checked cleanup. Never hide operational failures or delete failed attempts to improve a result.

## Synthetic data and ownership

Do not contribute customer records, real phone numbers, secrets, proprietary prompts, private source pointers or source copied from another product. Use synthetic people, organizations, messages and owned/controlled targets for any separately authorized integration. An adapter can live in a private package while using the public contract.

Code, documentation and the website use [Apache-2.0](LICENSE). Independently authored synthetic fixture/scenario data use [CC0-1.0](LICENSE-DATA), including their data values in the fixture source and generated copies. Submit only material you have the right to contribute under the applicable terms; explicitly accept CC0 for synthetic data contributions. Third-party material retains its original terms and requires provenance review. Private adapter code, source-specific audits and vendor source history are excluded. See [provenance](docs/provenance.md).

## Fair participation

Receptionaly is the initial reference system and receives the same published business policies and scoring rules as other vendors. No contribution should make its internal tools the definition of correct behavior. Read [vendor participation](docs/vendor-participation.md) for the proposed process and unresolved independent-evaluation requirements.
