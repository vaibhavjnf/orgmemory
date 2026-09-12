# Operate

Local OrgMemory v0. Production notes are marked as such. Weave was an internal codename.

## Local

```bash
pnpm install
pnpm dev
```

- API: http://127.0.0.1:43121
- Dashboard: http://127.0.0.1:43122
- SQLite: `data/orgmemory.sqlite` (gitignored; seeded on first boot)
- Optional license issuer: `pnpm --filter @orgmemory/license-server dev` → :43123

Health: `curl http://127.0.0.1:43121/v1/health`

Reseed: `pnpm seed`

Tests: `pnpm test`

Midnight agent (API must be up):

```bash
pnpm --filter @orgmemory/api exec tsx scripts/midnight-agent.ts
```

## Env

See `.env.example`. Defaults are enough for the demo. Never commit `.env`.

| Var | Default | Notes |
| --- | --- | --- |
| `ORGMEMORY_API_PORT` | `43121` | |
| `ORGMEMORY_SQLITE_PATH` | `data/orgmemory.sqlite` | Overlay index + ledger |
| `ORGMEMORY_EMBEDDING_PROVIDER` | `local-hash` | Offline. `openai` / `voyage` are hooks that throw. |
| `ORGMEMORY_RANK_WEIGHTS` | `sim:0.34,recency:0.14,reuse:0.18,authority:0.12,project:0.12,acl:0.10` | OrgMemory Suggest |
| `ORGMEMORY_LICENSE_MODE` | `cloud` | `cloud` bypasses a missing token |
| `ORGMEMORY_LICENSE_TOKEN` | unset | Required for `onprem` / `oem` |
| `ORGMEMORY_LICENSE_SECRET` | demo secret | **Replace in any real deploy** |
| `ORGMEMORY_BLOCK_EMPLOYEES_AFTER_HOURS` | `false` | Policy stub; agents still allowed |

Demo API keys (Acme Legal, not secrets):

- `om_demo_acme_legal` — Night Agent (may send `X-OrgMemory-Actor`)
- `om_demo_jordan` / `om_demo_priya` / `om_demo_sam`

## Postgres

`docker compose up -d` starts Postgres 16 on 54329. The v0 API does **not** read it yet. SQLite is the supported path. The compose file exists so later ops work does not invent a database.

## Encryption at rest

SQLite (or future Postgres) must sit on an encrypted volume. OKFP private keys in `org_keys` are demo-only; production uses KMS.

## Backups

Backup `data/orgmemory.sqlite` (index + ledger + receipts). Drive remains the source of truth for file bytes.

## On-prem / OEM

1. Issue a license JWT (`apps/license` or `issueLicense` in `@orgmemory/license`)
2. Set `ORGMEMORY_LICENSE_MODE=onprem` and `ORGMEMORY_LICENSE_TOKEN=...`
3. Feature flags: `suggest` (OrgMemory Suggest), `receipts` (OrgMemory Seal), `atlas` (OrgMemory Atlas)

Cloud SaaS keeps `ORGMEMORY_LICENSE_MODE=cloud`.
