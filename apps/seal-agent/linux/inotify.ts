/**
 * Linux Seal watcher — inotify sketch (T1).
 * If fanotify is permitted later, the same allowlist is reused (T2).
 * Missing CAP_SYS_ADMIN → stay on inotify. Never walk /.
 */
import { resolveIntegrityTier } from "@orgmemory/seal-protocol";
import { OfflineSealQueue } from "../shared/queue.js";

const allowlist = process.env.ORGMEMORY_SEAL_ALLOWLIST?.split(",") ?? ["/srv/matters"];

const caps = {
  os: "linux" as const,
  admin: process.getuid?.() === 0,
  usnJournal: false,
  fanotify: process.env.ORGMEMORY_SEAL_FANOTIFY === "1",
  esf: false,
  volumeEncryption: false,
  signedBinaryAttest: false,
};

const { tier, reason } = resolveIntegrityTier(caps);
const queue = new OfflineSealQueue("/var/lib/orgmemory/seal-queue.sqlite");

export function linuxSealSketch(): { tier: string; watcher: string; allowlist: string[]; reason: string } {
  void queue;
  return {
    tier,
    watcher: caps.fanotify ? "fanotify" : "inotify",
    allowlist,
    reason,
  };
}

if (process.argv[1]?.includes("inotify")) {
  console.log(JSON.stringify({ product: "OrgMemory Seal", os: "linux", ...linuxSealSketch() }, null, 2));
  console.log("Scaffold only — bind inotify watches to allowlist prefixes, heartbeat if the fd table fills.");
}
