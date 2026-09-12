import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Actor,
  Artifact,
  AuditEvent,
  BrowserOperatorJob,
  Chunk,
  Connector,
  ConnectorEnablement,
  HardCommit,
  HarnessSlice,
  HostedMemorySlot,
  InsightRollup,
  LoopTick,
  OkfpReceipt,
  PromptTrace,
  RuntimeRoutine,
  SessionRecord,
  SessionVault,
  SourceFile,
  Suggestion,
  TenantRuntime,
  TenantToolIdentity,
  TimelineMirror,
  User,
  WorkCluster,
  WorkEvent,
  WorkNode,
} from "@orgmemory/core";
import type { SealDevice, SealEvent } from "@orgmemory/seal-protocol";
import { SCHEMA_SQL } from "./schema.js";

function j(value: unknown): string {
  return JSON.stringify(value);
}

function p<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  return JSON.parse(raw) as T;
}

export function openDb(dbPath: string): DatabaseSync {
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  return db;
}

export function getUserByApiKey(db: DatabaseSync, apiKey: string): User | undefined {
  const row = db.prepare("SELECT * FROM users WHERE api_key = ?").get(apiKey) as UserRow | undefined;
  return row ? mapUser(row) : undefined;
}

export function getUserById(db: DatabaseSync, id: string): User | undefined {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? mapUser(row) : undefined;
}

export function orgHasSeed(db: DatabaseSync): boolean {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return Number(row.n) > 0;
}

export function upsertHarnessActor(db: DatabaseSync, actor: Actor): void {
  db.prepare(
    `INSERT INTO harness_actors(id, org_id, display_name, department, team, role)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       department = excluded.department,
       team = excluded.team,
       role = excluded.role`,
  ).run(actor.id, actor.orgId, actor.displayName, actor.department, actor.team, actor.role);
}

export function listHarnessActors(db: DatabaseSync, orgId: string): Actor[] {
  return (
    db.prepare("SELECT * FROM harness_actors WHERE org_id = ?").all(orgId) as unknown as Array<{
      id: string;
      org_id: string;
      display_name: string;
      department: string;
      team: string;
      role: Actor["role"];
    }>
  ).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    displayName: row.display_name,
    department: row.department,
    team: row.team,
    role: row.role,
  }));
}

export function listUsers(db: DatabaseSync, orgId: string): User[] {
  return (db.prepare("SELECT * FROM users WHERE org_id = ?").all(orgId) as unknown as UserRow[]).map(mapUser);
}

export function memberProjectIds(db: DatabaseSync, userId: string): string[] {
  return (
    db.prepare("SELECT project_id AS id FROM project_members WHERE user_id = ?").all(userId) as Array<{ id: string }>
  ).map((row) => row.id);
}

export function matterIdsFor(db: DatabaseSync, userId: string): string[] {
  return (
    db.prepare("SELECT matter_id AS id FROM matter_grants WHERE user_id = ?").all(userId) as Array<{ id: string }>
  ).map((row) => row.id);
}

export function listConnectors(db: DatabaseSync, orgId: string): Connector[] {
  const rows = db.prepare("SELECT * FROM connectors WHERE org_id = ?").all(orgId) as unknown as ConnectorRow[];
  return rows.map((row) => {
    const count = db.prepare("SELECT COUNT(*) AS n FROM source_files WHERE connector_id = ?").get(row.id) as {
      n: number;
    };
    return {
      id: row.id,
      orgId: row.org_id,
      kind: row.kind as Connector["kind"],
      displayName: row.display_name,
      status: row.status as Connector["status"],
      lastSyncAt: row.last_sync_at,
      lastError: row.last_error,
      fileCount: Number(count.n),
    };
  });
}

export function listFiles(db: DatabaseSync, orgId: string): SourceFile[] {
  const rows = db.prepare("SELECT * FROM source_files WHERE org_id = ?").all(orgId) as unknown as FileRow[];
  return rows.map((row) => mapFile(row, reuseForFile(db, row.id)));
}

export function getFile(db: DatabaseSync, id: string): SourceFile | undefined {
  const row = db.prepare("SELECT * FROM source_files WHERE id = ?").get(id) as FileRow | undefined;
  return row ? mapFile(row, reuseForFile(db, row.id)) : undefined;
}

