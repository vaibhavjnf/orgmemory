# Moats

Enterprises will try to mimic OrgMemory with “our ChatGPT, plus a Drive RAG.” That stack is a **search demo**. OrgMemory is an **organizational agent harness** and an **official memory protocol**. These features are first-class in the codebase, not slideware.

Weave was an internal codename.

## 0. Harness, not a chatbot skin

The product identity is the work graph: `WorkEvent`, `WorkCluster`, `Stage`, `Actor`, `Artifact`, `Receipt`. Slack, Salesforce, Ramp, Drive, OneDrive, Dropbox, and Seal all normalize onto one bus. The Owner Concurrent Dashboard is a **projection of that store**. Tenant agent loops run as a hosted Hermes archetype on OrgMemory infra (`docs/HERMES_RUNTIME.md`) — not a clone of OpenClaw. A mimic that wraps an LLM around Drive still has no concurrent owner view and no activity bus.

See `docs/HARNESS.md`.

## 1. OKFP — Official Knowledge Fetch Protocol (OrgMemory Seal)

Drive RAG returns text. OrgMemory returns **bytes + a signed receipt**: actor, agent, file, purpose, matter/ticket, ACL snapshot, content hash, suggestion lineage, ed25519 signature.

A partner, a regulator, or the employee can `POST /v1/receipts/verify`. You cannot bolt this onto an LLM chat log after the fact.

See `docs/okfp.md`, `@orgmemory/core` (`signReceiptBody`), `POST /v1/fetch`.

Seal is also **endpoint integrity on Windows, macOS, and Linux** — not a Linux daemon story. T0–T3, degrade-don’t-die when USN/ESF/fanotify/admin is missing, never auto-widen allowlists, OneDrive/iCloud placeholders are not hashed. Schema: `@orgmemory/seal-protocol`. HTTP: `POST /v1/seal/events`. Design: `docs/SEAL_ENDPOINTS.md`.

## 2. OrgMemory Suggest (Midnight ranking, not cosine)

ChatGPT+Drive ranks by embedding similarity. That promotes scratch notes that happen to share tokens with the query.

OrgMemory scores:

```
score = w_sim·sim + w_recency·recency + w_reuse·reuse
      + w_authority·author_role + w_project·project_affinity + w_acl·reachable
```

Weights are config (`ORGMEMORY_RANK_WEIGHTS`). Unit tests prove **reuse + recency can beat raw similarity**. Institutional documents win at 00:30, not the intern’s untitled doc.

## 3. Agent SDK as the commercial surface

GTM is **agent-protocol-first**. Humans use the dashboard; agents import `@orgmemory/sdk`. The midnight path does not require Slack, presence, or an enrolled laptop being awake.

## 4. Policy that still leaves a trail

Project membership, after-hours flag, matter wall. **Denied fetches are audit-logged.** RAG tools fail closed *or* fail open; they almost never fail *on the ledger*.

## 5. OrgMemory Atlas

Skill nodes + producer→reuse edges. This is how knowledge consolidates without an HR dark pattern. Atlas is a **licensed layer**, not a free sidebar on a chatbot.

## 6. OrgMemory License / OEM hook

On-prem and OEM builds validate a signed license JWT for `suggest`, `receipts`, `atlas`. Cloud mode bypasses a missing token (all flags on) but the **hook exists**. You cannot casually fork the dashboard and call it an internal tool without hitting this seam.

## 7. Overlay + employee-visible audits

OrgMemory does not replace Drive. It does not keylog. Every official event is visible to the people it names. That is a trust constraint **and** a moat: surveillance tools will not pass professional-services counsel.

## What a mimic still lacks after they copy the UI

| They copy | They still don’t have |
| --- | --- |
| Chat UI | Harness objects + Owner Concurrent Dashboard |
| Drive RAG | Slack / Salesforce / Ramp on the same WorkEvent bus |
| Suggest box | Midnight weights + why-scores |
| “Citations” | OKFP receipts + verify |
| ACL guess | Inherited owner + sharedWith + matter wall |
| Chat history | Employee-visible org ledger |
| Embeddings | Purpose binding (no purpose, no bytes) |
| Internal GPT | License flags + OEM path |

## ICP this is aimed at

Professional services, **20–200 seats**, where an associate drafting at odd hours must not wake a partner, and every reuse must be explainable to GC.

## Live vs stubbed

See the table in [README.md](./README.md#moats--live-vs-stubbed). Public shareable walk: [docs/DEMO.md](./docs/DEMO.md).
