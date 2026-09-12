import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type {
  Acl,
  ActivitySource,
  Actor,
  Artifact,
  AuditAction,
  AuditEvent,
  BrowserOperatorJob,
  Chunk,
  Connector,
  ConnectorEnablement,
  HardCommit,
  HarnessSlice,
  InsightRollup,
  OkfpReceipt,
  PolicyDecision,
  PromptTrace,
  Receipt,
  SessionRecord,
  SessionVault,
  SkillEdge,
  SkillNode,
  SourceFile,
  Suggestion,
  TenantToolIdentity,
  TimelineMirror,
  HostedMemorySlot,
  LoopTick,
  RuntimeRoutine,
  TenantRuntime,
  User,
  UserRole,
  WhyScore,
  WorkCluster,
  WorkEvent,
  WorkNode,
  WorkStage,
} from "@orgmemory/core";
import type { SealDevice, SealEvent } from "@orgmemory/seal-protocol";
import { SCHEMA_SQL } from "./schema.js";

export function openDb(dbPath: string): DatabaseSync {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  migrateHarness(db);
  return db;
}

function migrateHarness(db: DatabaseSync): void {
  addColumnIfMissing(db, "work_events", "node_id", "TEXT");
  addColumnIfMissing(db, "work_clusters", "node_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "work_clusters", "frozen_commit_id", "TEXT");
}

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

export function orgHasSeed(db: DatabaseSync): boolean {
  const row = db.prepare("SELECT id FROM orgs WHERE id = ?").get("org_acme") as { id: string } | undefined;
  return Boolean(row);
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function rowToUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    email: String(row.email),
    displayName: String(row.display_name),
    role: row.role as UserRole,
    apiKey: String(row.api_key),
    agentId: row.agent_id ? String(row.agent_id) : null,
  };
}

export function rowToFile(row: Record<string, unknown>, reuseCount = 0): SourceFile {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    connectorId: String(row.connector_id),
    projectId: row.project_id ? String(row.project_id) : null,
    externalId: String(row.external_id),
    name: String(row.name),
    mimeType: String(row.mime_type),
    path: String(row.path),
    acl: {
      ownerId: String(row.owner_id),
      sharedWith: parseJson<string[]>(String(row.shared_with_json), []),
    },
    content: row.content == null ? null : String(row.content),
    contentHash: String(row.content_hash),
    metadata: parseJson<Record<string, string>>(String(row.metadata_json), {}),
    authorRole: row.author_role as UserRole,
    matterId: row.matter_id ? String(row.matter_id) : null,
    createdAt: String(row.created_at),
    modifiedAt: String(row.modified_at),
    indexedAt: row.indexed_at ? String(row.indexed_at) : null,
    reuseCount,
  };
}

export function getUserByApiKey(db: DatabaseSync, apiKey: string): User | undefined {
  const row = db.prepare("SELECT * FROM users WHERE api_key = ?").get(apiKey) as Record<string, unknown> | undefined;
  return row ? rowToUser(row) : undefined;
}

export function getUserById(db: DatabaseSync, id: string): User | undefined {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToUser(row) : undefined;
}

export function listUsers(db: DatabaseSync, orgId: string): User[] {
  const rows = db.prepare("SELECT * FROM users WHERE org_id = ?").all(orgId) as Record<string, unknown>[];
  return rows.map(rowToUser);
}

export function memberProjectIds(db: DatabaseSync, userId: string): string[] {
  const rows = db.prepare("SELECT project_id FROM project_members WHERE user_id = ?").all(userId) as { project_id: string }[];
  return rows.map((r) => r.project_id);
}

export function matterIdsFor(db: DatabaseSync, userId: string): string[] {
  const rows = db.prepare("SELECT matter_id FROM matter_grants WHERE user_id = ?").all(userId) as { matter_id: string }[];
  return rows.map((r) => r.matter_id);
}

export function reuseCountFor(db: DatabaseSync, fileId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM audit_events WHERE file_id = ? AND action = 'fetch' AND decision = 'allow'")
    .get(fileId) as { n: number };
  return Number(row.n);
}

