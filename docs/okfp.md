# Official Knowledge Fetch Protocol (OKFP)

**Status:** v0 implemented in this repo (`okfp-1`)  
**Layer:** OrgMemory Seal  
**Why it exists:** A ChatGPT plugin that “searches Drive” is not an org event. OKFP makes every knowledge fetch a **signed, purpose-bound, ACL-aware receipt** that legal, security, and the employee can all read.

## Guarantee

No bytes leave the overlay index unless:

1. The actor is authenticated
2. Policy allows (project membership, matter wall, after-hours flag)
3. A **purpose** string is supplied (optional **matterId** / **ticketId**)
4. An `AuditEvent` is persisted
5. An **ed25519 receipt** is issued over canonical JSON

Denied attempts still write `fetch_denied` audit rows. They do **not** issue a receipt.

## Receipt schema (`okfp-1`)

Unsigned body (canonicalized, then signed):

```json
{
  "v": "okfp-1",
  "id": "rcpt_…",
  "orgId": "org_acme",
  "actorId": "user_agent",
  "agentId": "user_agent",
  "fileId": "file_gdrive_hq_exhibit_b",
  "suggestionId": "sug_…",
  "purpose": "Draft HQ rent amendment at 00:30 without pinging a partner",
  "matterId": "matter_hq",
  "ticketId": null,
  "aclSnapshot": { "ownerId": "user_priya", "sharedWith": ["user_jordan", "user_agent"] },
  "contentHash": "sha256:…",
  "issuedAt": "2026-09-11T00:30:00.000Z"
}
```

Detached fields on the issued receipt:

| Field | Meaning |
| --- | --- |
| `alg` | `ed25519` |
| `publicKeyId` | Key id (demo: `okfp_acme_legal`) |
| `signature` | base64url(ed25519(canonical JSON of the body)) |

Canonical JSON: object keys sorted recursively, no insignificant whitespace. See `canonicalize` in `@orgmemory/core`.

## Lineage

`suggestionId` binds a fetch to a Midnight Suggest hit. Agents should pass it through. Fetch without lineage is allowed but marked in the audit metadata as a direct fetch.

## HTTP

```
POST /v1/fetch
{ "fileId", "purpose", "matterId?", "ticketId?", "suggestionId?", "includeContent?" }

GET  /v1/receipts/:id
POST /v1/receipts/verify
{ "id"? , "receipt"? }
```

`POST /v1/receipts/verify` re-checks the signature against the org’s OKFP public key and writes a `receipt_verify` audit row.

## Agent SDK

```ts
import { OrgMemoryClient } from "@orgmemory/sdk";

const om = new OrgMemoryClient({
  baseUrl: "https://orgmemory.example",
  apiKey: process.env.ORGMEMORY_API_KEY!,
  actorId: "user_agent",
});

const { suggestions } = await om.suggest({ query: "lease rent schedule" });
const hit = suggestions[0]!;
const { receipt } = await om.fetch({
  fileId: hit.fileId,
  suggestionId: hit.id,
  purpose: "Draft HQ rent amendment at 00:30",
});
await om.verifyReceipt(receipt);
```

The colleague who owns the file is not notified. Their machine does not need to be online. The fetch is still an official org event they can see on the Seal ledger.

## What OKFP is not

- Not a DRM scheme for Drive
- Not a substitute for IdP audit logs
- Not covert monitoring — employees see events that name them
- Not issued for suggest-only (suggest is audited, but receipts are **fetch** seals)

## Production notes

Demo keys live in SQLite (`org_keys`). Production must use a KMS/HSM, rotate `publicKeyId`, and encrypt the index at rest. Retention hooks: every receipt and audit row has `issuedAt` / `createdAt`.