export function insertSourceFile(db: DatabaseSync, file: SourceFile): void {
  db.prepare(
    `INSERT INTO source_files(
      id, org_id, connector_id, project_id, external_id, name, mime_type, path,
      owner_id, shared_with_json, content, content_hash, metadata_json, author_role,
      matter_id, created_at, modified_at, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    file.id,
    file.orgId,
    file.connectorId,
    file.projectId,
    file.externalId,
    file.name,
    file.mimeType,
    file.path,
    file.acl.ownerId,
    j(file.acl.sharedWith),
    file.content,
    file.contentHash,
    j(file.metadata),
    file.authorRole,
    file.matterId,
    file.createdAt,
    file.modifiedAt,
    file.indexedAt,
  );
}

export function listChunks(db: DatabaseSync, orgId: string): Chunk[] {
  return (db.prepare("SELECT * FROM chunks WHERE org_id = ?").all(orgId) as unknown as ChunkRow[]).map((row) => ({
    id: row.id,
    fileId: row.file_id,
    orgId: row.org_id,
    ordinal: row.ordinal,
    text: row.text,
    embedding: p<number[]>(row.embedding_json, []),
    tokenCount: row.token_count,
  }));
}

export function insertChunk(db: DatabaseSync, chunk: Chunk): void {
  db.prepare(
    "INSERT INTO chunks(id, file_id, org_id, ordinal, text, embedding_json, token_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(chunk.id, chunk.fileId, chunk.orgId, chunk.ordinal, chunk.text, j(chunk.embedding), chunk.tokenCount);
}

export function saveSuggestionBatch(
  db: DatabaseSync,
  batchId: string,
  orgId: string,
  actorId: string,
  query: string,
  suggestions: Suggestion[],
): void {
  db.prepare("INSERT INTO suggestion_batches(id, org_id, actor_id, query, created_at) VALUES (?, ?, ?, ?, ?)").run(
    batchId,
    orgId,
    actorId,
    query,
    new Date().toISOString(),
  );
  const insert = db.prepare(
    "INSERT INTO suggestions(id, batch_id, file_id, chunk_id, score, snippet, why_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const suggestion of suggestions) {
    insert.run(
      suggestion.id,
      batchId,
      suggestion.fileId,
      suggestion.chunkId,
      suggestion.score,
      suggestion.snippet,
      j(suggestion.why),
    );
  }
}

export function getSuggestion(db: DatabaseSync, id: string): Suggestion | undefined {
  const row = db.prepare("SELECT * FROM suggestions WHERE id = ?").get(id) as SuggestionRow | undefined;
  if (!row) return undefined;
  const file = getFile(db, row.file_id);
  if (!file) return undefined;
  return {
    id: row.id,
    fileId: row.file_id,
    chunkId: row.chunk_id,
    score: row.score,
    snippet: row.snippet,
    why: p(row.why_json, []),
    file,
  };
}

export function saveReceipt(db: DatabaseSync, receipt: OkfpReceipt): void {
  const { signature, publicKeyId, alg: _alg, ...body } = receipt;
  void _alg;
  db.prepare(
    "INSERT INTO receipts(id, org_id, body_json, signature, public_key_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(receipt.id, receipt.orgId, j(body), signature, publicKeyId, receipt.issuedAt);
}

export function getReceipt(db: DatabaseSync, id: string): OkfpReceipt | undefined {
  const row = db.prepare("SELECT * FROM receipts WHERE id = ?").get(id) as ReceiptRow | undefined;
  if (!row) return undefined;
  return {
    ...p<Omit<OkfpReceipt, "signature" | "publicKeyId" | "alg">>(row.body_json, {} as never),
    signature: row.signature,
    publicKeyId: row.public_key_id,
    alg: "ed25519",
  };
}

export function getOrgKeys(
  db: DatabaseSync,
  orgId: string,
): { keyId: string; publicPem: string; privatePem: string } | undefined {
  const row = db
    .prepare("SELECT key_id AS keyId, public_pem AS publicPem, private_pem AS privatePem FROM org_keys WHERE org_id = ?")
    .get(orgId) as { keyId: string; publicPem: string; privatePem: string } | undefined;
  return row;
}

export function insertOrgKeys(
  db: DatabaseSync,
  orgId: string,
  keys: { keyId: string; publicPem: string; privatePem: string },
): void {
  db.prepare("INSERT INTO org_keys(org_id, key_id, public_pem, private_pem) VALUES (?, ?, ?, ?)").run(
    orgId,
    keys.keyId,
    keys.publicPem,
    keys.privatePem,
  );
}

export function insertAudit(
  db: DatabaseSync,
  event: Omit<AuditEvent, "createdAt"> & { createdAt?: string },
): AuditEvent {
  const createdAt = event.createdAt ?? new Date().toISOString();
  const full: AuditEvent = { ...event, createdAt };
  db.prepare(
    `INSERT INTO audit_events(
      id, org_id, actor_id, agent_id, action, purpose, matter_id, ticket_id, file_id,
      suggestion_id, query, acl_snapshot_json, content_hash, receipt_id, decision, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    full.id,
    full.orgId,
    full.actorId,
    full.agentId,
    full.action,
    full.purpose,
    full.matterId,
    full.ticketId,
    full.fileId,
    full.suggestionId,
    full.query,
    full.aclSnapshot ? j(full.aclSnapshot) : null,
    full.contentHash,
    full.receiptId,
    full.decision,
    j(full.metadata),
    createdAt,
  );
  return full;
}

export function listAudit(db: DatabaseSync, orgId: string, user: User, limit = 50): AuditEvent[] {
  const rows =
    user.role === "manager" || user.role === "admin"
      ? (db
          .prepare("SELECT * FROM audit_events WHERE org_id = ? ORDER BY created_at DESC LIMIT ?")
          .all(orgId, limit) as unknown as AuditRow[])
      : (db
          .prepare("SELECT * FROM audit_events WHERE org_id = ? AND actor_id = ? ORDER BY created_at DESC LIMIT ?")
          .all(orgId, user.id, limit) as unknown as AuditRow[]);
  return rows.map(mapAudit);
}

export function bumpSkillReuse(db: DatabaseSync, fileId: string): void {
  const updated = db.prepare("UPDATE skill_edges SET reuse_count = reuse_count + 1 WHERE file_id = ?").run(fileId);
  if (Number(updated.changes) > 0) return;
  const file = getFile(db, fileId);
  if (!file) return;
  db.prepare(
    "INSERT INTO skill_edges(id, org_id, from_node_id, to_node_id, file_id, producer_id, reuse_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(`se_${fileId}`, file.orgId, "sk_leases", "sk_rent", fileId, file.acl.ownerId, 1);
}

export function topReused(
  db: DatabaseSync,
  orgId: string,
): Array<{ id: string; name: string; reuseCount: number; fetches: number; file: { id: string; name: string; path: string } }> {
  return (
    db
      .prepare(
        `SELECT f.id, f.name, f.path, COALESCE(SUM(e.reuse_count), 0) AS reuseCount
         FROM source_files f
         LEFT JOIN skill_edges e ON e.file_id = f.id
         WHERE f.org_id = ?
         GROUP BY f.id
         ORDER BY reuseCount DESC, f.name ASC`,
      )
      .all(orgId) as Array<{ id: string; name: string; path: string; reuseCount: number }>
  ).map((row) => ({
    id: row.id,
    name: row.name,
    reuseCount: Number(row.reuseCount),
    fetches: Number(row.reuseCount),
    file: { id: row.id, name: row.name, path: row.path },
  }));
}

export function listSkillGraph(db: DatabaseSync, orgId: string) {
  const nodes = (
    db.prepare("SELECT * FROM skill_nodes WHERE org_id = ?").all(orgId) as Array<{
      id: string;
      org_id: string;
      name: string;
      parent_id: string | null;
      kind: string;
      description: string;
    }>
  ).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    parentId: row.parent_id,
    kind: row.kind,
    description: row.description,
  }));
  const edges = (
    db.prepare("SELECT * FROM skill_edges WHERE org_id = ?").all(orgId) as Array<{
      id: string;
      org_id: string;
      from_node_id: string;
      to_node_id: string;
      file_id: string;
      producer_id: string;
      reuse_count: number;
    }>
  ).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    fileId: row.file_id,
    producerId: row.producer_id,
    reuseCount: row.reuse_count,
  }));
  return { nodes, edges };
}

