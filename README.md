# OrgMemory

Personal open build: an **organizational agent harness**. Official memory for agentic teams.

I work on this in public as a hobby. The dashboard is a projection of harness state — not a chatbot skin over Drive.

Demo (static walk of the Owner path): https://orgmemory-demo.vercel.app  
Waitlist (optional): https://orgmemory-waitlist.vercel.app

## Run locally

```bash
pnpm install
pnpm dev
```

| Surface | URL |
| --- | --- |
| Dashboard | http://127.0.0.1:43122 |
| API | http://127.0.0.1:43121 |
| Health | http://127.0.0.1:43121/v1/health |

Needs Node 20+. SQLite at `data/orgmemory.sqlite` is created and seeded with **Acme Legal** on first boot. No extra env required.

```bash
pnpm test
pnpm seed          # reset the demo org
pnpm demo          # suggest → fetch → verify (API must be up)
pnpm worker        # one hosted Hermes tick
pnpm demo:story    # local copy of the static demo on :43124
```

Demo keys (not secrets): `om_demo_acme_legal` (Night Agent), `om_demo_jordan`, `om_demo_priya`, `om_demo_sam`.

Scenarios: [USE_CASES.md](./USE_CASES.md). Deeper design: [docs/HARNESS.md](./docs/HARNESS.md), [docs/HERMES_RUNTIME.md](./docs/HERMES_RUNTIME.md), [docs/okfp.md](./docs/okfp.md).

## Live vs stub

| Surface | Status |
| --- | --- |
| Owner Concurrent Dashboard + WorkEvent bus | **Live** (seeded) |
| Suggest + Midnight ranking | **Live** |
| OKFP fetch + verify | **Live** |
| Seal ledger + Win/Mac/Linux ingest (T0–T3) | **Live protocol**; native watchers are **scaffolds** |
| Atlas skill graph | **Live** seed graph |
| Hosted Hermes loop | **Live**, deterministic (no LLM) |
| Mirrors + signed rollback + hard commits | **Live** |
| Session vault metadata | **Live** (redacted; no raw cookies) |
| Composio tenant identity | **Stub** (interface + mock) |
| Slack / Salesforce / Ramp / browser jobs | **Stubs** on the same bus |
| OpenClaw / Ego / picoclaw / cookie brokers | **Not shipped** |
| Public hosted API | **Not shipped** — live harness is local `pnpm dev` |

## What it is

OrgMemory **holds** the org’s work graph (`Actor`, `Artifact`, `WorkEvent`, `WorkCluster`, `Receipt`), **adapts** per tenant, and **drives** the UI. Slack, Salesforce, Ramp, Drive, OneDrive, Dropbox, and Seal normalize onto one bus. Agents call the same suggest/fetch/OKFP plane.

```ts
import { OrgMemoryClient } from "@orgmemory/sdk";

const om = new OrgMemoryClient({
  baseUrl: "http://127.0.0.1:43121",
  apiKey: "om_demo_acme_legal",
  actorId: "user_agent",
});

const { suggestions } = await om.suggest({
  query: "lease rent schedule",
  context: "HQ rent amendment, need executed Exhibit B",
  projectId: "proj_re",
});

const hit = suggestions[0]!;
const { receipt } = await om.fetch({
  fileId: hit.fileId,
  suggestionId: hit.id,
  purpose: "Draft HQ rent amendment at 00:30 without pinging a human",
  matterId: "matter_hq",
});

await om.verifyReceipt(receipt);
```

## Trust

Overlay only (Drive stays canonical). Employee-visible audits. No keylogging. ACL inheritance. Purpose binding — no purpose, no bytes.

## Repo map

```
apps/api           Fastify + SQLite harness (authority)
apps/dashboard     Vite UI — projection of the loop
apps/worker        Hosted Hermes ticker
apps/demo-story    Static public demo
apps/seal-agent    Win/Mac/Linux scaffolds
packages/core      Types, Midnight ranker, OKFP
packages/harness-runtime  Tenant loop
packages/sdk       Agent client
```

## License

[MIT](./LICENSE) © 2026 Vaibhav Sharma
