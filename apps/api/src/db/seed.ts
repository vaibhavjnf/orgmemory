import { randomUUID } from "node:crypto";
import { createPrivateKey, createPublicKey } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  chunkText,
  createEmbeddingProvider,
  generateOkfpKeys,
  parseEmbeddingKind,
  sha256Hex,
  tokenize,
  type Actor,
  type EmbeddingProvider,
  type OkfpKeyPair,
  type WorkCluster,
} from "@orgmemory/core";
import { defaultProviders, type CloudProvider } from "../connectors/index.js";
import { activityConnectors } from "../connectors/activity.js";
import { attachOverlayArtifacts, ingestActivityConnectors, seedOverlayEvents } from "../harness/ingest.js";
import { seedConcurrentFabric, seedHostedRuntime } from "./seed-fabric.js";
import {
  orgHasSeed,
  upsertSealDevice,
  insertSealEvents,
  upsertHarnessActor,
  upsertWorkCluster,
} from "./store.js";
import { resolveIntegrityTier, type SealCapabilities, type SealDevice } from "@orgmemory/seal-protocol";

export function loadOkfpKeys(db: DatabaseSync, orgId: string): OkfpKeyPair {
  const row = db.prepare("SELECT key_id, public_pem, private_pem FROM org_keys WHERE org_id = ?").get(orgId) as
    | { key_id: string; public_pem: string; private_pem: string }
    | undefined;
  if (!row) {
    throw new Error(`No OKFP keys for ${orgId}`);
  }
  return {
    keyId: row.key_id,
    publicPem: row.public_pem,
    privatePem: row.private_pem,
    publicKey: createPublicKey(row.public_pem),
    privateKey: createPrivateKey(row.private_pem),
  };
}

export async function seedIfEmpty(
  db: DatabaseSync,
  opts?: { embedding?: EmbeddingProvider; force?: boolean },
): Promise<void> {
  if (orgHasSeed(db) && !opts?.force) {
    seedSealDevices(db);
    seedHarnessIfEmpty(db);
    return;
  }
  await seedAcme(db, opts?.embedding ?? createEmbeddingProvider(parseEmbeddingKind("local-hash")));
}

