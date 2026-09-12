export type SealOs = "linux" | "windows" | "darwin";

export type SealEventKind = "created" | "modified" | "renamed" | "deleted" | "heartbeat";

/** T0 heartbeat only → T3 journal + volume encryption + signed binary attest. */
export type IntegrityTier = "T0" | "T1" | "T2" | "T3";

export type CloudPlaceholder = "onedrive" | "icloud" | "google_drive_fs";

export interface SealCapabilities {
  os: SealOs;
  admin: boolean;
  /** Windows USN change journal. Requires admin on most SKUs. */
  usnJournal: boolean;
  /** Linux fanotify (privileged). */
  fanotify: boolean;
  /** macOS Endpoint Security Framework. Requires TCC + often a system extension. */
  esf: boolean;
  /** BitLocker / FileVault / LUKS reported unlocked+enabled for the enrolled volume. */
  volumeEncryption: boolean;
  /** Authenticode / notarized+stapled / Linux IMA or packaged sig. */
  signedBinaryAttest: boolean;
}

export interface SealDevice {
  id: string;
  orgId: string;
  hostname: string;
  os: SealOs;
  osUser: string;
  ownerUserId: string;
  integrityTier: IntegrityTier;
  claimedTier: IntegrityTier;
  degradeReason: string | null;
  allowlist: string[];
  capabilities: SealCapabilities;
  lastHeartbeatAt: string | null;
  enrolledAt: string;
}

export interface SealEvent {
  id: string;
  deviceId: string;
  kind: SealEventKind;
  /** Enrolled path. Empty string allowed only for heartbeat. */
  path: string;
  destPath: string | null;
  contentHash: string | null;
  mtime: string;
  osUser: string;
  integrityTier: IntegrityTier;
  placeholder: CloudPlaceholder | null;
  allowlisted: boolean;
  occurredAt: string;
}

export interface SealIngestRejection {
  index: number;
  code: "allowlist" | "schema" | "placeholder_hash" | "device";
  reason: string;
}

export const INTEGRITY_TIERS: IntegrityTier[] = ["T0", "T1", "T2", "T3"];

export const SEAL_EVENT_KINDS: SealEventKind[] = [
  "created",
  "modified",
  "renamed",
  "deleted",
  "heartbeat",
];
