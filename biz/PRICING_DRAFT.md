# Pricing draft (not an offer)

ICP: professional services, **20–200 seats**. Sell protocol + overlay, not “another chat.”

## Cloud (SaaS)

| SKU | Includes | Draft |
| --- | --- | --- |
| **OrgMemory Suggest** | Overlay index, Midnight ranking, agent API, employee-visible audits | Seat-based, annual. Floor around mid-market legal/consulting tooling — not per-query LLM markup as the whole product. |
| **OrgMemory Seal** | OKFP receipts, verify, Seal ledger in the dashboard | Add-on or included above a seat threshold. This is the GC-facing SKU. |
| **OrgMemory Atlas** | Provenance graph, reused-doc consolidation | Add-on. Sold to managing partners / knowledge officers, not HR. |

Metering later: official fetches (receipts issued), not raw tokens. Embeddings are an infra cost, not the price.

## License (OEM / on-prem)

| SKU | Includes | Draft |
| --- | --- | --- |
| **OrgMemory License** | Signed JWT unlocking `suggest` / `receipts` / `atlas` on customer iron | Annual license + support. Cloud mode is *not* this SKU. |
| **OEM** | Same flags, embeddable in a document platform | Higher floor, feature flags in the JWT, no Drive replacement claims. |

The license **server is a stub**; the JWT check is real. Do not quote OEM until KMS, IdP, and connector OAuth exist.

## What we do not charge for (on purpose)

- Employee viewing their own audit trail
- Denies (policy denials are logged; they are not billable events)
- Linux agent enrollment when it ships (P1) — charge seats, not endpoints

## Competitive frame

Do not discount against ChatGPT Enterprise + Drive. That comparison trains buyers to hear “RAG.” Frame against **eDiscovery-lite + knowledge ops + agent audit**: purpose-bound official memory.