export async function seedAcme(db: DatabaseSync, embedding: EmbeddingProvider): Promise<void> {
  const now = new Date().toISOString();
  db.exec("DELETE FROM runtime_ticks");
  db.exec("DELETE FROM runtime_memory");
  db.exec("DELETE FROM runtime_routines");
  db.exec("DELETE FROM tenant_runtimes");
  db.exec("DELETE FROM prompt_traces");
  db.exec("DELETE FROM connector_enablements");
  db.exec("DELETE FROM tenant_tool_identities");
  db.exec("DELETE FROM browser_jobs");
  db.exec("DELETE FROM session_records");
  db.exec("DELETE FROM session_vaults");
  db.exec("DELETE FROM hard_commits");
  db.exec("DELETE FROM timeline_mirrors");
  db.exec("DELETE FROM work_nodes");
  db.exec("DELETE FROM seal_events");
  db.exec("DELETE FROM seal_devices");
  db.exec("DELETE FROM harness_receipts");
  db.exec("DELETE FROM work_events");
  db.exec("DELETE FROM artifacts");
  db.exec("DELETE FROM work_clusters");
  db.exec("DELETE FROM harness_actors");
  db.exec("DELETE FROM skill_edges");
  db.exec("DELETE FROM skill_nodes");
  db.exec("DELETE FROM receipts");
  db.exec("DELETE FROM suggestions");
  db.exec("DELETE FROM suggestion_batches");
  db.exec("DELETE FROM audit_events");
  db.exec("DELETE FROM chunks");
  db.exec("DELETE FROM source_files");
  db.exec("DELETE FROM matter_grants");
  db.exec("DELETE FROM project_members");
  db.exec("DELETE FROM connectors");
  db.exec("DELETE FROM projects");
  db.exec("DELETE FROM users");
  db.exec("DELETE FROM org_keys");
  db.exec("DELETE FROM orgs");

  db.prepare("INSERT INTO orgs (id, name, slug, created_at) VALUES (?,?,?,?)").run(
    "org_acme",
    "Acme Legal",
    "acme-legal",
    now,
  );

  const keys = generateOkfpKeys("okfp_acme_legal");
  db.prepare("INSERT INTO org_keys (org_id, key_id, public_pem, private_pem) VALUES (?,?,?,?)").run(
    "org_acme",
    keys.keyId,
    keys.publicPem,
    keys.privatePem,
  );

  const users = [
    ["user_priya", "priya.shah@acme.legal", "Priya Shah", "manager", "om_demo_priya", null],
    ["user_jordan", "jordan.hale@acme.legal", "Jordan Hale", "employee", "om_demo_jordan", null],
    ["user_sam", "sam.ortiz@acme.legal", "Sam Ortiz", "employee", "om_demo_sam", null],
    ["user_agent", "agent@acme.legal", "OrgMemory Night Agent", "agent", "om_demo_acme_legal", "user_agent"],
  ] as const;
  const insUser = db.prepare(
    "INSERT INTO users (id, org_id, email, display_name, role, api_key, agent_id) VALUES (?,?,?,?,?,?,?)",
  );
  for (const u of users) {
    insUser.run(u[0], "org_acme", u[1], u[2], u[3], u[4], u[5]);
  }

  const projects = [
    ["proj_re", "HQ Real Estate", "hq-real-estate", "Executed leases and amendments for Acme space."],
    ["proj_client", "Client Matters", "client-matters", "Active client files, including matter-walled work."],
    ["proj_kb", "Knowledge Base", "knowledge-base", "Handbooks, MSAs, templates."],
  ] as const;
  const insProj = db.prepare(
    "INSERT INTO projects (id, org_id, name, slug, description) VALUES (?,?,?,?,?)",
  );
  for (const p of projects) insProj.run(p[0], "org_acme", p[1], p[2], p[3]);

  const members: Array<[string, string, string]> = [
    ["proj_re", "user_priya", "lead"],
    ["proj_re", "user_jordan", "member"],
    ["proj_re", "user_agent", "member"],
    ["proj_client", "user_priya", "lead"],
    ["proj_client", "user_jordan", "member"],
    ["proj_client", "user_agent", "member"],
    ["proj_kb", "user_priya", "lead"],
    ["proj_kb", "user_sam", "member"],
    ["proj_kb", "user_jordan", "member"],
    ["proj_kb", "user_agent", "member"],
  ];
  const insMem = db.prepare("INSERT INTO project_members (project_id, user_id, role) VALUES (?,?,?)");
  for (const m of members) insMem.run(m[0], m[1], m[2]);

  const grants: Array<[string, string]> = [
    ["user_priya", "matter_hq"],
    ["user_priya", "matter_wh12"],
    ["user_priya", "matter_4419"],
    ["user_jordan", "matter_hq"],
    ["user_jordan", "matter_wh12"],
    ["user_jordan", "matter_4419"],
    ["user_agent", "matter_hq"],
    ["user_agent", "matter_wh12"],
    ["user_agent", "matter_4419"],
    // Sam has no leasing matters — matter wall demo
  ];
  const insGrant = db.prepare("INSERT INTO matter_grants (user_id, matter_id) VALUES (?,?)");
  for (const g of grants) insGrant.run(g[0], g[1]);

  const providers = defaultProviders();
  const insConn = db.prepare(
    "INSERT INTO connectors (id, org_id, kind, display_name, status, last_sync_at, last_error) VALUES (?,?,?,?,?,?,?)",
  );
  const connIds: Record<string, string> = {
    google_drive: "conn_gdrive",
    onedrive: "conn_onedrive",
    dropbox: "conn_dropbox",
    linux_fs: "conn_linux",
  };
  for (const p of providers) {
    const cid = connIds[p.kind];
    if (!cid) continue;
    insConn.run(cid, "org_acme", p.kind, p.displayName, p.status, now, null);
  }
  seedActivityConnectors(db, now);

  await indexProviders(db, providers, embedding, connIds);

  const nodes = [
    ["skill_leasing", null, "domain", "Commercial Leasing", "Institutional leasing craft at Acme Legal."],
    ["skill_rent", "skill_leasing", "matter", "Rent schedules", "Executed rent curves, escalations, abatement."],
    ["skill_abstract", "skill_leasing", "matter", "Lease abstracts", "Payment-term abstracts for client matters."],
    ["skill_hr", null, "domain", "People ops", "Handbook and internal policy. Not real estate authority."],
  ] as const;
  const insNode = db.prepare(
    "INSERT INTO skill_nodes (id, org_id, name, parent_id, kind, description) VALUES (?,?,?,?,?,?)",
  );
  for (const n of nodes) insNode.run(n[0], "org_acme", n[3], n[1], n[2], n[4]);

  const hq = db.prepare("SELECT id FROM source_files WHERE external_id = ?").get("gdrive:hq-exhibit-b") as { id: string };
  const abs = db.prepare("SELECT id FROM source_files WHERE external_id = ?").get("gdrive:4419-abstract") as { id: string };
  const insEdge = db.prepare(
    "INSERT INTO skill_edges (id, org_id, from_node_id, to_node_id, file_id, producer_id, reuse_count) VALUES (?,?,?,?,?,?,?)",
  );
  insEdge.run("edge_rent_reuse", "org_acme", "skill_rent", "skill_rent", hq.id, "user_priya", 3);
  insEdge.run("edge_abstract_reuse", "org_acme", "skill_abstract", "skill_rent", abs.id, "user_priya", 1);

  // Seed prior official fetches so "top reused" and reuse ranking have signal.
  const insAudit = db.prepare(
    `INSERT INTO audit_events (
      id, org_id, actor_id, agent_id, action, purpose, matter_id, ticket_id, file_id,
      suggestion_id, query, acl_snapshot_json, content_hash, receipt_id, decision, metadata_json, created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (let i = 0; i < 3; i++) {
    insAudit.run(
      `aud_seed_hq_${i}`,
      "org_acme",
      "user_jordan",
      null,
      "fetch",
      "Drafting a rent amendment; need executed Exhibit B.",
      "matter_hq",
      null,
      hq.id,
      null,
      null,
      JSON.stringify({ ownerId: "user_priya", sharedWith: ["user_jordan", "user_agent"] }),
      sha256Hex("seed"),
      null,
      "allow",
      JSON.stringify({ seed: "true" }),
      new Date(Date.now() - (i + 1) * 86400000).toISOString(),
    );
  }
  seedSealDevices(db);
  seedHarnessIfEmpty(db, true);
}

export async function indexProviders(
  db: DatabaseSync,
  providers: CloudProvider[],
  embedding: EmbeddingProvider,
  connIds: Record<string, string>,
): Promise<void> {
  const now = new Date().toISOString();
  const insFile = db.prepare(
    `INSERT INTO source_files (
      id, org_id, connector_id, project_id, external_id, name, mime_type, path,
      owner_id, shared_with_json, content, content_hash, metadata_json, author_role,
      matter_id, created_at, modified_at, indexed_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const delChunks = db.prepare("DELETE FROM chunks WHERE file_id = ?");
  const insChunk = db.prepare(
    "INSERT INTO chunks (id, file_id, org_id, ordinal, text, embedding_json, token_count) VALUES (?,?,?,?,?,?,?)",
  );

  for (const p of providers) {
    const connectorId = connIds[p.kind];
    if (!connectorId) continue;
    for (const f of p.list()) {
      const id = `file_${f.externalId.replace(/[^a-z0-9]+/gi, "_")}`;
      const hash = sha256Hex(f.content);
      insFile.run(
        id,
        "org_acme",
        connectorId,
        f.projectId,
        f.externalId,
        f.name,
        f.mimeType,
        f.path,
        f.ownerId,
        JSON.stringify(f.sharedWith),
        f.content,
        hash,
        JSON.stringify(f.metadata),
        f.authorRole,
        f.matterId,
        f.createdAt,
        f.modifiedAt,
        now,
      );
      const parts = chunkText(f.content);
      const vectors = await embedding.embed(parts);
      delChunks.run(id);
      parts.forEach((text, i) => {
        insChunk.run(
          randomUUID(),
          id,
          "org_acme",
          i,
          text,
          JSON.stringify(vectors[i] ?? []),
          tokenize(text).length,
        );
      });
    }
    db.prepare("UPDATE connectors SET last_sync_at = ?, status = ? WHERE id = ?").run(now, p.status, connectorId);
  }
}

export function seedActivityConnectors(db: DatabaseSync, now = new Date().toISOString()): void {
  const ins = db.prepare(
    `INSERT INTO connectors (id, org_id, kind, display_name, status, last_sync_at, last_error)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, status=excluded.status`,
  );
  const rows: Array<[string, string, string, string]> = [
    ["conn_slack", "slack", "Slack (stub)", "stub"],
    ["conn_salesforce", "salesforce", "Salesforce (stub)", "stub"],
    ["conn_ramp", "ramp", "Ramp (stub)", "stub"],
    ["conn_composio", "composio", "Composio (tenant identity)", "stub"],
  ];
  for (const [id, kind, name, status] of rows) {
    ins.run(id, "org_acme", kind, name, status, now, null);
  }
}

export function seedHarnessIfEmpty(db: DatabaseSync, force = false): void {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM work_clusters WHERE org_id = ?").get("org_acme") as {
    n: number;
  };
  if (Number(existing.n) > 0 && !force) {
    seedActivityConnectors(db);
    seedConcurrentFabric(db);
    seedHostedRuntime(db);
    return;
  }
  const now = new Date().toISOString();
  seedActivityConnectors(db, now);

  const actors: Actor[] = [
    {
      id: "user_priya",
      orgId: "org_acme",
      displayName: "Priya Shah",
      department: "Real Estate",
      team: "Partners",
      role: "manager",
    },
    {
      id: "user_jordan",
      orgId: "org_acme",
      displayName: "Jordan Hale",
      department: "Real Estate",
      team: "Associates",
      role: "employee",
    },
    {
      id: "user_sam",
      orgId: "org_acme",
      displayName: "Sam Ortiz",
      department: "Finance",
      team: "People Ops",
      role: "employee",
    },
    {
      id: "user_agent",
      orgId: "org_acme",
      displayName: "Night Agent",
      department: "Operations",
      team: "Agents",
      role: "agent",
    },
  ];
  for (const a of actors) upsertHarnessActor(db, a);

  const clusters: WorkCluster[] = [
    {
      id: "cl_rent",
      orgId: "org_acme",
      department: "Real Estate",
      team: "Associates",
      title: "HQ rent amendment",
      stage: "active",
      ownerActorId: "user_jordan",
      actorIds: ["user_jordan", "user_priya", "user_agent"],
      nodeIds: ["node_jordan_linux", "node_agent"],
      frozenCommitId: null,
      updatedAt: now,
    },
    {
      id: "cl_4419",
      orgId: "org_acme",
      department: "Real Estate",
      team: "Partners",
      title: "Matter 4419 estoppel",
      stage: "blocked",
      ownerActorId: "user_priya",
      actorIds: ["user_priya", "user_jordan", "user_sam"],
      nodeIds: ["node_priya_win", "node_jordan_linux"],
      frozenCommitId: null,
      updatedAt: now,
    },
    {
      id: "cl_spend",
      orgId: "org_acme",
      department: "Finance",
      team: "People Ops",
      title: "Q3 office spend",
      stage: "intake",
      ownerActorId: "user_sam",
      actorIds: ["user_sam", "user_priya"],
      nodeIds: ["node_sam_web"],
      frozenCommitId: null,
      updatedAt: now,
    },
    {
      id: "cl_conti",
      orgId: "org_acme",
      department: "Real Estate",
      team: "Partners",
      title: "Conti Corp retainer",
      stage: "active",
      ownerActorId: "user_priya",
      actorIds: ["user_priya", "user_jordan"],
      nodeIds: ["node_priya_win", "node_browser_sf"],
      frozenCommitId: null,
      updatedAt: now,
    },
  ];
  for (const c of clusters) upsertWorkCluster(db, c);

  attachOverlayArtifacts(db, "org_acme");
  ingestActivityConnectors(db, "org_acme");
  seedOverlayEvents(db, "org_acme");

  for (const connector of activityConnectors()) {
    db.prepare("UPDATE connectors SET last_sync_at = ?, status = ? WHERE kind = ? AND org_id = ?").run(
      now,
      "stub",
      connector.kind,
      "org_acme",
    );
  }
  seedConcurrentFabric(db);
  seedHostedRuntime(db);
}

export function seedSealDevices(db: DatabaseSync): void {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM seal_devices WHERE org_id = ?").get("org_acme") as { n: number };
  if (Number(existing.n) > 0) return;
  const now = new Date().toISOString();

  const linuxCaps: SealCapabilities = {
    os: "linux",
    admin: true,
    usnJournal: false,
    fanotify: true,
    esf: false,
    volumeEncryption: false,
    signedBinaryAttest: false,
  };
  const winCaps: SealCapabilities = {
    os: "windows",
    admin: false,
    usnJournal: false,
    fanotify: false,
    esf: false,
    volumeEncryption: true,
    signedBinaryAttest: false,
  };
  const macCaps: SealCapabilities = {
    os: "darwin",
    admin: false,
    usnJournal: false,
    fanotify: false,
    esf: false,
    volumeEncryption: true,
    signedBinaryAttest: false,
  };

  const devices: SealDevice[] = [
    deviceFromCaps("dev_jordan_linux", "jordan-thinkpad", "jordan", "user_jordan", ["/srv/matters"], linuxCaps, now),
    deviceFromCaps(
      "dev_priya_win",
      "PRIYA-SURFACE",
      "acme\\priya",
      "user_priya",
      ["C:\\Users\\Priya\\Work\\Acme"],
      winCaps,
      now,
    ),
    deviceFromCaps(
      "dev_jordan_mac",
      "Jordan’s MacBook Pro",
      "jordan",
      "user_jordan",
      ["/Users/jordan/Work/acme-legal"],
      macCaps,
      now,
    ),
  ];
  for (const d of devices) upsertSealDevice(db, d);

  insertSealEvents(db, "org_acme", [
    {
      id: "sevt_seed_linux_hb",
      deviceId: "dev_jordan_linux",
      kind: "heartbeat",
      path: "",
      destPath: null,
      contentHash: null,
      mtime: now,
      osUser: "jordan",
      integrityTier: "T2",
      placeholder: null,
      allowlisted: true,
      occurredAt: now,
    },
    {
      id: "sevt_seed_win_mod",
      deviceId: "dev_priya_win",
      kind: "modified",
      path: "C:\\Users\\Priya\\Work\\Acme\\Leases\\exhibit-b.pdf",
      destPath: null,
      contentHash: "sha256:seed",
      mtime: now,
      osUser: "acme\\priya",
      integrityTier: "T1",
      placeholder: null,
      allowlisted: true,
      occurredAt: now,
    },
    {
      id: "sevt_seed_mac_icloud",
      deviceId: "dev_jordan_mac",
      kind: "created",
      path: "/Users/jordan/Work/acme-legal/drafts/notes.md.icloud",
      destPath: null,
      contentHash: null,
      mtime: now,
      osUser: "jordan",
      integrityTier: "T1",
      placeholder: "icloud",
      allowlisted: true,
      occurredAt: now,
    },
  ]);
}

function deviceFromCaps(
  id: string,
  hostname: string,
  osUser: string,
  ownerUserId: string,
  allowlist: string[],
  capabilities: SealCapabilities,
  now: string,
): SealDevice {
  const resolved = resolveIntegrityTier(capabilities);
  return {
    id,
    orgId: "org_acme",
    hostname,
    os: capabilities.os,
    osUser,
    ownerUserId,
    integrityTier: resolved.tier,
    claimedTier: "T3",
    degradeReason: resolved.tier === "T3" ? null : resolved.reason,
    allowlist,
    capabilities,
    lastHeartbeatAt: now,
    enrolledAt: now,
  };
}

export { defaultProviders };

const startedAsSeed =
  process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (startedAsSeed) {
  const { loadEnv } = await import("../env.js");
  const { openDb } = await import("./store.js");
  const env = loadEnv();
  const db = openDb(env.dbPath);
  await seedAcme(db, createEmbeddingProvider(parseEmbeddingKind(env.embeddingProvider)));
  console.log(`Seeded Acme Legal into ${env.dbPath}`);
}
