import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  isManagedOrigin,
  newReceiptId,
  signCanonical,
  signReceiptBody,
  OKFP_VERSION,
  type BrowserOperatorJob,
  type HardCommit,
  type OkfpKeyPair,
  type OkfpReceipt,
  type TimelineMirror,
  type User,
  type WorkStage,
} from "@orgmemory/core";
import {
  captureHarnessSlice,
  freezeCluster,
  getTimelineMirror,
  insertBrowserJob,
  insertHardCommit,
  insertHarnessReceipt,
  insertTimelineMirror,
  insertWorkEvent,
  listEnablements,
  listTenantIdentities,
  listWorkClusters,
  upsertWorkCluster,
} from "../db/store.js";

export function createMirror(
  db: DatabaseSync,
  args: { orgId: string; actorId: string; label: string; keys?: OkfpKeyPair },
): TimelineMirror {
  const slice = captureHarnessSlice(db, args.orgId);
  const now = new Date().toISOString();
  const signed = args.keys
    ? signCanonical(slice, args.keys)
    : { hash: `sha256:unsigned-${slice.clusters.length}`, signature: "", publicKeyId: "" };
  const mirror: TimelineMirror = {
    id: `mir_${randomUUID().slice(0, 8)}`,
    orgId: args.orgId,
    label: args.label,
    createdBy: args.actorId,
    createdAt: now,
    sliceHash: signed.hash,
    clusterCount: slice.clusters.length,
    eventCount: slice.events.length,
  };
  insertTimelineMirror(db, mirror, slice);
  insertWorkEvent(db, {
    id: `wevt_mirror_${mirror.id}`,
    orgId: args.orgId,
    clusterId: null,
    actorId: args.actorId,
    nodeId: "node_agent",
    source: "mirror",
    verb: "snapshotted",
    summary: `Timeline mirror “${args.label}” (${slice.clusters.length} clusters).`,
    artifactId: null,
    occurredAt: now,
  });
  return mirror;
}

export function rollbackMirror(
  db: DatabaseSync,
  args: { orgId: string; actor: User; mirrorId: string; keys: OkfpKeyPair },
): { receipt: OkfpReceipt; mirror: TimelineMirror } {
  const found = getTimelineMirror(db, args.mirrorId);
  if (!found || found.mirror.orgId !== args.orgId) {
    throw new Error("Unknown timeline mirror.");
  }
  const now = new Date().toISOString();
  for (const c of found.slice.clusters) {
    upsertWorkCluster(
      db,
      {
        id: c.id,
        orgId: args.orgId,
        department: c.department,
        team: c.team,
        title: c.title,
        stage: c.stage as WorkStage,
        ownerActorId: c.ownerActorId,
        actorIds: c.actorIds,
        nodeIds: c.nodeIds,
        frozenCommitId: c.frozenCommitId,
        updatedAt: now,
      },
      { allowFrozen: true },
    );
  }
  const receiptId = newReceiptId();
  const receipt = signReceiptBody(
    {
      v: OKFP_VERSION,
      id: receiptId,
      orgId: args.orgId,
      actorId: args.actor.id,
      agentId: args.actor.agentId,
      fileId: args.mirrorId,
      suggestionId: null,
      purpose: `Emergency rollback to timeline mirror ${found.mirror.label}`,
      matterId: null,
      ticketId: null,
      aclSnapshot: { ownerId: args.actor.id, sharedWith: [] },
      contentHash: found.mirror.sliceHash,
      issuedAt: now,
    },
    args.keys,
  );
  insertHarnessReceipt(db, {
    id: receipt.id,
    orgId: args.orgId,
    clusterId: null,
    artifactId: null,
    actorId: args.actor.id,
    purpose: receipt.purpose,
    issuedAt: now,
  });
  insertWorkEvent(db, {
    id: `wevt_rollback_${receipt.id}`,
    orgId: args.orgId,
    clusterId: null,
    actorId: args.actor.id,
    nodeId: "node_agent",
    source: "mirror",
    verb: "rolled_back",
    summary: `Rolled harness slice back to “${found.mirror.label}”.`,
    artifactId: null,
    occurredAt: now,
  });
  return { receipt, mirror: found.mirror };
}

