# OrgMemory Seal agent (Win / Mac / Linux)

TypeScript **scaffolds**, not shipping native binaries. The protocol is real (`@orgmemory/seal-protocol` + `POST /v1/seal/events`). Per-OS watchers are sketches so a later native pass does not invent policy.

| OS | Path | Default watcher | Privileged upgrade | Offline |
| --- | --- | --- | --- | --- |
| Linux | `linux/inotify.ts` | inotify (T1) | fanotify (T2) | sqlite queue |
| Windows | `windows/watch.ts` | ReadDirectoryChangesW (T1) | USN journal if admin (T2) | sqlite + DPAPI |
| macOS | `darwin/fsevents.ts` | FSEvents (T1) | ESF if TCC granted (T2) | Keychain queue |

T3 = T2 + volume encryption signal + signed/notarized binary. Dev scaffolds cannot honestly claim T3.

## Rules encoded in the sketches

- Allowlist only. Never auto-widen.
- Degrade-don’t-die when fanotify / USN / ESF / admin is missing.
- OneDrive / iCloud placeholders: detect, do not hydrate, strip hashes.
- Heartbeat even at T0.

Run against a live API (after `pnpm dev`):

```bash
pnpm --filter @orgmemory/seal-agent exec tsx linux/inotify.ts
```

See `docs/SEAL_ENDPOINTS.md`.
