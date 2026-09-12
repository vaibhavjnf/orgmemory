# OrgMemory demo

**Public static walk:** https://orgmemory-demo.vercel.app (from `apps/demo-story`).

Waitlist: https://orgmemory-waitlist.vercel.app

The live Owner dashboard + Fastify API are **local** (`pnpm dev`). A public hosted API from this Origin repo is blocked until Vercel is linked (see README).

## Local live path (real harness)

```bash
pnpm install
pnpm dev
```

| Surface | URL |
| --- | --- |
| Owner Concurrent Dashboard | http://127.0.0.1:43122 |
| API | http://127.0.0.1:43121 |
| Health | http://127.0.0.1:43121/v1/health |
| Static demo story (local) | http://127.0.0.1:43124 |

Keys: `om_demo_acme_legal` (Night Agent), `om_demo_jordan`, `om_demo_priya`, `om_demo_sam`.

## Local script

Do this on the Owner dashboard as Night Agent. Seeded org is **Acme Legal**.

1. **Owner board** — department lanes: Real Estate (HQ rent amendment, Matter 4419, Conti Corp) and Finance (Q3 office spend). HQ rent is **active + frozen**.
2. **Suggest** — query `lease rent schedule` (Suggest page or cluster brainstorm). Top hit is **Acme HQ Office Lease — Exhibit B Rent Schedule.pdf**. Midnight ranking, not pure cosine.
3. **OKFP fetch** — Fetch + seal with a real purpose. Receipt verifies. Purpose-less fetch is `400`.
4. **Seal badge** — Seal page shows the verified fetch on the employee-visible ledger. Atlas also shows Win/Mac/Linux devices (T1/T2). Native watchers are scaffolds.
5. **Atlas** — Commercial Leasing → Rent schedules, official reuse count.
6. **Run hosted Hermes loop** — Owner fabric strip → **Run hosted loop**. Expect `suggest → fetch → prompt_trace → remember` on `cl_rent`. Same plane as `pnpm worker`.
7. **Mirror rollback** — Concurrent fabric → a mirror’s **Rollback**. Issues an OKFP rollback receipt. Does not rewrite laptops or Drive.

CLI midnight path (API must be up): `pnpm demo`.

## What this is not

- Not a clone of Mac Ego, picoclaw, or OpenClaw.
- Not a public replacement for the hosted API until Origin↔Vercel exists.
- Not cookie ingest, personal-profile scrape, or covert HR keylogging.
