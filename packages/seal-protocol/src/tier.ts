import type { IntegrityTier, SealCapabilities, SealOs } from "./types.js";

/**
 * Degrade-don't-die: never refuse to run because USN/ESF/admin is missing.
 * Drop the advertised tier and keep heartbeats (T0) at minimum.
 */
export function resolveIntegrityTier(caps: SealCapabilities): {
  tier: IntegrityTier;
  reason: string;
  degradedFrom: IntegrityTier | null;
} {
  const t2Available = hasJournalTier(caps);
  const wantT3 = t2Available && caps.volumeEncryption && caps.signedBinaryAttest;
  if (wantT3) {
    return { tier: "T3", reason: "Journal + volume encryption + signed binary attest.", degradedFrom: null };
  }
  if (t2Available) {
    const missing = [
      !caps.volumeEncryption ? "volume encryption signal" : null,
      !caps.signedBinaryAttest ? "signed binary attest" : null,
    ].filter(Boolean);
    if (missing.length) {
      return {
        tier: "T2",
        reason: `Journal/ESF/fanotify available; T3 blocked (${missing.join(", ")}).`,
        degradedFrom: "T3",
      };
    }
    return { tier: "T2", reason: "Journal/ESF/fanotify watch is live.", degradedFrom: null };
  }
  const t1 = hasUserSpaceWatch(caps);
  if (t1) {
    return {
      tier: "T1",
      reason: workaroundReason(caps),
      degradedFrom: "T2",
    };
  }
  return {
    tier: "T0",
    reason: "No directory watch available. Heartbeat only until a user-space watcher can start.",
    degradedFrom: "T1",
  };
}

function hasJournalTier(caps: SealCapabilities): boolean {
  switch (caps.os) {
    case "linux":
      return caps.fanotify;
    case "windows":
      return caps.usnJournal && caps.admin;
    case "darwin":
      return caps.esf;
    default: {
      const _n: never = caps.os;
      return _n;
    }
  }
}

function hasUserSpaceWatch(caps: SealCapabilities): boolean {
  switch (caps.os) {
    case "linux":
    case "windows":
    case "darwin":
      return true;
    default: {
      const _n: never = caps.os;
      return _n;
    }
  }
}

function workaroundReason(caps: SealCapabilities): string {
  switch (caps.os) {
    case "windows":
      return "USN journal or admin token missing. Falling back to ReadDirectoryChangesW + offline SQLite queue (DPAPI).";
    case "darwin":
      return "Endpoint Security not granted. Falling back to FSEvents + Keychain-backed offline queue. ESF remains aspirational.";
    case "linux":
      return "fanotify not permitted. Falling back to inotify on the enrolled prefixes only.";
    default: {
      const _n: never = caps.os;
      return String(_n);
    }
  }
}

export function watcherName(os: SealOs, tier: IntegrityTier): string {
  if (tier === "T0") return "heartbeat";
  switch (os) {
    case "linux":
      return tier === "T1" ? "inotify" : "fanotify";
    case "windows":
      return tier === "T1" ? "ReadDirectoryChangesW" : "USN";
    case "darwin":
      return tier === "T1" ? "FSEvents" : "ESF";
    default: {
      const _n: never = os;
      return String(_n);
    }
  }
}
