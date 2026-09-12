import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Artifact, Receipt, SourceFile, WorkEvent } from "@orgmemory/core";
import { assignCluster, normalizeConnector } from "@orgmemory/harness";
import { activityConnectors } from "../connectors/activity.js";
import {
  getWorkCluster,
  insertHarnessReceipt,
  insertWorkEvent,
  listWorkClusters,
  upsertArtifact,
} from "../db/store.js";

function nodeForActor(actorId: string): string {
  switch (actorId) {
    case "user_jordan":
      return "node_jordan_linux";
    case "user_priya":
      return "node_priya_win";
    case "user_sam":
      return "node_sam_web";
    case "user_agent":
      return "node_agent";
    default:
      return "node_agent";
  }
}

export function ingestActivityConnectors(db: DatabaseSync, orgId: string): number {
  const clusters = listWorkClusters(db, orgId);
  let n = 0;
  for (const connector of activityConnectors()) {
    const batch = normalizeConnector(connector, orgId);
    for (const draft of batch.events) {
      const clusterId = assignCluster(`${draft.clusterHint} ${draft.summary}`, clusters);
      let artifactId: string | null = null;
      if (draft.artifact) {
        const artifact = upsertArtifact(db, {
          id: `art_${draft.artifact.ref.replace(/[^a-z0-9]+/gi, "_")}`,
          orgId,
          clusterId,
          kind: draft.artifact.kind,
          title: draft.artifact.title,
          source: batch.source,
          ref: draft.artifact.ref,
          createdAt: draft.occurredAt,
        });
        artifactId = artifact.id;
      }
      insertWorkEvent(db, {
        id: `wevt_${draft.externalId.replace(/[^a-z0-9]+/gi, "_")}`,
        orgId,
        clusterId,
        actorId: draft.actorId,
        nodeId: nodeForActor(draft.actorId),
        source: batch.source,
        verb: draft.verb,
        summary: draft.summary,
        artifactId,
        occurredAt: draft.occurredAt,
      });
      n += 1;
    }
  }
  return n;
}

export function attachOverlayArtifacts(db: DatabaseSync, orgId: string): void {
  const files = db
    .prepare("SELECT id, name, path, matter_id, created_at FROM source_files WHERE org_id = ?")
    .all(orgId) as Array<{ id: string; name: string; path: string; matter_id: string | null; created_at: string }>;
  for (const f of files) {
    const clusterId = clusterForOverlayFile(f);
    upsertArtifact(db, {
      id: `art_${f.id}`,
      orgId,
      clusterId,
      kind: "file",
      title: f.name,
      source: sourceForPath(f.path),
      ref: f.id,
      createdAt: f.created_at,
    });
  }
}

function clusterForOverlayFile(f: { name: string; path: string; matter_id: string | null }): string | null {
  if (f.matter_id === "matter_hq") return "cl_rent";
  if (f.matter_id === "matter_4419") return "cl_4419";
  const hay = `${f.name} ${f.path}`.toLowerCase();
  if (hay.includes("4419")) return "cl_4419";
  if (hay.includes("exhibit") || hay.includes("concession") || hay.includes("montgomery")) return "cl_rent";
  return null;
}

export function recordHarnessFetch(
  db: DatabaseSync,
  args: {
    orgId: string;
    actorId: string;
    file: Pick<SourceFile, "id" | "name" | "matterId">;
    purpose: string;
    receiptId: string;
    clusterId?: string;
  },
): WorkEvent {
  const clusters = listWorkClusters(db, args.orgId);
  const clusterId =
    (args.clusterId && getWorkCluster(db, args.clusterId)?.id) ||
    assignCluster(`${args.file.name} ${args.file.matterId ?? ""} ${args.purpose}`, clusters);
  const now = new Date().toISOString();
  const artifact = upsertArtifact(db, {
    id: `art_${args.file.id}`,
    orgId: args.orgId,
    clusterId,
    kind: "file",
    title: args.file.name,
    source: "google_drive",
    ref: args.file.id,
    createdAt: now,
  });
  const receiptArtifact = upsertArtifact(db, {
    id: `art_receipt_${args.receiptId}`,
    orgId: args.orgId,
    clusterId,
    kind: "receipt",
    title: `OKFP ${args.receiptId}`,
    source: "fetch",
    ref: args.receiptId,
    createdAt: now,
  });
  const event: WorkEvent = {
    id: `wevt_fetch_${args.receiptId}`,
    orgId: args.orgId,
    clusterId,
    actorId: args.actorId,
    nodeId: nodeForActor(args.actorId),
    source: "fetch",
    verb: "fetched",
    summary: `Fetched ${args.file.name} — ${args.purpose}`,
    artifactId: artifact.id,
    occurredAt: now,
  };
  insertWorkEvent(db, event);
  const receipt: Receipt = {
    id: args.receiptId,
    orgId: args.orgId,
    clusterId,
    artifactId: receiptArtifact.id,
    actorId: args.actorId,
    purpose: args.purpose,
    issuedAt: now,
  };
  insertHarnessReceipt(db, receipt);
  return event;
}

