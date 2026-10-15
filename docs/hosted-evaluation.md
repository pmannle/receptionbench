# Hosted testing without a tester-owned Twilio account

Status: proposed M3 hosted service. The public website and offline runner do not place calls or send messages. No live Twilio resources have been provisioned by this implementation.

ReceptionBench will operate the test infrastructure. A participating team supplies an authorized receptionist endpoint and configures the published synthetic business/directory; it does not supply Twilio account credentials. Teams may use any compatible provider for their own agent. The hosted benchmark originates calls and owns the receiving endpoints used to observe outcomes.

## Public code and private operation

| Public repository | Private operational storage |
| --- | --- |
| Scenario/event/adapter schemas and offline runner | Twilio credentials and other provider secrets |
| Generic Twilio transport, webhook validation and counterpart implementation | Owned number inventory and current trial-to-number leases |
| Planner, quotas, admission, cleanup and report code | Team access tokens, authorization records and usage ledger |
| Synthetic development cases and synthetic example evidence | Raw audio/transcripts, restricted evidence and recording consent records |
| Hosted API/client contracts and deployment templates | Active hidden cases, seeds and evaluator custody logs |
| Public report format and deidentified approved reports | Proprietary reference-system adapter and source-specific audit |

The generic hosting and telecom code does not need to be secret. Deployments inject secrets from private bindings; browsers and submitted run plans never receive provider credentials. Raw evidence is not a Git artifact or public bucket. The existing proprietary adapter remains separately permissioned. Hidden-bank access remains separated from product development before any independent certification claim.

## Proposed service boundary

Cloudflare hosts the website and an authenticated control API. The API admits a fixed profile, approved target, trial limits and reserved budget, then dispatches a job to an audio-capable caller worker. Durable state coordinates exclusive leases and cleanup. Object storage holds restricted evidence with authenticated, expiring download access. Provider audio processing runs in a suitable worker/container behind a neutral transport rather than being embedded in the website.

A minimal sequential trial uses two owned, voice-and-SMS-capable numbers:

- Number A originates the caller leg and receives caller-ID texts or callbacks.
- Number B acts as the configured employee/recipient endpoint and receives transfers or explicitly requested texts.

A number pool supports concurrent teams and scenarios requiring distinct recipients. Lease assignment is private, exclusive and bound to the trial/tenant. After the call, keep numbers quarantined through the declared late-arrival window; never assign an ambiguous late message to the next team. Per-trial tokens and known sending identities supplement provider IDs and observation windows. Timestamps alone do not correlate concurrent trials.

The team receives temporary setup instructions and only the destinations needed to configure that trial. A readiness check verifies the mapping before scoring. The caller receives goals; the target receives business policy; only the evaluator receives oracle assertions.

## Receipt evidence

Validate the provider signature against the canonical webhook URL and payload using the supported SDK. Bind identity at ingress, deduplicate provider event IDs, reject replay/cross-tenant records, and correlate receipts using the active lease and expected sending identity. Incoming SMS establishes receipt at the controlled endpoint, not that a human read it. Provider acceptance is insufficient to establish recipient delivery.

Accepted transfer evidence additionally requires the intended counterpart's acceptance and bidirectional media checks between the correct distinct legs. A dial or conference event cannot pass that assertion. Clean up all owned legs, verify no live leg remains, and record uncertainty or incomplete teardown.

## Operating model

Start invitation-based with finite per-team credits, approved destinations, concurrency limits and a hard run budget. Reserve worst-case call/transfer legs, messaging and caller/model usage before scheduling. The benchmark operator pays number rental and usage; public source availability does not make telecom free. Metering or sponsored credits may later fund access, but this document enables no billing or purchasing workflow.

The offline fake workflow stays available without an account, network, credentials or paid providers. Twilio test credentials exercise API request handling but cannot demonstrate real calls, SMS receipt or transfer audio; hosted outcome verification uses real authorized resources and a budget.

Before live admission, establish target ownership/authorization, applicable recording/telecom requirements, sender configuration where outbound application messaging is used, retention/deletion policy, allowed destinations, number leases, budget limits and a kill switch. Receiving vendor-originated SMS and sending benchmark-originated application SMS are different paths and must be configured accordingly.

References: [Twilio subaccounts and billing](https://www.twilio.com/docs/iam/api/subaccounts), [secure webhooks](https://www.twilio.com/docs/usage/webhooks/webhooks-security), [test credential limitations](https://www.twilio.com/docs/iam/test-credentials), [US A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc).
