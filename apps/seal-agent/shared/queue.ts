import { pathOnAllowlist, type SealEventKind } from "@orgmemory/seal-protocol";

export interface QueuedSealEvent {
  kind: SealEventKind;
  path: string;
  destPath?: string;
  contentHash?: string;
  mtime: string;
  osUser: string;
  integrityTier: "T0" | "T1" | "T2" | "T3";
}

/** Offline queue. Windows wraps the file with DPAPI; macOS with a Keychain key. */
export class OfflineSealQueue {
  constructor(private readonly path: string) {
    void this.path;
  }

  enqueue(_event: QueuedSealEvent): void {
    // Scaffold: persist to sqlite (linux), DPAPI-protected sqlite (windows),
    // or Keychain-sealed sqlite (darwin). Flush when POST /v1/seal/events works.
  }
}

export function assertAllowlisted(filePath: string, allowlist: string[]): void {
  if (!pathOnAllowlist(filePath, allowlist)) {
    throw new Error(`Seal refuse: ${filePath} is outside the enrolled allowlist (never auto-widen).`);
  }
}
