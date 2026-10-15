# M2 integration and website implementation plan

Goal: implement the approved M2 private boundary and a local community website.
Spec: specifications.md and docs/designs/m2-and-community-site.md.
Execution: independent adapter and website tasks; coordinator owns public protocol and final integration. No original Git history or proprietary material enters the public package.

- [x] Private adapter: inspect relevant original interfaces read-only; write protocol/conformance tests; implement lifecycle, fixture mapping, independent state reads, ownership-safe cleanup and explicit supported scope in sibling package.
- [x] Local database integration: use an owned disposable sandbox, no paid providers, no env-file loading; retain sanitized receipts and stop all owned resources.
- [x] Public protocol: strict neutral JSON process adapter, bounded process runtime/output, explicit local integration opt-in, no oracle in requests, conformance CLI and tests.
- [x] Website: static responsive experience, evidence explorer, real quickstart and participation brief; contribution and adapter authoring documentation. No publishing or outbound outreach.
- [x] Verify: full core tests, protocol adversarial tests, private adapter checks, website build and local browser QA if available; preserve original source state and document exact limitations.

Review focus: process response validation, fixture digest honesty, source/privacy boundaries, collector authority, vendor failures versus benchmark infrastructure, arbitrary subprocess opt-in, lifecycle cleanup, scope/claim clarity and empty community URLs.

## Result and limits

Public protocol and community site implemented. 44 public tests, nine private tests, actual disposable database source routing/directory integration, and public CLI process conformance verified. Browser QA completed at desktop and mobile widths. Full current application/native fact/onboarding mapping, live transport/outcome scoring and publication remain dependent work; see docs/m2-local-integration.md and docs/verification-m2-and-website.md. No M2 full-stack completion or voice score is claimed.
