# Use cases

Concrete walks on the Acme Legal seed (`pnpm dev`) or the static story at https://orgmemory-demo.vercel.app.

## Midnight lease draft

An associate needs executed rent figures at 00:30. The partner is asleep; Drive is still canonical.

1. Open **Suggest** (or `pnpm demo`).
2. Query `lease rent schedule` with HQ-amendment context.
3. Midnight ranking should put **Exhibit B Rent Schedule** first — reuse and authority beat a similar scratch note.
4. **Fetch** with a purpose. Bytes come back with an OKFP receipt. Nobody was pinged.

## Owner concurrent board

An owner wants to see what is happening without opening Slack, Salesforce, and Drive separately.

1. Open **Owner** (default landing).
2. Read department × team × stage: HQ rent (active, frozen), Matter 4419 (blocked), Q3 spend (intake), Conti retainer (active).
3. Select a cluster. Related artifacts and recent bus events (Slack, Seal, Fetch, Runtime) are the briefing.

## OKFP audit

Someone asks *who pulled which file, for what purpose*.

1. Fetch Exhibit B as Night Agent.
2. Open **Seal**. The ledger row has actor, purpose, decision, receipt id.
3. `POST /v1/receipts/verify` (or the Suggest “verified” badge) checks the ed25519 signature.
4. Fetch without a purpose is `400`. Denied fetches still appear on the ledger.

## Seal laptop

A work laptop should contribute file events without becoming a keylogger.

1. Open **Atlas** → Seal endpoints: Windows T1, Mac T1, Linux T2 on the seed.
2. Agents enroll declared folders only (`docs/SEAL_ENDPOINTS.md`).
3. Integrity drops a tier when USN / ESF / fanotify / admin is missing. Allowlists never auto-widen.
4. Native watchers in `apps/seal-agent` are **scaffolds**. Ingest + schema are live.

## Mirror rollback

A bad stage edit should rewind the harness, not employee disks.

1. Owner fabric strip → **Mirrors** (e.g. “After HQ rent freeze”).
2. **Rollback**. Cluster titles/stages restore from the snapshot.
3. An OKFP rollback receipt is issued.
4. Laptops, personal browsers, and canonical Drive files are not rewritten.

## Hosted Hermes loop

The dashboard is a projection of a hosted tool loop, not a chat wrapper.

1. Owner fabric strip → **Run hosted loop**, or `pnpm worker`.
2. On HQ rent (active): `suggest → fetch → prompt_trace → remember`.
3. A `WorkEvent` with `source=runtime` lands on the cluster.
4. Blocked Matter 4419 uses Composio (mock) instead of fetch. Authority stays on the API, not the laptop.
