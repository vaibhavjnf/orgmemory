# OrgMemory Seal — endpoints (Win / Mac / Linux)

OrgMemory Seal is **not Linux-only**. Every enrolled workstation — Windows, macOS, Linux — reports filesystem integrity events into the overlay. Fetch receipts (OKFP) remain the knowledge-access seal; this document is the **endpoint integrity** seal.

Never auto-widen allowlists. Never die because a privileged API is missing. **Degrade-don’t-die.**

Related: OKFP receipts in `docs/okfp.md`. Linux overlay ingest (content) remains `docs/future/linux-fs-agent.md`; Seal events are the integrity bus those agents also speak.

## Integrity tiers

| Tier | Meaning | Typical APIs |
| --- | --- | --- |
| **T0** | Heartbeat only. Device is enrolled and alive. No path events. | HTTPS POST `/v1/seal/events` kind=`heartbeat` |
| **T1** | User-space directory watch on **enrolled prefixes only** | Linux `inotify` · Windows `ReadDirectoryChangesW` · macOS `FSEvents` |
| **T2** | Journal / kernel / ESF — still bound to the same allowlist | Linux `fanotify` · Windows **USN** change journal · macOS **Endpoint Security (ESF)** |
| **T3** | T2 **plus** volume encryption signal **plus** signed binary attest | BitLocker / FileVault / LUKS reported · Authenticode / notarized+stapled / packaged sig |

`resolveIntegrityTier` in `@orgmemory/seal-protocol` picks the highest honest tier. If USN/admin/ESF/fanotify is missing, Seal **drops a tier and keeps running**.

## Event schema

Shared types live in `@orgmemory/seal-protocol`. Wire JSON (snake or camel):

```json
{
  "id": "sevt_…",
  "kind": "created | modified | renamed | deleted | heartbeat",
  "path": "/srv/matters/4419/abstract.md",
  "dest_path": null,
  "content_hash": "sha256:…",
  "mtime": "2026-09-11T00:31:00.000Z",
  "os_user": "jordan",
  "integrity_tier": "T1",
  "placeholder": null
}
```

| Field | Notes |
| --- | --- |
| `path` | Required except heartbeat |
| `content_hash` | Omitted for deletes, heartbeats, and **cloud placeholders** |
| `integrity_tier` | What this device **actually** achieved for this event |
| `placeholder` | `onedrive` \| `icloud` \| `google_drive_fs` \| null |

## HTTP

### Enroll (stub)

```
POST /v1/seal/devices
Authorization: Bearer <org or user key>
{
  "id": "dev_priya_surface",
  "hostname": "PRIYA-SURFACE",
  "os": "windows",
  "osUser": "acme\\priya",
  "ownerUserId": "user_priya",
  "allowlist": ["C:\\Users\\Priya\\Work\\Acme"],
  "capabilities": {
    "os": "windows",
    "admin": false,
    "usnJournal": false,
    "fanotify": false,
    "esf": false,
    "volumeEncryption": true,
    "signedBinaryAttest": false
  }
}
```

Response includes `integrityTier` after degrade (here **T1**) and `degradeReason`.

```
GET /v1/seal/devices
```

Atlas also embeds the device list.

### Batch ingest

```
POST /v1/seal/events
{ "deviceId": "dev_priya_surface", "events": [ /* SealEvent */ ] }
```

- Off-allowlist paths are **rejected**, not added. Code `allowlist`.
- Placeholder paths are accepted with `content_hash` stripped.
- Denied/rejected events are still summarized on an audit row (`seal_ingest`).

## Linux

| Wanted | Fallback when rights missing |
| --- | --- |
| T2 `fanotify` (CAP_SYS_ADMIN / dedicated group) | T1 `inotify` on enrolled prefixes |
| T3 + LUKS/dm-crypt status + package sig | T2 or T1; heartbeat if inotify fd exhausted |

Workaround: if `fanotify` returns `EPERM`, log once, set tier T1, do **not** retry escalate. Do **not** walk `/home`.

Sketch: `apps/seal-agent/linux/inotify.ts`.

## Windows

| Wanted | Fallback when admin/USN missing |
| --- | --- |
| T2 USN Journal (`FSCTL_READ_USN_JOURNAL`) | T1 `ReadDirectoryChangesW` on enrolled prefixes |
| Offline | Local SQLite queue, ciphertext via **DPAPI** (`CryptProtectData` for the current user) |
| T3 | BitLocker protection status + Authenticode on `orgmemory-seal.exe` |

Workaround: non-admin associates are the common case. Seal must run **unelevated**. USN is opportunistic. Queue files stay under `%LOCALAPPDATA%\OrgMemory\seal\queue.sqlite`.

Never subscribe to the whole profile. OneDrive Files On-Demand: treat reparse/placeholder as `placeholder=onedrive`, do not hydrate to hash.

Sketch: `apps/seal-agent/windows/watch.ts`.

## macOS (darwin)

| Wanted | Fallback when ESF/TCC missing |
| --- | --- |
| T2 Endpoint Security Framework | T1 `FSEvents` on enrolled prefixes |
| Offline | Keychain-backed queue (or file sealed with Keychain AES key) |
| T3 | FileVault on + **notarized and stapled** agent binary |

Workaround: ESF requires a system extension and Full Disk Access. Most professional-services laptops will stay on **FSEvents (T1)** until IT ships an MDM profile. The agent still heartbeats.

iCloud: `*.icloud` and `Mobile Documents` placeholders → `placeholder=icloud`, do not open to download.

Notarization: distribution builds must be signed, notarized, stapled. Dev scaffolds skip this and therefore cannot claim T3.

Sketch: `apps/seal-agent/darwin/fsevents.ts`.

## Cloud placeholders (all OS)

OneDrive, iCloud Drive, and Google Drive File Stream present **zero-byte or reparse** stubs. Hashing them forges a content hash. Seal:

1. Detects placeholder
2. Emits `modified`/`created` **without** `content_hash`
3. Does not call into the cloud provider to hydrate (that would look like user activity and can wake sync)

Canonical bytes still live in Drive/OneDrive/Dropbox. Seal is integrity of the **local enrolled tree**, not a second source of truth.

## Rules that do not bend

- Allowlist is org-enrolled. Seeing a new folder is not consent.
- No keylogging, no screenshots, no clipboard.
- Employee-visible: Seal ingest shows up on the audit feed.
- Degrade-don’t-die: T3 → T2 → T1 → T0, never crash-loop for missing admin.