export function getSealDevice(db: DatabaseSync, id: string): SealDevice | undefined {
  const row = db.prepare("SELECT * FROM seal_devices WHERE id = ?").get(id) as SealDeviceRow | undefined;
  return row ? mapSealDevice(row) : undefined;
}

export function listSealDevices(db: DatabaseSync, orgId: string): SealDevice[] {
  return (db.prepare("SELECT * FROM seal_devices WHERE org_id = ?").all(orgId) as unknown as SealDeviceRow[]).map(mapSealDevice);
}

export function upsertSealDevice(db: DatabaseSync, device: SealDevice): void {
  db.prepare(
    `INSERT INTO seal_devices(
      id, org_id, hostname, os, os_user, owner_user_id, integrity_tier, claimed_tier,
      degrade_reason, allowlist_json, capabilities_json, last_heartbeat_at, enrolled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      hostname = excluded.hostname,
      integrity_tier = excluded.integrity_tier,
      claimed_tier = excluded.claimed_tier,
      degrade_reason = excluded.degrade_reason,
      allowlist_json = excluded.allowlist_json,
      capabilities_json = excluded.capabilities_json,
      last_heartbeat_at = excluded.last_heartbeat_at`,
  ).run(
    device.id,
    device.orgId,
    device.hostname,
    device.os,
    device.osUser,
    device.ownerUserId,
    device.integrityTier,
    device.claimedTier,
    device.degradeReason,
    j(device.allowlist),
    j(device.capabilities),
    device.lastHeartbeatAt,
    device.enrolledAt,
  );
}