export function getFile(db: DatabaseSync, id: string): SourceFile | undefined {
  const row = db.prepare("SELECT * FROM source_files WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return rowToFile(row, reuseCountFor(db, id));
}

export function listFiles(db: DatabaseSync, orgId: string): SourceFile[] {
  const rows = db.prepare("SELECT * FROM source_files WHERE org_id = ?").all(orgId) as Record<string, unknown>[];
  return rows.map((r) => rowToFile(r, reuseCountFor(db, String(r.id))));
}

export function listChunks(db: DatabaseSync, orgId: string): Chunk[] {
  const rows = db.prepare("SELECT * FROM chunks WHERE org_id = ?").all(orgId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    fileId: String(r.file_id),
    orgId: String(r.org_id),
    ordinal: Number(r.ordinal),
    text: String(r.text),
    embedding: parseJson<number[]>(String(r.embedding_json), []),
    tokenCount: Number(r.token_count),
  }));
}

export function listConnectors(db: DatabaseSync, orgId: string): Connector[] {
  const rows = db.prepare("SELECT * FROM connectors WHERE org_id = ?").all(orgId) as Record<string, unknown>[];
  return rows.map((r) => {
    const count = db.prepare("SELECT COUNT(*) AS n FROM source_files WHERE connector_id = ?").get(String(r.id)) as {
      n: number;
    };
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      kind: r.kind as Connector["kind"],
      displayName: String(r.display_name),
      status: r.status as Connector["status"],
      lastSyncAt: r.last_sync_at ? String(r.last_sync_at) : null,
      lastError: r.last_error ? String(r.last_error) : null,
      fileCount: Number(count.n),
    };
  });
}

export function insertAudit(
  db: DatabaseSync,
  event: Omit<AuditEvent, "createdAt"> & { createdAt?: string },
): AuditEvent {
  const createdAt = event.createdAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO audit_events (
      id, org_id, actor_id, agent_id, action, purpose, matter_id, ticket_id,
      file_id, suggestion_id, query, acl_snapshot_json, content_hash, receipt_id,
      decision, metadata_json, created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    event.id,
    event.orgId,
    event.actorId,
    event.agentId,
    event.action,
    event.purpose,
    event.matterId,
    event.ticketId,
    event.fileId,
    event.suggestionId,
    event.query,
    event.aclSnapshot ? JSON.stringify(event.aclSnapshot) : null,
    event.contentHash,
    event.receiptId,
    event.decision,
    JSON.stringify(event.metadata),
    createdAt,
  );
  return { ...event, createdAt };
}

export function listAudit(
  db: DatabaseSync,
  orgId: string,
  actor: User,
  limit = 50,
): AuditEvent[] {
  const rows = db
    .prepare("SELECT * FROM audit_events WHERE org_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(orgId, limit) as Record<string, unknown>[];
  const events = rows.map(rowToAudit);
  if (actor.role === "manager" || actor.role === "admin") return events;
  return events.filter((e) => e.actorId === actor.id || e.agentId === actor.id);
}

function rowToAudit(r: Record<string, unknown>): AuditEvent {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    actorId: String(r.actor_id),
    agentId: r.agent_id ? String(r.agent_id) : null,
    action: r.action as AuditAction,
    purpose: r.purpose ? String(r.purpose) : null,
    matterId: r.matter_id ? String(r.matter_id) : null,
    ticketId: r.ticket_id ? String(r.ticket_id) : null,
    fileId: r.file_id ? String(r.file_id) : null,
    suggestionId: r.suggestion_id ? String(r.suggestion_id) : null,
    query: r.query ? String(r.query) : null,
    aclSnapshot: r.acl_snapshot_json ? parseJson<Acl>(String(r.acl_snapshot_json), { ownerId: "", sharedWith: [] }) : null,
    contentHash: r.content_hash ? String(r.content_hash) : null,
    receiptId: r.receipt_id ? String(r.receipt_id) : null,
    decision: r.decision as PolicyDecision,
    metadata: parseJson<Record<string, string>>(String(r.metadata_json), {}),
    createdAt: String(r.created_at),
  };
}

