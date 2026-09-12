# Linux filesystem agent (P1 — content overlay)

Endpoint **integrity** for Linux, Windows, and macOS is specified in `docs/SEAL_ENDPOINTS.md` and implemented as ingest + scaffolds in `apps/seal-agent`. This file is the older **content ingest** contract for enrolled Linux trees. It does not mean Seal is Linux-only.

The overlay index will later include **enrolled Linux workstations**. This document is the interface contract so a daemon can be added without redesigning the API.

## Non-goals (still)

- No keylogging, clipboard capture, or screenshot ingestion
- No silent home-directory walks
- The agent does not replace Drive. It is another **connector kind**: `linux_fs`

## Enrollment

1. An org admin creates a `linux_fs` connector with a policy:
   - allowed path prefixes (e.g. `/srv/matters`, `~/work/acme-legal`)
   - excluded globs (`node_modules`, `.git`, secrets)
   - max file size / allowed mime types
2. The workstation owner **explicitly enrolls** (install + approve the path list).
3. The agent registers as a device: `connectorId`, `deviceId`, `lastSeenAt`.
4. Offline machines do not block suggest. The index is already in OrgMemory.

## Agent → API

```
POST /v1/connectors/:id/ingest
Authorization: Bearer <device-or-org key>
{
  "deviceId": "ws-jordan-thinkpad",
  "files": [
    {
      "externalId": "sha256:…",
      "path": "/srv/matters/4419/lease-abstract.md",
      "name": "lease-abstract.md",
      "mtime": "2026-03-02T04:11:00Z",
      "ownerId": "user_jordan",
      "sharedWith": [],
      "content": "optional; or contentHash + later fetch"
    }
  ]
}
```

The indexer reuses the same chunk + embed pipeline as Drive.

## Suggest at 00:30 when the laptop is shut

That is the point. The associate's workstation does not need to be online. OrgMemory answers from the last successful ingest. Fetch returns **indexed content** (or a signed redirect to Drive if the canonical copy lives there). The Linux copy is a bound replica, ACL-checked.

## Folder layout (future package)

```
apps/linux-agent/
  src/scan.ts      # walk enrolled prefixes
  src/watch.ts     # inotify / FSEvents
  src/acl.ts       # map POSIX uid/gid + optional POSIX ACLs → owner + sharedWith
  src/push.ts      # ingest API client
```

Do not implement this package in the P0 MVP.
