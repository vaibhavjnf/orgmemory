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
    agentId: r.agent_id ? String(r.a