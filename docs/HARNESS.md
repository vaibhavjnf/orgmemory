# OrgMemory is a harness

OrgMemory is an **organizational agent harness** — a customized, tenant-adapted prime-agent-style runtime. It is not a chatbot skin over Drive, and it is not “cloud storage.”

## Thesis

1. **Hold** the org’s data/work graph: actors, artifacts, concurrent clusters, events, receipts.
2. **Adapt** per tenant: connectors, allowlists, ranking weights, policy, license flags.
3. **Drive** the web UI: the dashboard is a **projection of harness state**. Owner Concurrent Dashboard, Suggest, Seal, and Atlas all read the same store. Agents call the same plane (`suggest` / `fetch` / OKFP) that writes back into that store.

A midnight `fetch` is not a sidebar citation. It is a harness `WorkEvent` plus a `Receipt` attached to a `WorkCluster`. The owner sees it on the concurrent board without opening chat.

## Objects

| Object | Role |
| --- | --- |
| **Actor** | Person or agent in a department/team |
| **Artifact** | File, Slack message, Salesforce record, Ramp expense, or receipt |
| **WorkEvent** | Normalized activity on the bus |
| **WorkCluster** | Concurrent unit of work (what a team is doing, at a stage) |
| **Stage** | `intake → active → blocked → review → sealed` |
| **Receipt** | OKFP seal projected onto the cluster |

## Bus

```
Slack / Salesforce / Ramp / Drive / OneDrive / Dropbox / Seal
        → ActivityConnector.pull()
        → WorkEvent
        → harness store
        → Owner Concurrent Dashboard
```

OAuth can replace stubs later. The **normalize interface** is the product.

## Agent plane vs UI

The harness **runs** a hosted Hermes-style loop (`docs/HERMES_RUNTIME.md`) on OrgMemory infra. Suggest/fetch/OKFP, mirrors, Composio, and browser jobs are tools of that loop. The UI does not have a separate model. Edge Seal agents are satellites.

## Owner Concurrent Dashboard

Rows: department / team / **node**. Cards: clusters with stage. Select a cluster: related artifacts, recent events, receipts, Suggest, hard commit. Below the board: the hosted Hermes driver (**Run hosted loop**), timeline mirrors (rollback), prompt insight, session vault metadata, browser job stubs, Composio tenant email.

This is how an owner watches **concurrent** work without becoming a surveillance product: events are org-enrolled connectors, employee-visible, purpose-bound when they fetch. See `docs/CONCURRENT_FABRIC.md`.