export function saveSuggestionBatch(
  db: DatabaseSync,
  batchId: string,
  orgId: string,
  actorId: string,
  query: string,
  suggestions: Suggestion[],
): void {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO suggestion_batches (id, org_id, actor_id, query, created_at) VALUES (?,?,?,?,?)").run(
    batchId,
    orgId,
    actorId,
    query,
    now,
  );
  const ins = db.prepare(
    "INSERT INTO suggestions (id, batch_id, file_id, chunk_id, score, snippet, why_json) VALUES (?,?,?,?,?,?,?)",
  );
  for (const s of suggestions) {
    ins.run(s.id, batchId, s.fileId, s.chunkId, s.score, s.snippet, JSON.stringify(s.why));
  }
}

export function getSuggestion(db: DatabaseSync, id: string): { id: string; fileId: string; batchId: string } | undefined {
  const row = db.prepare("SELECT id, file_id, batch_id FROM suggestions WHERE id = ?").get(id) as
    | { id: string; file_id: string; batch_id: string }
    | undefined;
  if (!row) return undefined;
  return { id: row.id, fileId: row.file_id, batchId: row.batch_id };
}

export function saveReceipt(db: DatabaseSync, receipt: OkfpReceipt): void {
  db.prepare(
    "INSERT INTO receipts (id, org_id, body_json, signature, public_key_id, created_at) VALUES (?,?,?,?,?,?)",
  ).run(receipt.id, receipt.orgId, JSON.stringify(receipt), receipt.signature, receipt.publicKeyId, receipt.issuedAt);
}

export function getReceipt(db: DatabaseSync, id: string): OkfpReceipt | undefined {
  const row = db.prepare("SELECT body_json FROM receipts WHERE id = ?").get(id) as { body_json: string } | undefined;
  if (!row) return undefined;
  return parseJson<OkfpReceipt>(row.body_json, undefined as unknown as OkfpReceipt);
}

export function getOrgKeys(db: DatabaseSync, orgId: string): { keyId: string; publicPem: string; privatePem: string } | undefined {
  const row = db.prepare("SELECT key_id, public_pem, private_pem FROM org_keys WHERE org_id = ?").get(orgId) as
    | { key_id: string; public_pem: string; private_pem: string }
    | undefined;
  if (!row) return undefined;
  return { keyId: row.key_id, publicPem: row.public_pem, privatePem: row.private_pem };
}

export function topReused(db: DatabaseSync, orgId: string, limit = 8): Array<{ file: SourceFile; fetches: number }> {
  const rows = db
    .prepare(
      `SELECT file_id, COUNT(*) AS n FROM audit_events
       WHERE org_id = ? AND action = 'fetch' AND decision = 'allow' AND file_id IS NOT NULL
       GROUP BY file_id ORDER BY n DESC LIMIT ?`,
    )
    .all(orgId, limit) as { file_id: string; n: number }[];
  const out: Array<{ file: SourceFile; fetches: number }> = [];
  for (const r of rows) {
    const f = getFile(db, r.file_id);
    if (f) out.push({ file: f, fetches: Number(r.n) });
  }
  return out;
}

export function listSkillGraph(db: DatabaseSync, orgId: string): { nodes: SkillNode[]; edges: SkillEdge[] } {
  const nodes = db.prepare("SELECT * FROM skill_nodes WHERE org_id = ?").all(orgId) as Record<string, unknown>[];
  const edges = db.prepare("SELECT * FROM skill_edges WHERE org_id = ?").all(orgId) as Record<string, unknown>[];
  return {
    nodes: nodes.map((n) => ({
      id: String(n.id),
      orgId: String(n.org_id),
      name: String(n.name),
      parentId: n.parent_id ? String(n.parent_id) : null,
      kind: n.kind as SkillNode["kind"],
      description: String(n.description),
    })),
    edges: edges.map((e) => ({
      id: String(e.id),
      orgId: String(e.org_id),
      fromNodeId: String(e.from_node_id),
      toNodeId: String(e.to_node_id),
      fileId: String(e.file_id),
      producerId: String(e.producer_id),
      reuseCount: Number(e.reuse_count),
    })),
  };
}

export function bumpSkillReuse(db: DatabaseSync, fileId: string): void {
  db.prepare("UPDATE skill_edges SET reuse_count = reuse_count + 1 WHERE file_id = ?").run(fileId);
}

