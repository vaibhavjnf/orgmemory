/**
 * Windows Seal watcher.
 * Preferred T2: USN change journal (admin). Common case: no admin → T1
 * ReadDirectoryChangesW on enrolled prefixes + offline SQLite queue.
 * Queue bytes: DPAPI (CryptProtectData) for the current user, not a custom key.
 * Do not hydrate OneDrive placeholders to hash them.
 */
import { resolveIntegrityTier } from "@orgmemory/seal-protocol";
import { OfflineSealQueue } from "../shared/queue.js";

const allowlist = process.env.ORGMEMORY_SEAL_ALLOWLIST?.split(",") ?? ["C:\\Users\\Priya\\Work\\Acme"];

const caps = {
  os: "windows" as const,
  admin: process.env.ORGMEMORY_SEAL_ADMIN === "1",
  usnJournal: process.env.ORGMEMORY_SEAL_USN === "1",
  fanotify: false,
  esf: false,
  volumeEncryption: process.env.ORGMEMORY_SEAL_BITLOCKER === "1",
  signedBinaryAttest: false,
};

const { tier, reason } = resolveIntegrityTier(caps);
const queue = new OfflineSealQueue("%LOCALAPPDATA%\\OrgMemory\\seal\\queue.sqlite");

export function windowsSealSketch(): {
  tier: string;
  watcher: string;
  allowlist: string[];
  reason: string;
  offline: string;
} {
  void queue;
  return {
    tier,
    watcher: caps.usnJournal && caps.admin ? "USN" : "ReadDirectoryChangesW",
    allowlist,
    reason,
    offline: "sqlite + DPAPI (CryptProtectData)",
  };
}

if (process.argv[1]?.includes("watch")) {
  console.log(JSON.stringify({ product: "OrgMemory Seal", os: "windows", ...windowsSealSketch() }, null, 2));
  console.log("Scaffold only — unelevated ReadDirectoryChangesW; USN is opportunistic; never subscribe to the profile root.");
}