export function insertSealEvents(db: DatabaseSync, orgId: string, events: SealEvent[]): void {
  const insert = db.prepare(
    `INSERT INTO seal_events(
      id, org_id, device_id, kind, path, dest_path, content_hash, mtime, os_user,
      integrity_tier, placeholder, allowlisted, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const event of events) {
    insert.run(
      event.id,
      orgId,
      event.deviceId,
      event.kind,
      event.path,
      event.destPath,
      event.contentHash,
      event.mtime,
      event.osUser,
      event.integrityTier,
      event.placeholder,
      event.allowlisted ? 1 : 0,
      event.occurredAt,
    );
  }
}

export function touchSealHeartbeat(db: DatabaseSync, deviceId: string, at: string): void {
  db.prepare("UPDATE seal_devices SET last_heartbeat_at = ? WHERE id = ?").run(at, deviceId);
}

export function listWorkClusters(db: DatabaseSync, orgId: string): WorkCluster[] {
  return (db.prepare("SELECT * FROM work_clusters WHERE org_id = ?").all(orgId) as unknown as ClusterRow[]).map(mapCluster);
}

export function getWorkCluster(db: DatabaseSync, id: string): WorkCluster | undefined {
  const row = db.prepare("SELECT * FROM work_clusters WHERE id = ?").get(id) as ClusterRow | undefined;
  return row ? mapCluster(row) : undefined;
}

export function upsertWorkCluster(
  db: DatabaseSync,
  cluster: WorkCluster,
  opts?: { allowFrozen?: boolean },
): void {
  const existing = db.prepare("SELECT frozen_commit_id FROM work_clusters WHERE id = ?").get(cluster.id) as
    | { frozen_commit_id: string | null }
    | undefined;
  if (existing?.frozen_commit_id && !opts?.allowFrozen) {
    throw new Error(`Cluster ${cluster.id} is frozen by ${existing.frozen_commit_id}.`);
  }
  db.prepare(
    `INSERT INTO work_clusters(
      id, org_id, department, team, title, stage, owner_actor_id, actor_ids_json, node_ids_json, frozen_commit_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      department = excluded.department,
      team = excluded.team,
      title = excluded.title,
      stage = excluded.stage,
      owner_actor_id = excluded.owner_actor_id,
      actor_ids_json = excluded.actor_ids_json,
      node_ids_json = excluded.node_ids_json,
      frozen_commit_id = excluded.frozen_commit_id,
      updated_at = excluded.updated_at`,
  ).run(
    cluster.id,
    cluster.orgId,
    cluster.department,
    cluster.team,
    cluster.title,
    cluster.stage,
    cluster.ownerActorId,
    j(cluster.actorIds),
    j(cluster.nodeIds),
    cluster.frozenCommitId,
    cluster.updatedAt,
  );
}

export function freezeCluster(db: DatabaseSync, clusterId: string, commitId: string, at: string): void {
  db.prepare("UPDATE work_clusters SET frozen_commit_id = ?, updated_at = ? WHERE id = ?").run(commitId, at, clusterId);
}

export function listWorkEvents(db: DatabaseSync, orgId: string, opts?: { limit?: number }): WorkEvent[] {
  const limit = opts?.limit ?? 200;
  return (
    db
      .prepare("SELECT * FROM work_events WHERE org_id = ? ORDER BY occurred_at DESC LIMIT ?")
      .all(orgId, limit) as unknown as EventRow[]
  ).map(mapEvent);
}

export function insertWorkEvent(db: DatabaseSync, event: WorkEvent): void {
  db.prepare(
    `INSERT OR IGNORE INTO work_events(
      id, org_id, cluster_id, actor_id, node_id, source, verb, summary, artifact_id, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.id,
    event.orgId,
    event.clusterId,
    event.actorId,
    event.nodeId,
    event.source,
    event.verb,
    event.summary,
    event.artifactId,
    event.occurredAt,
  );
}

export function listWorkNodes(db: DatabaseSync, orgId: string): WorkNode[] {
  return (db.prepare("SELECT * FROM work_nodes WHERE org_id = ?").all(orgId) as unknown as NodeRow[]).map(mapNode);
}

export function upsertWorkNode(db: DatabaseSync, node: WorkNode): void {
  db.prepare(
    `INSERT INTO work_nodes(id, org_id, kind, label, department, actor_id, online, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       label = excluded.label,
       department = excluded.department,
       actor_id = excluded.actor_id,
       online = excluded.online,
       last_seen_at = excluded.last_seen_at`,
  ).run(node.id, node.orgId, node.kind, node.label, node.department, node.actorId, node.online ? 1 : 0, node.lastSeenAt);
}

export function upsertArtifact(db: DatabaseSync, artifact: Artifact): Artifact {
  db.prepare(
    `INSERT INTO artifacts(id, org_id, cluster_id, kind, title, source, ref, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       cluster_id = excluded.cluster_id,
       kind = excluded.kind,
       title = excluded.title,
       source = excluded.source,
       ref = excluded.ref`,
  ).run(
    artifact.id,
    artifact.orgId,
    artifact.clusterId,
    artifact.kind,
    artifact.title,
    artifact.source,
    artifact.ref,
    artifact.createdAt,
  );
  return artifact;
}

export function listArtifacts(db: DatabaseSync, orgId: string): Artifact[] {
  return (
    db.prepare("SELECT * FROM artifacts WHERE org_id = ?").all(orgId) as Array<{
      id: string;
      org_id: string;
      cluster_id: string | null;
      kind: Artifact["kind"];
      title: string;
      source: Artifact["source"];
      ref: string;
      created_at: string;
    }>
  ).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    clusterId: row.cluster_id,
    kind: row.kind,
    title: row.title,
    source: row.source,
    ref: row.ref,
    createdAt: row.created_at,
  }));
}

export function captureHarnessSlice(db: DatabaseSync, orgId: string): HarnessSlice {
  return {
    clusters: listWorkClusters(db, orgId).map((cluster) => ({
      id: cluster.id,
      title: cluster.title,
      stage: cluster.stage,
      department: cluster.department,
      team: cluster.team,
      ownerActorId: cluster.ownerActorId,
      actorIds: cluster.actorIds,
      nodeIds: cluster.nodeIds,
      frozenCommitId: cluster.frozenCommitId,
      updatedAt: cluster.updatedAt,
    })),
    artifacts: listArtifacts(db, orgId).map((artifact) => ({
      id: artifact.id,
      clusterId: artifact.clusterId,
      kind: artifact.kind,
      title: artifact.title,
      source: artifact.source,
      ref: artifact.ref,
      createdAt: artifact.createdAt,
    })),
    events: listWorkEvents(db, orgId).map((event) => ({
      id: event.id,
      clusterId: event.clusterId,
      actorId: event.actorId,
      nodeId: event.nodeId,
      source: event.source,
      verb: event.verb,
      summary: event.summary,
      artifactId: event.artifactId,
      occurredAt: event.occurredAt,
    })),
  };
}

