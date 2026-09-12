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
