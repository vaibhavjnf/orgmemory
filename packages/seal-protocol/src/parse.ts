import { detectPlaceholder, pathOnAllowlist } from "./allowlist.js";
import { SEAL_EVENT_KINDS } from "./types.js";
import type {
  IntegrityTier,
  SealEvent,
  SealEventKind,
  SealIngestRejection,
  SealOs,
} from "./types.js";

const TIERS = new Set(["T0", "T1", "T2", "T3"]);

export function isSealEventKind(v: unknown): v is SealEventKind {
  return typeof v === "string" && (SEAL_EVENT_KINDS as string[]).includes(v);
}

export function parseSealEvent(raw: unknown, ctx: { deviceId: string; os: SealOs; allowlist: string[] }): SealEvent {
  if (!raw || typeof raw !== "object") {
    throw new Error("event must be an object");
  }
  const o = raw as Record<string, unknown>;
  if (!isSealEventKind(o.kind)) {
    throw new Error("kind must be created|modified|renamed|deleted|heartbeat");
  }
  const path = typeof o.path === "string" ? o.path : "";
  if (o.kind !== "heartbeat" && path.length < 1) {
    throw new Error("path is required except for heartbeat");
  }
  const osUser = typeof o.os_user === "string" ? o.os_user : typeof o.osUser === "string" ? o.osUser : "";
  if (typeof o.mtime !== "string" || osUser.length < 1) {
    throw new Error("mtime and os_user/osUser are required");
  }
  const integrityTier = o.integrity_tier ?? o.integrityTier;
  if (typeof integrityTier !== "string" || !TIERS.has(integrityTier)) {
    throw new Error("integrity_tier must be T0–T3");
  }
  const occurredAt =
    (typeof o.occurred_at === "string" && o.occurred_at) ||
    (typeof o.occurredAt === "string" && o.occurredAt) ||
    o.mtime;
  const destPath =
    typeof o.dest_path === "string" ? o.dest_path : typeof o.destPath === "string" ? o.destPath : null;
  const placeholder =
    detectPlaceholder(path || destPath || "", ctx.os) ??
    (o.placeholder as SealEvent["placeholder"]) ??
    null;
  const contentHashRaw = o.content_hash ?? o.contentHash;
  let contentHash = typeof contentHashRaw === "string" ? contentHashRaw : null;
  if (placeholder) {
    contentHash = null;
  }
  const allowlisted = o.kind === "heartbeat" ? true : pathOnAllowlist(path || destPath || "", ctx.allowlist);
  return {
    id: typeof o.id === "string" && o.id.length > 0 ? o.id : `sevt_${Math.random().toString(36).slice(2, 12)}`,
    deviceId: ctx.deviceId,
    kind: o.kind,
    path,
    destPath,
    contentHash: placeholder ? null : contentHash,
    mtime: o.mtime,
    osUser,
    integrityTier: integrityTier as IntegrityTier,
    placeholder,
    allowlisted,
    occurredAt,
  };
}

export function validateIngestBatch(
  events: unknown[],
  ctx: { deviceId: string; os: SealOs; allowlist: string[] },
): { accepted: SealEvent[]; rejected: SealIngestRejection[] } {
  const accepted: SealEvent[] = [];
  const rejected: SealIngestRejection[] = [];
  events.forEach((raw, index) => {
    try {
      const ev = parseSealEvent(raw, ctx);
      if (!ev.allowlisted) {
        rejected.push({
          index,
          code: "allowlist",
          reason: "Path is outside the enrolled allowlist. OrgMemory Seal never auto-widens.",
        });
        return;
      }
      accepted.push(ev);
    } catch (err) {
      rejected.push({
        index,
        code: "schema",
        reason: err instanceof Error ? err.message : "invalid event",
      });
    }
  });
  return { accepted, rejected };
}