export function insertTimelineMirror(db: DatabaseSync, mirror: TimelineMirror, slice: HarnessSlice): void {
  db.prepare(
    "INSERT INTO timeline_mirrors(id, org_id, label, created_by, created_at, slice_json, slice_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(mirror.id, mirror.orgId, mirror.label, mirror.createdBy, mirror.createdAt, j(slice), mirror.sliceHash);
}

export function getTimelineMirror(
  db: DatabaseSync,
  id: string,
): { mirror: TimelineMirror; slice: HarnessSlice } | undefined {
  const row = db.prepare("SELECT * FROM timeline_mirrors WHERE id = ?").get(id) as MirrorRow | undefined;
  if (!row) return undefined;
  const slice = p<HarnessSlice>(row.slice_json, { clusters: [], artifacts: [], events: [] });
  return {
    mirror: mapMirror(row, slice),
    slice,
  };
}

export function listTimelineMirrors(db: DatabaseSync, orgId: string): TimelineMirror[] {
  return (db.prepare("SELECT * FROM timeline_mirrors WHERE org_id = ? ORDER BY created_at DESC").all(orgId) as unknown as MirrorRow[]).map(
    (row) => mapMirror(row, p<HarnessSlice>(row.slice_json, { clusters: [], artifacts: [], events: [] })),
  );
}

export function insertHardCommit(db: DatabaseSync, commit: HardCommit, body: unknown): void {
  db.prepare(
    `INSERT INTO hard_commits(
      id, org_id, subgraph, target_id, label, actor_id, slice_hash, body_json, signature, public_key_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    commit.id,
    commit.orgId,
    commit.subgraph,
    commit.targetId,
    commit.label,
    commit.actorId,
    commit.sliceHash,
    j(body),
    commit.signature,
    commit.publicKeyId,
    commit.createdAt,
  );
}

export function listHardCommits(db: DatabaseSync, orgId: string): HardCommit[] {
  return (
    db.prepare("SELECT * FROM hard_commits WHERE org_id = ? ORDER BY created_at DESC").all(orgId) as Array<{
      id: string;
      org_id: string;
      subgraph: HardCommit["subgraph"];
      target_id: string;
      label: string;
      actor_id: string;
      slice_hash: string;
      signature: string;
      public_key_id: string;
      created_at: string;
    }>
  ).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    subgraph: row.subgraph,
    targetId: row.target_id,
    label: row.label,
    actorId: row.actor_id,
    sliceHash: row.slice_hash,
    signature: row.signature,
    publicKeyId: row.public_key_id,
    createdAt: row.created_at,
  }));
}

export function insertHarnessReceipt(
  db: DatabaseSync,
  receipt: { id: string; orgId: string; clusterId: string | null; artifactId: string | null; actorId: string; purpose: string; issuedAt: string },
): void {
  db.prepare(
    "INSERT INTO harness_receipts(id, org_id, cluster_id, artifact_id, actor_id, purpose, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(receipt.id, receipt.orgId, receipt.clusterId, receipt.artifactId, receipt.actorId, receipt.purpose, receipt.issuedAt);
}

export function listSessionVaults(db: DatabaseSync, orgId: string): SessionVault[] {
  return (db.prepare("SELECT * FROM session_vaults WHERE org_id = ?").all(orgId) as unknown as VaultRow[]).map(mapVault);
}

export function getSessionVault(db: DatabaseSync, id: string): SessionVault | undefined {
  const row = db.prepare("SELECT * FROM session_vaults WHERE id = ?").get(id) as VaultRow | undefined;
  return row ? mapVault(row) : undefined;
}

export function upsertSessionVault(db: DatabaseSync, vault: SessionVault): void {
  db.prepare(
    `INSERT INTO session_vaults(id, org_id, device_id, actor_id, origins_json, enrolled_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET origins_json = excluded.origins_json`,
  ).run(vault.id, vault.orgId, vault.deviceId, vault.actorId, j(vault.allowlistedOrigins), vault.enrolledAt);
}

export function upsertSessionRecord(db: DatabaseSync, rec: SessionRecord): void {
  db.prepare(
    `INSERT INTO session_records(id, vault_id, origin, tool, status, cookie_present, redacted_hint, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       cookie_present = excluded.cookie_present,
       redacted_hint = excluded.redacted_hint,
       updated_at = excluded.updated_at`,
  ).run(rec.id, rec.vaultId, rec.origin, rec.tool, rec.status, rec.cookiePresent ? 1 : 0, rec.redactedHint, rec.updatedAt);
}

export function listSessionRecords(db: DatabaseSync, vaultId: string): SessionRecord[] {
  return (
    db.prepare("SELECT * FROM session_records WHERE vault_id = ?").all(vaultId) as unknown as SessionRow[]
  ).map(mapSession);
}

export function listBrowserJobs(db: DatabaseSync, orgId: string): BrowserOperatorJob[] {
  return (db.prepare("SELECT * FROM browser_jobs WHERE org_id = ?").all(orgId) as unknown as JobRow[]).map(mapJob);
}

export function insertBrowserJob(db: DatabaseSync, job: BrowserOperatorJob): void {
  db.prepare(
    `INSERT INTO browser_jobs(
      id, org_id, vault_id, node_id, actor_id, cluster_id, origin, intent, status, steps_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    job.id,
    job.orgId,
    job.vaultId,
    job.nodeId,
    job.actorId,
    job.clusterId,
    job.origin,
    job.intent,
    job.status,
    j(job.steps),
    job.createdAt,
  );
}

export function listTenantIdentities(db: DatabaseSync, orgId: string): TenantToolIdentity[] {
  return (
    db.prepare("SELECT * FROM tenant_tool_identities WHERE org_id = ?").all(orgId) as Array<{
      id: string;
      org_id: string;
      provider: TenantToolIdentity["provider"];
      enterprise_email: string;
      actor_id: string;
      status: TenantToolIdentity["status"];
    }>
  ).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    provider: row.provider,
    enterpriseEmail: row.enterprise_email,
    actorId: row.actor_id,
    status: row.status,
  }));
}

export function upsertTenantIdentity(db: DatabaseSync, identity: TenantToolIdentity): void {
  db.prepare(
    `INSERT INTO tenant_tool_identities(id, org_id, provider, enterprise_email, actor_id, status)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, enterprise_email = excluded.enterprise_email`,
  ).run(identity.id, identity.orgId, identity.provider, identity.enterpriseEmail, identity.actorId, identity.status);
}

export function listEnablements(db: DatabaseSync, orgId: string): ConnectorEnablement[] {
  return (
    db.prepare("SELECT * FROM connector_enablements WHERE org_id = ?").all(orgId) as Array<{
      id: string;
      org_id: string;
      identity_id: string;
      tool: string;
      enabled: number;
      mock: number;
    }>
  ).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    identityId: row.identity_id,
    tool: row.tool,
    enabled: Boolean(row.enabled),
    mock: Boolean(row.mock),
  }));
}

