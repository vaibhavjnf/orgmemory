# Concurrent fabric

OrgMemory is an adaptive, prime-style **organizational agent harness**. It holds the org’s data/work graph, drives the web UI, and gives the enterprise **authoritative concurrent reach across nodes** — not a chatbot skin, and not “cloud storage only.”

This document is the architecture law for the concurrent fabric slice.

## Causal work graph

Nodes (`WorkNode`: device, agent, workspace, browser) publish `WorkEvent`s onto the harness bus. Clusters are concurrent units of work. The Owner Concurrent Dashboard projects:

**department × work × stage × node**

```
enrolled connector / node
        → WorkEvent
        → harness store
        → Owner Concurrent Dashboard
```

Agents call the same suggest/fetch/OKFP plane. Those calls write `WorkEvent`s and receipts back onto clusters.

## Timeline mirrors

A mirror is a snapshot of a harness slice (clusters, artifacts, recent events).

| Method | Path |
| --- | --- |
| Create | `POST /v1/mirrors` `{ label }` |
| List | `GET /v1/mirrors` |
| Emergency rollback | `POST /v1/mirrors/:id/rollback` |

Rollback restores cluster stages/titles from the slice and issues an **OKFP rollback receipt**. It does not rewrite employee laptops, personal browsers, or canonical Drive files.

## Hard commits

`POST /v1/commits` `{ clusterId, label, subgraph }` signs a freeze of a subgraph (matter / cluster / policy / org). Soft stage edits (`POST /v1/clusters/:id/stage`) return **409** while the cluster is frozen. A new hard commit (or a mirror rollback with `allowFrozen`) is required to clobber.

## Managed session vault (local, enrolled)

Enterprise-managed tools only, on **enrolled Seal devices**, against an **origin allowlist**.

- `POST /v1/vaults` — enroll vault + origins
- `POST /v1/vaults/:id/sessions` — put **redacted metadata** (`cookiePresent`, `redactedHint`)
- `GET /v1/vaults` — list metadata

Raw cookies, tokens, passwords, and `authorization` fields are **rejected**. Seed data uses placeholders such as `••••a3f2`. Nothing secret is committed to git.

### Ethics (non-negotiable)

| Allowed | Forbidden |
| --- | --- |
| Org-enrolled device | Silent personal-profile scrape |
| Allowlisted enterprise origins (Slack workspace, Salesforce org, Ramp, Drive) | Consumer Gmail / Facebook / personal Chrome profiles |
| Redacted session *metadata* | Ingesting or storing raw cookies |
| Employee-visible ledger | Covert HR keylogging |

## Browser / device automation plane (stub)

`BrowserOperatorJob` + in-process queue stub. Jobs only accept managed origins. Each step emits a `WorkEvent`. Native browser drivers are **not** shipped in this pass — status is `stub`.

`POST /v1/browser/jobs` `{ origin, intent, nodeId, vaultId?, clusterId? }`

## Composio-per-tenant (interface + mock)

Each tenant gets a `TenantToolIdentity` bound to an **enterprise email** we issue (example: `acme-legal@tools.orgmemory.example`). Connector enablement records turn tools on. Harness agents call `POST /v1/tools/invoke` which runs a **mock** (`mock: true`). Live Composio OAuth is future work.

## Prompt / insight bus

`PromptTrace` stores prompt, tools, outcome, actor, cluster, insight tag. Atlas and the Owner insight panel show **aggregated** seed metrics (`GET /v1/insights`). Traces are official harness events, employee-visible — not a hidden scoring channel.

## Connectors in v0

Files: Google Drive (mock), OneDrive/Dropbox stubs, Linux FS unenrolled.  
Activity: Slack, Salesforce, Ramp stubs.  
Integrity: Seal Win/Mac/Linux.  
Identity: Composio tenant mock.

## Implemented vs stubbed

| Surface | Status |
| --- | --- |
| Harness types + event bus + Owner dashboard | Implemented, seeded |
| Timeline mirrors + signed rollback | Implemented |
| Hard commits + freeze | Implemented |
| Session vault metadata API | Implemented (no raw secrets) |
| Hosted Hermes runtime | Implemented (deterministic loop; no LLM). Dashboard is a projection. |
| Browser operator jobs | Stub — queue + WorkEvents |
| Composio invoke | Stub — interface + mock |
| Native cookie brokers / headless browsers | Not shipped (ethics + scope) |
| Live Composio OAuth / cloned OpenClaw | Not shipped |

See also `docs/HARNESS.md` and `docs/HERMES_RUNTIME.md`.