export function upsertSealDevice(db: DatabaseSync, device: SealDevice): void {
  db.prepare(
    `INSERT INTO seal_devices (
      id, org_id, hostname, os, os_user, owner_user_id, integrity_tier, claimed_tier,
      degrade_reason, allowlist_json, capabilities_json, last_heartbeat_at, enrolled_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      hostname=excluded.hostname,
      integrity_tier=excluded.integrity_tier,
      claimed_tier=excluded.claimed_tier,
      degrade_reason=excluded.degrade_reason,
      allowlist_json=excluded.allowlist_json,
      capabilities_json=excluded.capabilities_json,
      last_heartbeat_at=excluded.last_heartbeat_at`,
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
    JSON.stringify(device.allowlist),
    JSON.stringify(device.capabilities),
    device.lastHeartbeatAt,
    device.enrolledAt,
  );
}

export function getSealDevice(db: DatabaseSync, id: string): SealDevice | undefined {
  const r = db.prepare("SELECT * FROM seal_devices WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? rowToDevice(r) : undefined;
}

export function listSealDevices(db: DatabaseSync, orgId: string): SealDevice[] {
  const rows = db.prepare("SELECT * FROM seal_devices WHERE org_id = ? ORDER BY hostname").all(orgId) as Record<
    string,
    unknown
  >[];
  return rows.map(rowToDevice);
}

function rowToDevice(r: Record<string, unknown>): SealDevice {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    hostname: String(r.hostname),
    os: r.os as SealDevice["os"],
    osUser: String(r.os_user),
    ownerUserId: String(r.owner_user_id),
    integrityTier: r.integrity_tier as SealDevice["integrityTier"],
    claimedTier: r.claimed_tier as SealDevice["claimedTier"],
    degradeReason: r.degrade_reason ? String(r.degrade_reason) : null,
    allowlist: JSON.parse(String(r.allowlist_json)) as string[],
    capabilities: JSON.parse(String(r.capabilities_json)) as SealDevice["capabilities"],
    lastHeartbeatAt: r.last_heartbeat_at ? String(r.last_heartbeat_at) : null,
    enrolledAt: String(r.enrolled_at),
  };
}

