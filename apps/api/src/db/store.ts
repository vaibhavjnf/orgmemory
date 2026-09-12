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
