/**
 * macOS Seal watcher.
 * Preferred T2: Endpoint Security Framework (TCC + often a system extension).
 * Fallback T1: FSEvents on enrolled prefixes.
 * Offline: Keychain-backed queue. T3 requires FileVault + notarized+stapled binary
 * (this scaffold is unsigned → cannot claim T3).
 * iCloud *.icloud placeholders: do not open (would download).
 */
import { resolveIntegrityTier } from "@orgmemory/seal-protocol";
import { OfflineSealQueue } from "../shared/queue.js";

const allowlist = process.env.ORGMEMORY_SEAL_ALLOWLIST?.split(",") ?? ["/Users/jordan/Work/acme-legal"];

const caps = {
  os: "darwin" as const,
  admin: false,
  usnJournal: false,
  fanotify: false,
  esf: process.env.ORGMEMORY_SEAL_ESF === "1",
  volumeEncryption: process.env.ORGMEMORY_SEAL_FILEVAULT === "1",
  signedBinaryAttest: false,
};

const { tier, reason } = resolveIntegrityTier(caps);
const queue = new OfflineSealQueue("~/Library/Application Support/OrgMemory/seal-queue.sqlite");

export function darwinSealSketch(): {
  tier: string;
  watcher: string;
  allowlist: string[];
  reason: string;
  notarization: string;
} {
  void queue;
  return {
    tier,
    watcher: caps.esf ? "ESF" : "FSEvents",
    allowlist,
    reason,
    notarization: "Distribution builds must be signed, notarized, and stapled before T3 is honest.",
  };
}

if (process.argv[1]?.includes("fsevents")) {
  console.log(JSON.stringify({ product: "OrgMemory Seal", os: "darwin", ...darwinSealSketch() }, null, 2));
  console.log("Scaffold only — FSEvents until MDM grants ESF; never claim T3 without notarization.");
}