export function insertSealEvents(db: DatabaseSync, orgId: string, events: SealEvent[]): void {
  const ins = db.prepare(
    `INSERT OR REPLACE INTO seal_events (
      id, org_id, device_id, kind, path, dest_path, content_hash, mtime, os_user,
      integrity_tier, placeholder, allowlisted, occurred_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const e of events) {
    ins.run(
      e.id,
      orgId,
      e.deviceId,
      e.kind,
      e.path,
      e.destPath,
      e.contentHash,
      e.mtime,
      e.osUser,
      e.integrityTier,
      e.placeholder,
      e.allowlisted ? 1 : 0,
      e.occurredAt,
    );
  }
}

export function touchSealHeartbeat(db: DatabaseSync, deviceId: string, at: string): void {
  db.prepare("UPDATE seal_devices SET last_heartbeat_at = ? WHERE id = ?").run(at, deviceId);
}

export function upsertHarnessActor(db: DatabaseSync, actor: Actor): void {
  db.prepare(
    `INSERT INTO harness_actors (id, org_id, display_name, department, team, role)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       display_name=excluded.display_name,
       department=excluded.department,
       team=excluded.team,
       role=excluded.role`,
  ).run(actor.id, actor.orgId, actor.displayName, actor.department, actor.team, actor.role);
}

export function upsertWorkCluster(db: DatabaseSync, cluster: WorkCluster, opts?: { allowFrozen?: boolean }): void {
  const existing = getWorkCluster(db, cluster.id);
  if (existing?.frozenCommitId && !opts?.allowFrozen) {
    const stageChanged = existing.stage !== cluster.stage;
    const titleChanged = existing.title !== cluster.title;
    if (stageChanged || titleChanged) {
      throw new Error(
        `Cluster ${cluster.id} is frozen by hard commit ${existing.frozenCommitId}. Soft edits cannot clobber it.`,
      );
    }
  }
  db.prepare(
    `INSERT INTO work_clusters (
      id, org_id, department, team, title, stage, owner_actor_id, actor_ids_json,
      node_ids_json, frozen_commit_id, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      department=excluded.department,
      team=excluded.team,
      title=excluded.title,
      stage=excluded.stage,
      owner_actor_id=excluded.owner_actor_id,
      actor_ids_json=excluded.actor_ids_json,
      node_ids_json=excluded.node_ids_json,
      frozen_commit_id=excluded.frozen_commit_id,
      updated_at=excluded.updated_at`,
  ).run(
    cluster.id,
    cluster.orgId,
    cluster.department,
    cluster.team,
    cluster.title,
    cluster.stage,
    cluster.ownerActorId,
    JSON.stringify(cluster.actorIds),
    JSON.stringify(cluster.nodeIds),
    cluster.frozenCommitId,
    cluster.updatedAt,
  );
}

export function touchWorkCluster(db: DatabaseSync, clusterId: string, at: string): void {
  db.prepare("UPDATE work_clusters SET updated_at = ? WHERE id = ?").run(at, clusterId);
}

export function upsertArtifact(db: DatabaseSync, artifact: Artifact): Artifact {
  const existing = db
    .prepare("SELECT * FROM artifacts WHERE org_id = ? AND ref = ?")
    .get(artifact.orgId, artifact.ref) as Record<string, unknown> | undefined;
  if (existing) {
    if (artifact.clusterId && !existing.cluster_id) {
      db.prepare("UPDATE artifacts SET cluster_id = ? WHERE id = ?").run(artifact.clusterId, String(existing.id));
      existing.cluster_id = artifact.clusterId;
    }
    return rowToArtifact(existing);
  }
  db.prepare(
    `INSERT INTO artifacts (id, org_id, cluster_id, kind, title, source, ref, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
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

export function insertWorkEvent(db: DatabaseSync, event: WorkEvent): void {
  db.prepare(
    `INSERT OR REPLACE INTO work_events (
      id, org_id, cluster_id, actor_id, node_id, source, verb, summary, artifact_id, occurred_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
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
  if (event.clusterId) touchWorkCluster(db, event.clusterId, event.occurredAt);
}

export function insertHarnessReceipt(db: DatabaseSync, receipt: Receipt): void {
  db.prepare(
    `INSERT OR REPLACE INTO harness_receipts (
      id, org_id, cluster_id, artifact_id, actor_id, purpose, issued_at
    ) VALUES (?,?,?,?,?,?,?)`,
  ).run(
    receipt.id,
    receipt.orgId,
    receipt.clusterId,
    receipt.artifactId,
    receipt.actorId,
    receipt.purpose,
    receipt.issuedAt,
  );
}

export function listHarnessActors(db: DatabaseSync, orgId: string): Actor[] {
  const rows = db.prepare("SELECT * FROM harness_actors WHERE org_id = ? ORDER BY department, team").all(orgId) as Record<
    string,
    unknown
  >[];
  return rows.map(rowToHarnessActor);
}

export function listWorkClusters(db: DatabaseSync, orgId: string): WorkCluster[] {
  const rows = db
    .prepare("SELECT * FROM work_clusters WHERE org_id = ? ORDER BY department, team, title")
    .all(orgId) as Record<string, unknown>[];
  return rows.map(rowToCluster);
}

export function getWorkCluster(db: DatabaseSync, id: string): WorkCluster | undefined {
  const row = db.prepare("SELECT * FROM work_clusters WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToCluster(row) : undefined;
}

export function listArtifacts(db: DatabaseSync, orgId: string, clusterId?: string): Artifact[] {
  const rows = (
    clusterId
      ? db.prepare("SELECT * FROM artifacts WHERE org_id = ? AND cluster_id = ? ORDER BY created_at DESC").all(orgId, clusterId)
      : db.prepare("SELECT * FROM artifacts WHERE org_id = ? ORDER BY created_at DESC").all(orgId)
  ) as Record<string, unknown>[];
  return rows.map(rowToArtifact);
}

export function listWorkEvents(db: DatabaseSync, orgId: string, opts?: { clusterId?: string; limit?: number }): WorkEvent[] {
  const limit = opts?.limit ?? 80;
  const rows = (
    opts?.clusterId
      ? db
          .prepare(
            "SELECT * FROM work_events WHERE org_id = ? AND cluster_id = ? ORDER BY occurred_at DESC LIMIT ?",
          )
          .all(orgId, opts.clusterId, limit)
      : db.prepare("SELECT * FROM work_events WHERE org_id = ? ORDER BY occurred_at DESC LIMIT ?").all(orgId, limit)
  ) as Record<string, unknown>[];
  return rows.map(rowToWorkEvent);
}

export function listHarnessReceipts(db: DatabaseSync, orgId: string, clusterId?: string): Receipt[] {
  const rows = (
    clusterId
      ? db
          .prepare("SELECT * FROM harness_receipts WHERE org_id = ? AND cluster_id = ? ORDER BY issued_at DESC")
          .all(orgId, clusterId)
      : db.prepare("SELECT * FROM harness_receipts WHERE org_id = ? ORDER BY issued_at DESC").all(orgId)
  ) as Record<string, unknown>[];
  return rows.map(rowToHarnessReceipt);
}

export function countWorkEventsBySource(db: DatabaseSync, orgId: string): Array<{ source: ActivitySource; n: number }> {
  const rows = db
    .prepare("SELECT source, COUNT(*) AS n FROM work_events WHERE org_id = ? GROUP BY source")
    .all(orgId) as Array<{ source: string; n: number }>;
  return rows.map((r) => ({ source: r.source as ActivitySource, n: Number(r.n) }));
}

export interface ClusterCard extends WorkCluster {
  artifactCount: number;
  recentEvents: WorkEvent[];
  nodes: WorkNode[];
}

export interface DepartmentLane {
  department: string;
  teams: Array<{ team: string; clusters: ClusterCard[] }>;
}

export interface OwnerBoard {
  identity: "harness";
  bus: string;
  actors: Actor[];
  nodes: WorkNode[];
  departments: DepartmentLane[];
  sources: Array<{ source: ActivitySource; events: number }>;
  clusterCount: number;
  eventCount: number;
}

export function listOwnerBoard(db: DatabaseSync, orgId: string): OwnerBoard {
  const actors = listHarnessActors(db, orgId);
  const nodes = listWorkNodes(db, orgId);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const clusters = listWorkClusters(db, orgId);
  const events = listWorkEvents(db, orgId, { limit: 120 });
  const artifacts = listArtifacts(db, orgId);
  const sources = countWorkEventsBySource(db, orgId).map((s) => ({ source: s.source, events: s.n }));

  const eventsByCluster = new Map<string, WorkEvent[]>();
  for (const e of events) {
    if (!e.clusterId) continue;
    const list = eventsByCluster.get(e.clusterId) ?? [];
    list.push(e);
    eventsByCluster.set(e.clusterId, list);
  }
  const artifactCount = new Map<string, number>();
  for (const a of artifacts) {
    if (!a.clusterId) continue;
    artifactCount.set(a.clusterId, (artifactCount.get(a.clusterId) ?? 0) + 1);
  }

  const deptMap = new Map<string, Map<string, ClusterCard[]>>();
  for (const c of clusters) {
    const card: ClusterCard = {
      ...c,
      artifactCount: artifactCount.get(c.id) ?? 0,
      recentEvents: (eventsByCluster.get(c.id) ?? []).slice(0, 3),
      nodes: c.nodeIds.map((id) => nodeById.get(id)).filter((n): n is WorkNode => Boolean(n)),
    };
    const teams = deptMap.get(c.department) ?? new Map<string, ClusterCard[]>();
    const lane = teams.get(c.team) ?? [];
    lane.push(card);
    teams.set(c.team, lane);
    deptMap.set(c.department, teams);
  }

  const departments: DepartmentLane[] = [...deptMap.entries()].map(([department, teams]) => ({
    department,
    teams: [...teams.entries()].map(([team, clusterCards]) => ({ team, clusters: clusterCards })),
  }));

  return {
    identity: "harness",
    bus: "connector → WorkEvent → harness store → UI",
    actors,
    nodes,
    departments,
    sources,
    clusterCount: clusters.length,
    eventCount: events.length,
  };
}

export function getClusterBriefing(
  db: DatabaseSync,
  orgId: string,
  clusterId: string,
): {
  cluster: WorkCluster;
  actors: Actor[];
  artifacts: Artifact[];
  events: WorkEvent[];
  receipts: Receipt[];
} | undefined {
  const cluster = getWorkCluster(db, clusterId);
  if (!cluster || cluster.orgId !== orgId) return undefined;
  const actors = listHarnessActors(db, orgId).filter(
    (a) => a.id === cluster.ownerActorId || cluster.actorIds.includes(a.id),
  );
  return {
    cluster,
    actors,
    artifacts: listArtifacts(db, orgId, clusterId),
    events: listWorkEvents(db, orgId, { clusterId, limit: 40 }),
    receipts: listHarnessReceipts(db, orgId, clusterId),
  };
}

function rowToHarnessActor(r: Record<string, unknown>): Actor {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    displayName: String(r.display_name),
    department: String(r.department),
    team: String(r.team),
    role: r.role as Actor["role"],
  };
}

function rowToCluster(r: Record<string, unknown>): WorkCluster {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    department: String(r.department),
    team: String(r.team),
    title: String(r.title),
    stage: r.stage as WorkStage,
    ownerActorId: String(r.owner_actor_id),
    actorIds: parseJson<string[]>(String(r.actor_ids_json), []),
    nodeIds: parseJson<string[]>(String(r.node_ids_json ?? "[]"), []),
    frozenCommitId: r.frozen_commit_id ? String(r.frozen_commit_id) : null,
    updatedAt: String(r.updated_at),
  };
}

function rowToArtifact(r: Record<string, unknown>): Artifact {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    clusterId: r.cluster_id ? String(r.cluster_id) : null,
    kind: r.kind as Artifact["kind"],
    title: String(r.title),
    source: r.source as ActivitySource,
    ref: String(r.ref),
    createdAt: String(r.created_at),
  };
}

function rowToWorkEvent(r: Record<string, unknown>): WorkEvent {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    clusterId: r.cluster_id ? String(r.cluster_id) : null,
    actorId: String(r.actor_id),
    nodeId: r.node_id ? String(r.node_id) : null,
    source: r.source as ActivitySource,
    verb: String(r.verb),
    summary: String(r.summary),
    artifactId: r.artifact_id ? String(r.artifact_id) : null,
    occurredAt: String(r.occurred_at),
  };
}

function rowToHarnessReceipt(r: Record<string, unknown>): Receipt {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    clusterId: r.cluster_id ? String(r.cluster_id) : null,
    artifactId: r.artifact_id ? String(r.artifact_id) : null,
    actorId: String(r.actor_id),
    purpose: String(r.purpose),
    issuedAt: String(r.issued_at),
  };
}

export function upsertWorkNode(db: DatabaseSync, node: WorkNode): void {
  db.prepare(
    `INSERT INTO work_nodes (id, org_id, kind, label, department, actor_id, online, last_seen_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       label=excluded.label,
       department=excluded.department,
       online=excluded.online,
       last_seen_at=excluded.last_seen_at`,
  ).run(node.id, node.orgId, node.kind, node.label, node.department, node.actorId, node.online ? 1 : 0, node.lastSeenAt);
}

export function listWorkNodes(db: DatabaseSync, orgId: string): WorkNode[] {
  const rows = db.prepare("SELECT * FROM work_nodes WHERE org_id = ? ORDER BY department, label").all(orgId) as Record<
    string,
    unknown
  >[];
  return rows.map(rowToNode);
}

function rowToNode(r: Record<string, unknown>): WorkNode {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    kind: r.kind as WorkNode["kind"],
    label: String(r.label),
    department: String(r.department),
    actorId: String(r.actor_id),
    online: Number(r.online) === 1,
    lastSeenAt: String(r.last_seen_at),
  };
}

export function captureHarnessSlice(db: DatabaseSync, orgId: string): HarnessSlice {
  return {
    clusters: listWorkClusters(db, orgId).map((c) => ({
      id: c.id,
      title: c.title,
      stage: c.stage,
      department: c.department,
      team: c.team,
      ownerActorId: c.ownerActorId,
      actorIds: c.actorIds,
      nodeIds: c.nodeIds,
      frozenCommitId: c.frozenCommitId,
      updatedAt: c.updatedAt