export function hardCommitCluster(
  db: DatabaseSync,
  args: {
    orgId: string;
    actorId: string;
    clusterId: string;
    label: string;
    subgraph: HardCommit["subgraph"];
    keys: OkfpKeyPair;
  },
): HardCommit {
  const cluster = listWorkClusters(db, args.orgId).find((c) => c.id === args.clusterId);
  if (!cluster) throw new Error("Unknown cluster for hard commit.");
  const now = new Date().toISOString();
  const body = {
    subgraph: args.subgraph,
    targetId: cluster.id,
    stage: cluster.stage,
    title: cluster.title,
    actorIds: cluster.actorIds,
    frozenAt: now,
  };
  const signed = signCanonical(body, args.keys);
  const commit: HardCommit = {
    id: `cmt_${randomUUID().slice(0, 8)}`,
    orgId: args.orgId,
    subgraph: args.subgraph,
    targetId: cluster.id,
    label: args.label,
    actorId: args.actorId,
    sliceHash: signed.hash,
    signature: signed.signature,
    publicKeyId: signed.publicKeyId,
    createdAt: now,
  };
  insertHardCommit(db, commit, body);
  freezeCluster(db, cluster.id, commit.id, now);
  insertWorkEvent(db, {
    id: `wevt_commit_${commit.id}`,
    orgId: args.orgId,
    clusterId: cluster.id,
    actorId: args.actorId,
    nodeId: "node_agent",
    source: "commit",
    verb: "froze",
    summary: `Hard commit “${args.label}” froze ${cluster.title} at ${cluster.stage}.`,
    artifactId: null,
    occurredAt: now,
  });
  return commit;
}

export function enqueueBrowserJob(
  db: DatabaseSync,
  args: {
    orgId: string;
    actorId: string;
    nodeId: string;
    vaultId: string | null;
    clusterId: string | null;
    origin: string;
    intent: string;
  },
): BrowserOperatorJob {
  if (!isManagedOrigin(args.origin)) {
    throw new Error("Browser jobs only run against enterprise-managed origins.");
  }
  const now = new Date().toISOString();
  const steps = [
    { verb: "attach", summary: `Attach enrolled vault session for ${args.origin}`, at: now },
    { verb: "navigate", summary: `Stub navigate: ${args.intent}`, at: now },
    { verb: "record", summary: "Emit WorkEvent; no personal-profile scrape.", at: now },
  ];
  const job: BrowserOperatorJob = {
    id: `bjob_${randomUUID().slice(0, 8)}`,
    orgId: args.orgId,
    vaultId: args.vaultId,
    nodeId: args.nodeId,
    actorId: args.actorId,
    clusterId: args.clusterId,
    origin: args.origin,
    intent: args.intent,
    status: "stub",
    steps,
    createdAt: now,
  };
  insertBrowserJob(db, job);
  for (const step of steps) {
    insertWorkEvent(db, {
      id: `wevt_bjob_${job.id}_${step.verb}`,
      orgId: args.orgId,
      clusterId: args.clusterId,
      actorId: args.actorId,
      nodeId: args.nodeId,
      source: "browser",
      verb: step.verb,
      summary: step.summary,
      artifactId: null,
      occurredAt: step.at,
    });
  }
  return job;
}

export function invokeComposioMock(
  db: DatabaseSync,
  args: { orgId: string; actorId: string; tool: string; action: string; clusterId?: string },
): { ok: true; mock: true; identityEmail: string; tool: string; action: string; result: string } {
  const identities = listTenantIdentities(db, args.orgId);
  const identity = identities.find((i) => i.status === "active") ?? identities[0];
  if (!identity) throw new Error("No Composio tenant identity enrolled.");
  const enabled = listEnablements(db, args.orgId).find((e) => e.tool === args.tool && e.identityId === identity.id);
  if (enabled && !enabled.enabled) throw new Error(`Tool ${args.tool} is not enabled for this tenant.`);
  const now = new Date().toISOString();
  const result = `mock ${args.tool}.${args.action} as ${identity.enterpriseEmail}`;
  insertWorkEvent(db, {
    id: `wevt_composio_${randomUUID().slice(0, 8)}`,
    orgId: args.orgId,
    clusterId: args.clusterId ?? null,
    actorId: args.actorId,
    nodeId: "node_agent",
    source: "composio",
    verb: args.action,
    summary: `Composio ${args.tool}.${args.action} via ${identity.enterpriseEmail} (mock).`,
    artifactId: null,
    occurredAt: now,
  });
  return { ok: true, mock: true, identityEmail: identity.enterpriseEmail, tool: args.tool, action: args.action, result };
}