export function recordHarnessSuggest(
  db: DatabaseSync,
  args: {
    orgId: string;
    actorId: string;
    query: string;
    context?: string;
    hitCount: number;
    clusterId?: string;
  },
): WorkEvent | null {
  const clusters = listWorkClusters(db, args.orgId);
  if (clusters.length === 0) return null;
  const clusterId =
    (args.clusterId && getWorkCluster(db, args.clusterId)?.id) ||
    assignCluster(`${args.query} ${args.context ?? ""}`, clusters);
  const now = new Date().toISOString();
  const event: WorkEvent = {
    id: `wevt_suggest_${randomUUID()}`,
    orgId: args.orgId,
    clusterId,
    actorId: args.actorId,
    nodeId: nodeForActor(args.actorId),
    source: "suggest",
    verb: "suggested",
    summary: `Suggested against “${args.query}” (${args.hitCount} ranked hits)`,
    artifactId: null,
    occurredAt: now,
  };
  insertWorkEvent(db, event);
  return event;
}

function sourceForPath(path: string): Artifact["source"] {
  const lower = path.toLowerCase();
  if (lower.includes("onedrive")) return "onedrive";
  if (lower.includes("dropbox")) return "dropbox";
  return "google_drive";
}

export function seedOverlayEvents(db: DatabaseSync, orgId: string): void {
  const clusters = listWorkClusters(db, orgId);
  const rent = clusters.find((c) => c.id === "cl_rent")?.id ?? assignCluster("HQ rent amendment", clusters);
  const matter = clusters.find((c) => c.id === "cl_4419")?.id ?? assignCluster("Matter 4419", clusters);
  const now = new Date().toISOString();
  insertWorkEvent(db, {
    id: "wevt_seed_drive_exhibit",
    orgId,
    clusterId: rent,
    actorId: "user_priya",
    nodeId: "node_priya_win",
    source: "google_drive",
    verb: "indexed",
    summary: "Drive overlay indexed Acme HQ Office Lease — Exhibit B Rent Schedule.pdf",
    artifactId: "art_file_gdrive_hq_exhibit_b",
    occurredAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
  });
  insertWorkEvent(db, {
    id: "wevt_seed_seal_win",
    orgId,
    clusterId: rent,
    actorId: "user_priya",
    nodeId: "node_priya_win",
    source: "seal",
    verb: "modified",
    summary: "PRIYA-SURFACE modified exhibit-b.pdf (Seal T1 — USN/admin missing).",
    artifactId: "art_file_gdrive_hq_exhibit_b",
    occurredAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
  });
  insertWorkEvent(db, {
    id: "wevt_seed_prior_fetch",
    orgId,
    clusterId: rent,
    actorId: "user_jordan",
    nodeId: "node_jordan_linux",
    source: "fetch",
    verb: "fetched",
    summary: "Prior official fetch of Exhibit B for a rent amendment (seeded reuse).",
    artifactId: "art_file_gdrive_hq_exhibit_b",
    occurredAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  });
  insertWorkEvent(db, {
    id: "wevt_seed_4419_drive",
    orgId,
    clusterId: matter,
    actorId: "user_priya",
    nodeId: "node_priya_win",
    source: "google_drive",
    verb: "indexed",
    summary: "Drive overlay indexed Client Matter 4419 — Lease Abstract (payment terms).",
    artifactId: "art_file_gdrive_4419_abstract",
    occurredAt: now,
  });
}