export function upsertEnablement(db: DatabaseSync, enablement: ConnectorEnablement): void {
  db.prepare(
    `INSERT INTO connector_enablements(id, org_id, identity_id, tool, enabled, mock)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, mock = excluded.mock`,
  ).run(
    enablement.id,
    enablement.orgId,
    enablement.identityId,
    enablement.tool,
    enablement.enabled ? 1 : 0,
    enablement.mock ? 1 : 0,
  );
}

export function listPromptTraces(db: DatabaseSync, orgId: string, limit = 50): PromptTrace[] {
  return (
    db
      .prepare("SELECT * FROM prompt_traces WHERE org_id = ? ORDER BY occurred_at DESC LIMIT ?")
      .all(orgId, limit) as unknown as TraceRow[]
  ).map(mapTrace);
}

export function insertPromptTrace(db: DatabaseSync, trace: PromptTrace): void {
  db.prepare(
    `INSERT INTO prompt_traces(id, org_id, actor_id, cluster_id, prompt, tools_json, outcome, insight, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    trace.id,
    trace.orgId,
    trace.actorId,
    trace.clusterId,
    trace.prompt,
    j(trace.tools),
    trace.outcome,
    trace.insight,
    trace.occurredAt,
  );
}

export function insightRollup(db: DatabaseSync, orgId: string): InsightRollup {
  const traces = listPromptTraces(db, orgId, 500);
  const byInsight = countBy(traces.map((trace) => trace.insight));
  const byActor = countBy(traces.map((trace) => trace.actorId));
  const byTool = countBy(traces.flatMap((trace) => trace.tools));
  return {
    byInsight: byInsight.map(([insight, n]) => ({ insight, n })),
    byActor: byActor.map(([actorId, n]) => ({ actorId, n })),
    byTool: byTool.map(([tool, n]) => ({ tool, n })),
    traceCount: traces.length,
  };
}

export function getTenantRuntime(db: DatabaseSync, orgId: string): TenantRuntime | undefined {
  const row = db.prepare("SELECT * FROM tenant_runtimes WHERE org_id = ?").get(orgId) as RuntimeRow | undefined;
  return row ? mapRuntime(row) : undefined;
}

export function upsertTenantRuntime(db: DatabaseSync, runtime: TenantRuntime): void {
  db.prepare(
    `INSERT INTO tenant_runtimes(id, org_id, actor_id, label, status, last_tick_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, last_tick_at = excluded.last_tick_at, label = excluded.label`,
  ).run(runtime.id, runtime.orgId, runtime.actorId, runtime.label, runtime.status, runtime.lastTickAt);
}

export function listRoutines(db: DatabaseSync, orgId: string): RuntimeRoutine[] {
  return (
    db.prepare("SELECT * FROM runtime_routines WHERE org_id = ?").all(orgId) as unknown as RoutineRow[]
  ).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    runtimeId: row.runtime_id,
    clusterId: row.cluster_id,
    title: row.title,
    cadence: row.cadence as RuntimeRoutine["cadence"],
    enabled: Boolean(row.enabled),
  }));
}

export function upsertRoutine(db: DatabaseSync, routine: RuntimeRoutine): void {
  db.prepare(
    `INSERT INTO runtime_routines(id, org_id, runtime_id, cluster_id, title, cadence, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, title = excluded.title`,
  ).run(
    routine.id,
    routine.orgId,
    routine.runtimeId,
    routine.clusterId,
    routine.title,
    routine.cadence,
    routine.enabled ? 1 : 0,
  );
}

export function upsertMemorySlot(db: DatabaseSync, slot: HostedMemorySlot): void {
  db.prepare(
    `INSERT INTO runtime_memory(id, org_id, runtime_id, slot_key, slot_value, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(runtime_id, slot_key) DO UPDATE SET slot_value = excluded.slot_value, updated_at = excluded.updated_at`,
  ).run(slot.id, slot.orgId, slot.runtimeId, slot.key, slot.value, slot.updatedAt);
}

export function insertRuntimeTick(db: DatabaseSync, tick: LoopTick): void {
  db.prepare(
    `INSERT INTO runtime_ticks(id, org_id, runtime_id, routine_id, cluster_id, steps_json, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(tick.id, tick.orgId, tick.runtimeId, tick.routineId, tick.clusterId, j(tick.steps), tick.startedAt, tick.finishedAt);
  db.prepare("UPDATE tenant_runtimes SET status = ?, last_tick_at = ? WHERE id = ?").run(
    "idle",
    tick.finishedAt,
    tick.runtimeId,
  );
}

export function runtimeStatus(db: DatabaseSync, orgId: string) {
  return {
    runtime: getTenantRuntime(db, orgId) ?? null,
    routines: listRoutines(db, orgId),
  };
}

export function listOwnerBoard(db: DatabaseSync, orgId: string) {
  const clusters = listWorkClusters(db, orgId);
  const events = listWorkEvents(db, orgId);
  const nodes = listWorkNodes(db, orgId);
  const actors = listHarnessActors(db, orgId);
  const artifacts = listArtifacts(db, orgId);
  const sourceCounts = new Map<string, number>();
  for (const event of events) sourceCounts.set(event.source, (sourceCounts.get(event.source) ?? 0) + 1);
  const departments = [...new Set(clusters.map((cluster) => cluster.department))].map((department) => {
    const inDept = clusters.filter((cluster) => cluster.department === department);
    const teams = [...new Set(inDept.map((cluster) => cluster.team))].map((team) => ({
      team,
      clusters: inDept
        .filter((cluster) => cluster.team === team)
        .map((cluster) => ({
          ...cluster,
          artifactCount: artifacts.filter((artifact) => artifact.clusterId === cluster.id).length,
          recentEvents: events.filter((event) => event.clusterId === cluster.id).slice(0, 4),
          nodes: nodes.filter((node) => cluster.nodeIds.includes(node.id)),
        })),
    }));
    return { department, teams };
  });
  return {
    identity: "harness" as const,
    bus: "connector → WorkEvent → harness store → UI",
    actors,
    nodes,
    departments,
    sources: [...sourceCounts.entries()].map(([source, count]) => ({ source, events: count })),
    clusterCount: clusters.length,
    eventCount: events.length,
    clusters,
    events: events.slice(0, 40),
  };
}

export function getClusterBriefing(db: DatabaseSync, orgId: string, clusterId: string) {
  const cluster = listWorkClusters(db, orgId).find((item) => item.id === clusterId);
  if (!cluster) return undefined;
  return {
    cluster,
    actors: listHarnessActors(db, orgId).filter((actor) => cluster.actorIds.includes(actor.id)),
    events: listWorkEvents(db, orgId).filter((event) => event.clusterId === clusterId),
    artifacts: listArtifacts(db, orgId).filter((artifact) => artifact.clusterId === clusterId),
    receipts: (
      db
        .prepare("SELECT * FROM harness_receipts WHERE org_id = ? AND cluster_id = ?")
        .all(orgId, clusterId) as unknown as Array<{
        id: string;
        cluster_id: string | null;
        artifact_id: string | null;
        actor_id: string;
        purpose: string;
        issued_at: string;
      }>
    ).map((row) => ({
      id: row.id,
      clusterId: row.cluster_id,
      artifactId: row.artifact_id,
      actorId: row.actor_id,
      purpose: row.purpose,
      issuedAt: row.issued_at,
    })),
    nodes: listWorkNodes(db, orgId).filter((node) => cluster.nodeIds.includes(node.id)),
  };
}

function reuseForFile(db: DatabaseSync, fileId: string): number {
  const row = db.prepare("SELECT COALESCE(SUM(reuse_count), 0) AS n FROM skill_edges WHERE file_id = ?").get(fileId) as {
    n: number;
  };
  return Number(row.n);
}

function countBy(values: string[]): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

interface UserRow {
  id: string;
  org_id: string;
  email: string;
  display_name: string;
  role: User["role"];
  agent_id: string | null;
}

interface ConnectorRow {
  id: string;
  org_id: string;
  kind: string;
  display_name: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
}

interface FileRow {
  id: string;
  org_id: string;
  connector_id: string;
  project_id: string | null;
  external_id: string;
  name: string;
  mime_type: string;
  path: string;
  owner_id: string;
  shared_with_json: string;
  content: string | null;
  content_hash: string;
  metadata_json: string;
  author_role: SourceFile["authorRole"];
  matter_id: string | null;
  created_at: string;
  modified_at: string;
  indexed_at: string | null;
}

interface ChunkRow {
  id: string;
  file_id: string;
  org_id: string;
  ordinal: number;
  text: string;
  embedding_json: string;
  token_count: number;
}

interface SuggestionRow {
  id: string;
  file_id: string;
  chunk_id: string;
  score: number;
  snippet: string;
  why_json: string;
}

interface ReceiptRow {
  body_json: string;
  signature: string;
  public_key_id: string;
}

interface AuditRow {
  id: string;
  org_id: string;
  actor_id: string;
  agent_id: string | null;
  action: AuditEvent["action"];
  purpose: string | null;
  matter_id: string | null;
  ticket_id: string | null;
  file_id: string | null;
  suggestion_id: string | null;
  query: string | null;
  acl_snapshot_json: string | null;
  content_hash: string | null;
  receipt_id: string | null;
  decision: AuditEvent["decision"];
  metadata_json: string;
  created_at: string;
}

interface SealDeviceRow {
  id: string;
  org_id: string;
  hostname: string;
  os: SealDevice["os"];
  os_user: string;
  owner_user_id: string;
  integrity_tier: SealDevice["integrityTier"];
  claimed_tier: SealDevice["claimedTier"];
  degrade_reason: string | null;
  allowlist_json: string;
  capabilities_json: string;
  last_heartbeat_at: string | null;
  enrolled_at: string;
}

interface ClusterRow {
  id: string;
  org_id: string;
  department: string;
  team: string;
  title: string;
  stage: WorkCluster["stage"];
  owner_actor_id: string;
  actor_ids_json: string;
  node_ids_json: string;
  frozen_commit_id: string | null;
  updated_at: string;
}

interface EventRow {
  id: string;
  org_id: string;
  cluster_id: string | null;
  actor_id: string;
  node_id: string | null;
  source: WorkEvent["source"];
  verb: string;
  summary: string;
  artifact_id: string | null;
  occurred_at: string;
}

interface NodeRow {
  id: string;
  org_id: string;
  kind: WorkNode["kind"];
  label: string;
  department: string;
  actor_id: string;
  online: number;
  last_seen_at: string;
}

interface MirrorRow {
  id: string;
  org_id: string;
  label: string;
  created_by: string;
  created_at: string;
  slice_json: string;
  slice_hash: string;
}

interface VaultRow {
  id: string;
  org_id: string;
  device_id: string;
  actor_id: string;
  origins_json: string;
  enrolled_at: string;
}

interface SessionRow {
  id: string;
  vault_id: string;
  origin: string;
  tool: string;
  status: SessionRecord["status"];
  cookie_present: number;
  redacted_hint: string;
  updated_at: string;
}

interface JobRow {
  id: string;
  org_id: string;
  vault_id: string | null;
  node_id: string;
  actor_id: string;
  cluster_id: string | null;
  origin: string;
  intent: string;
  status: BrowserOperatorJob["status"];
  steps_json: string;
  created_at: string;
}

interface TraceRow {
  id: string;
  org_id: string;
  actor_id: string;
  cluster_id: string | null;
  prompt: string;
  tools_json: string;
  outcome: string;
  insight: string;
  occurred_at: string;
}

interface RuntimeRow {
  id: string;
  org_id: string;
  actor_id: string;
  label: string;
  status: TenantRuntime["status"];
  last_tick_at: string | null;
}

interface RoutineRow {
  id: string;
  org_id: string;
  runtime_id: string;
  cluster_id: string;
  title: string;
  cadence: string;
  enabled: number;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    agentId: row.agent_id,
  };
}

function mapFile(row: FileRow, reuseCount: number): SourceFile {
  return {
    id: row.id,
    orgId: row.org_id,
    connectorId: row.connector_id,
    projectId: row.project_id,
    externalId: row.external_id,
    name: row.name,
    mimeType: row.mime_type,
    path: row.path,
    acl: { ownerId: row.owner_id, sharedWith: p<string[]>(row.shared_with_json, []) },
    content: row.content,
    contentHash: row.content_hash,
    metadata: p<Record<string, string>>(row.metadata_json, {}),
    authorRole: row.author_role,
    matterId: row.matter_id,
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
    indexedAt: row.indexed_at,
    reuseCount,
  };
}

function mapAudit(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    actorId: row.actor_id,
    agentId: row.agent_id,
    action: row.action,
    purpose: row.purpose,
    matterId: row.matter_id,
    ticketId: row.ticket_id,
    fileId: row.file_id,
    suggestionId: row.suggestion_id,
    query: row.query,
    aclSnapshot: p(row.acl_snapshot_json, null),
    contentHash: row.content_hash,
    receiptId: row.receipt_id,
    decision: row.decision,
    metadata: p(row.metadata_json, {}),
    createdAt: row.created_at,
  };
}

function mapSealDevice(row: SealDeviceRow): SealDevice {
  return {
    id: row.id,
    orgId: row.org_id,
    hostname: row.hostname,
    os: row.os,
    osUser: row.os_user,
    ownerUserId: row.owner_user_id,
    integrityTier: row.integrity_tier,
    claimedTier: row.claimed_tier,
    degradeReason: row.degrade_reason,
    allowlist: p(row.allowlist_json, []),
    capabilities: p(row.capabilities_json, {
      os: row.os,
      admin: false,
      usnJournal: false,
      fanotify: false,
      esf: false,
      volumeEncryption: false,
      signedBinaryAttest: false,
    }),
    lastHeartbeatAt: row.last_heartbeat_at,
    enrolledAt: row.enrolled_at,
  };
}

function mapCluster(row: ClusterRow): WorkCluster {
  return {
    id: row.id,
    orgId: row.org_id,
    department: row.department,
    team: row.team,
    title: row.title,
    stage: row.stage,
    ownerActorId: row.owner_actor_id,
    actorIds: p(row.actor_ids_json, []),
    nodeIds: p(row.node_ids_json, []),
    frozenCommitId: row.frozen_commit_id,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row: EventRow): WorkEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    clusterId: row.cluster_id,
    actorId: row.actor_id,
    nodeId: row.node_id,
    source: row.source,
    verb: row.verb,
    summary: row.summary,
    artifactId: row.artifact_id,
    occurredAt: row.occurred_at,
  };
}

function mapNode(row: NodeRow): WorkNode {
  return {
    id: row.id,
    orgId: row.org_id,
    kind: row.kind,
    label: row.label,
    department: row.department,
    actorId: row.actor_id,
    online: Boolean(row.online),
    lastSeenAt: row.last_seen_at,
  };
}

function mapMirror(row: MirrorRow, slice: HarnessSlice): TimelineMirror {
  return {
    id: row.id,
    orgId: row.org_id,
    label: row.label,
    createdBy: row.created_by,
    createdAt: row.created_at,
    sliceHash: row.slice_hash,
    clusterCount: slice.clusters.length,
    eventCount: slice.events.length,
  };
}

function mapVault(row: VaultRow): SessionVault {
  return {
    id: row.id,
    orgId: row.org_id,
    deviceId: row.device_id,
    actorId: row.actor_id,
    allowlistedOrigins: p(row.origins_json, []),
    enrolledAt: row.enrolled_at,
  };
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    vaultId: row.vault_id,
    origin: row.origin,
    tool: row.tool,
    status: row.status,
    cookiePresent: Boolean(row.cookie_present),
    redactedHint: row.redacted_hint,
    updatedAt: row.updated_at,
  };
}

function mapJob(row: JobRow): BrowserOperatorJob {
  return {
    id: row.id,
    orgId: row.org_id,
    vaultId: row.vault_id,
    nodeId: row.node_id,
    actorId: row.actor_id,
    clusterId: row.cluster_id,
    origin: row.origin,
    intent: row.intent,
    status: row.status,
    steps: p(row.steps_json, []),
    createdAt: row.created_at,
  };
}

function mapTrace(row: TraceRow): PromptTrace {
  return {
    id: row.id,
    orgId: row.org_id,
    actorId: row.actor_id,
    clusterId: row.cluster_id,
    prompt: row.prompt,
    tools: p(row.tools_json, []),
    outcome: row.outcome,
    insight: row.insight,
    occurredAt: row.occurred_at,
  };
}

function mapRuntime(row: RuntimeRow): TenantRuntime {
  return {
    id: row.id,
    orgId: row.org_id,
    actorId: row.actor_id,
    label: row.label,
    archetype: "hermes-hosted",
    authority: "orgmemory-infra",
    status: row.status,
    lastTickAt: row.last_tick_at,
  };
}
