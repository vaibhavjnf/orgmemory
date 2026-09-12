import { createPrivateKey, createPublicKey } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  MANAGED_ORIGINS,
  redactHint,
  type OkfpKeyPair,
  type PromptTrace,
  type SessionRecord,
  type WorkNode,
} from "@orgmemory/core";
import {
  getOrgKeys,
  insertPromptTrace,
  upsertEnablement,
  upsertRoutine,
  upsertSessionRecord,
  upsertSessionVault,
  upsertTenantIdentity,
  upsertTenantRuntime,
  upsertWorkNode,
} from "./store.js";
import { createMirror, enqueueBrowserJob, hardCommitCluster } from "../harness/fabric.js";

function keysForOrg(db: DatabaseSync, orgId: string): OkfpKeyPair {
  const row = getOrgKeys(db, orgId);
  if (!row) throw new Error(`No OKFP keys for ${orgId}`);
  return {
    keyId: row.keyId,
    publicPem: row.publicPem,
    privatePem: row.privatePem,
    publicKey: createPublicKey(row.publicPem),
    privateKey: createPrivateKey(row.privatePem),
  };
}

export function seedConcurrentFabric(db: DatabaseSync): void {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM timeline_mirrors WHERE org_id = ?").get("org_acme") as {
    n: number;
  };
  if (Number(existing.n) > 0) return;

  const now = new Date().toISOString();
  const keys = keysForOrg(db, "org_acme");

  const nodes: WorkNode[] = [
    {
      id: "node_jordan_linux",
      orgId: "org_acme",
      kind: "device",
      label: "jordan-thinkpad",
      department: "Real Estate",
      actorId: "user_jordan",
      online: true,
      lastSeenAt: now,
    },
    {
      id: "node_priya_win",
      orgId: "org_acme",
      kind: "device",
      label: "PRIYA-SURFACE",
      department: "Real Estate",
      actorId: "user_priya",
      online: true,
      lastSeenAt: now,
    },
    {
      id: "node_sam_web",
      orgId: "org_acme",
      kind: "workspace",
      label: "sam-finance-web",
      department: "Finance",
      actorId: "user_sam",
      online: true,
      lastSeenAt: now,
    },
    {
      id: "node_agent",
      orgId: "org_acme",
      kind: "agent",
      label: "Night Agent",
      department: "Operations",
      actorId: "user_agent",
      online: true,
      lastSeenAt: now,
    },
    {
      id: "node_browser_sf",
      orgId: "org_acme",
      kind: "browser",
      label: "Managed Salesforce browser",
      department: "Real Estate",
      actorId: "user_priya",
      online: false,
      lastSeenAt: now,
    },
  ];
  for (const n of nodes) upsertWorkNode(db, n);

  createMirror(db, { orgId: "org_acme", actorId: "user_priya", label: "Morning concurrent board", keys });
  createMirror(db, { orgId: "org_acme", actorId: "user_jordan", label: "Pre-commit HQ rent", keys });
  hardCommitCluster(db, {
    orgId: "org_acme",
    actorId: "user_priya",
    clusterId: "cl_rent",
    label: "Freeze HQ rent amendment (policy)",
    subgraph: "cluster",
    keys,
  });
  createMirror(db, { orgId: "org_acme", actorId: "user_priya", label: "After HQ rent freeze", keys });

  upsertSessionVault(db, {
    id: "vault_priya_win",
    orgId: "org_acme",
    deviceId: "dev_priya_win",
    actorId: "user_priya",
    allowlistedOrigins: [...MANAGED_ORIGINS],
    enrolledAt: now,
  });
  const sessions: SessionRecord[] = [
    {
      id: "sess_sf",
      vaultId: "vault_priya_win",
      origin: "https://acme.my.salesforce.com",
      tool: "salesforce",
      status: "valid",
      cookiePresent: true,
      redactedHint: redactHint("sid-enterprise-a3f2"),
      updatedAt: now,
    },
    {
      id: "sess_slack",
      vaultId: "vault_priya_win",
      origin: "https://acme.slack.com",
      tool: "slack",
      status: "valid",
      cookiePresent: true,
      redactedHint: redactHint("d-cookie-9k21"),
      updatedAt: now,
    },
  ];
  for (const s of sessions) upsertSessionRecord(db, s);

  enqueueBrowserJob(db, {
    orgId: "org_acme",
    actorId: "user_priya",
    nodeId: "node_browser_sf",
    vaultId: "vault_priya_win",
    clusterId: "cl_conti",
    origin: "https://acme.my.salesforce.com",
    intent: "Open Conti Corp opportunity on Proposal stage",
  });

  upsertTenantIdentity(db, {
    id: "tti_acme",
    orgId: "org_acme",
    provider: "composio",
    enterpriseEmail: "acme-legal@tools.orgmemory.example",
    actorId: "user_agent",
    status: "active",
  });
  for (const tool of ["slack", "salesforce", "ramp", "google_drive"]) {
    upsertEnablement(db, {
      id: `en_${tool}`,
      orgId: "org_acme",
      identityId: "tti_acme",
      tool,
      enabled: true,
      mock: true,
    });
  }

  const traces: PromptTrace[] = [
    {
      id: "pt_agent_rent",
      orgId: "org_acme",
      actorId: "user_agent",
      clusterId: "cl_rent",
      prompt: "lease rent schedule — HQ amendment at 00:30",
      tools: ["suggest", "fetch"],
      outcome: "Ranked Exhibit B; OKFP fetch sealed.",
      insight: "reuse",
      occurredAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
    },
    {
      id: "pt_jordan_board",
      orgId: "org_acme",
      actorId: "user_jordan",
      clusterId: "cl_rent",
      prompt: "What is still open on the HQ rent amendment?",
      tools: ["suggest"],
      outcome: "Cluster still active; Exhibit B is the authority.",
      insight: "reuse",
      occurredAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    },
    {
      id: "pt_priya_4419",
      orgId: "org_acme",
      actorId: "user_priya",
      clusterId: "cl_4419",
      prompt: "Why is Matter 4419 blocked?",
      tools: ["slack", "salesforce"],
      outcome: "Estoppel missing from landlord. Cluster stays blocked.",
      insight: "blocked",
      occurredAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
    },
    {
      id: "pt_sam_spend",
      orgId: "org_acme",
      actorId: "user_sam",
      clusterId: "cl_spend",
      prompt: "Q3 CAM copay vs executed rent schedule",
      tools: ["ramp", "suggest"],
      outcome: "Ramp CAM copay is intake; not an Exhibit B rewrite.",
      insight: "spend",
      occurredAt: new Date(Date.now() - 12 * 3600_000).toISOString(),
    },
  ];
  for (const t of traces) insertPromptTrace(db, t);
}

export function seedHostedRuntime(db: DatabaseSync): void {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM tenant_runtimes WHERE org_id = ?").get("org_acme") as {
    n: number;
  };
  if (Number(existing.n) > 0) return;
  upsertTenantRuntime(db, {
    id: "rt_acme",
    orgId: "org_acme",
    actorId: "user_agent",
    label: "Acme hosted Hermes",
    archetype: "hermes-hosted",
    authority: "orgmemory-infra",
    status: "idle",
    lastTickAt: null,
  });
  upsertRoutine(db, {
    id: "rtn_rent",
    orgId: "org_acme",
    runtimeId: "rt_acme",
    clusterId: "cl_rent",
    title: "Follow through HQ rent amendment",
    cadence: "follow_through",
    enabled: true,
  });
  upsertRoutine(db, {
    id: "rtn_4419",
    orgId: "org_acme",
    runtimeId: "rt_acme",
    clusterId: "cl_4419",
    title: "Chase Matter 4419 estoppel",
    cadence: "follow_through",
    enabled: true,
  });
}
