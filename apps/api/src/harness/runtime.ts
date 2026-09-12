import { randomUUID } from "node:crypto";
import { createPrivateKey, createPublicKey } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { LoopTick, OkfpKeyPair, User, WorkStage } from "@orgmemory/core";
import { runTenantLoop, type HostedInfraPorts } from "@orgmemory/harness-runtime";
import {
  getFile,
  getOrgKeys,
  getTenantRuntime,
  insertPromptTrace,
  insertRuntimeTick,
  insertWorkEvent,
  listRoutines,
  listWorkClusters,
  runtimeStatus,
  upsertMemorySlot,
} from "../db/store.js";
import { recordHarnessFetch, recordHarnessSuggest } from "./ingest.js";
import { createMirror, enqueueBrowserJob, invokeComposioMock } from "./fabric.js";

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

function hostedPorts(
  db: DatabaseSync,
  args: { orgId: string; actorId: string; runtimeId: string; keysReady: boolean },
): HostedInfraPorts {
  return {
    async suggest({ query, context, clusterId }) {
      const ev = recordHarnessSuggest(db, {
        orgId: args.orgId,
        actorId: args.actorId,
        query,
        context,
        hitCount: 1,
        clusterId,
      });
      return { summary: ev?.summary ?? `suggested ${query}` };
    },
    async fetch({ purpose, clusterId }) {
      const file = getFile(db, "file_gdrive_hq_exhibit_b");
      if (!file) return { summary: "no overlay file to fetch" };
      const ev = recordHarnessFetch(db, {
        orgId: args.orgId,
        actorId: args.actorId,
        file,
        purpose,
        receiptId: `rtfetch_${randomUUID().slice(0, 8)}`,
        clusterId,
      });
      return { summary: ev.summary };
    },
    async composio({ tool, action, clusterId }) {
      const r = invokeComposioMock(db, {
        orgId: args.orgId,
        actorId: args.actorId,
        tool,
        action,
        clusterId,
      });
      return { summary: r.result };
    },
    async browser({ intent, clusterId }) {
      const job = enqueueBrowserJob(db, {
        orgId: args.orgId,
        actorId: args.actorId,
        nodeId: "node_browser_sf",
        vaultId: "vault_priya_win",
        clusterId,
        origin: "https://acme.my.salesforce.com",
        intent,
      });
      return { summary: `browser job ${job.id} (${job.status})` };
    },
    async mirror({ label }) {
      if (!args.keysReady) return { summary: "mirror skipped (no keys)" };
      const keys = keysForOrg(db, args.orgId);
      const mirror = createMirror(db, { orgId: args.orgId, actorId: args.actorId, label, keys });
      return { summary: `mirror ${mirror.id}` };
    },
    async promptTrace({ prompt, tools, outcome, insight, clusterId }) {
      insertPromptTrace(db, {
        id: `pt_rt_${randomUUID().slice(0, 8)}`,
        orgId: args.orgId,
        actorId: args.actorId,
        clusterId,
        prompt,
        tools,
        outcome,
        insight,
        occurredAt: new Date().toISOString(),
      });
      return { summary: `traced ${insight}` };
    },
    async remember({ key, value }) {
      upsertMemorySlot(db, {
        id: `mem_${args.runtimeId}_${key.replace(/[^a-z0-9]+/gi, "_")}`,
        orgId: args.orgId,
        runtimeId: args.runtimeId,
        key,
        value,
        updatedAt: new Date().toISOString(),
      });
      return { summary: `remembered ${key}` };
    },
  };
}

export async function runHostedTick(
  db: DatabaseSync,
  args: { user: User; clusterId?: string; routineId?: string },
): Promise<LoopTick> {
  const runtime = getTenantRuntime(db, args.user.orgId);
  if (!runtime) throw new Error("No hosted Hermes runtime enrolled for this tenant.");
  const routines = listRoutines(db, args.user.orgId).filter((r) => r.enabled);
  const routine =
    routines.find((r) => r.id === args.routineId) ??
    routines.find((r) => r.clusterId === args.clusterId) ??
    routines[0];
  if (!routine) throw new Error("No follow-through routine enabled.");
  const cluster = listWorkClusters(db, args.user.orgId).find((c) => c.id === routine.clusterId);
  if (!cluster) throw new Error("Routine cluster missing from harness store.");

  const startedAt = new Date().toISOString();
  const ports = hostedPorts(db, {
    orgId: args.user.orgId,
    actorId: args.user.id,
    runtimeId: runtime.id,
    keysReady: true,
  });
  const query =
    cluster.id === "cl_rent"
      ? "lease rent schedule"
      : cluster.id === "cl_4419"
        ? "Why is Matter 4419 blocked?"
        : cluster.title;
  const result = await runTenantLoop(ports, {
    orgId: args.user.orgId,
    runtimeId: runtime.id,
    routineId: routine.id,
    clusterId: cluster.id,
    clusterTitle: cluster.title,
    stage: cluster.stage as WorkStage,
    query,
  });
  const finishedAt = new Date().toISOString();
  const tick: LoopTick = {
    id: `tick_${randomUUID().slice(0, 8)}`,
    orgId: args.user.orgId,
    runtimeId: runtime.id,
    routineId: routine.id,
    clusterId: cluster.id,
    steps: result.steps,
    startedAt,
    finishedAt,
  };
  insertRuntimeTick(db, tick);
  insertWorkEvent(db, {
    id: `wevt_runtime_${tick.id}`,
    orgId: args.user.orgId,
    clusterId: cluster.id,
    actorId: args.user.id,
    nodeId: "node_agent",
    source: "runtime",
    verb: "ticked",
    summary: `Hosted Hermes loop on ${cluster.title}: ${result.tools.join(" → ")}`,
    artifactId: null,
    occurredAt: finishedAt,
  });
  return tick;
}

export function hostedRuntimeView(db: DatabaseSync, orgId: string) {
  return {
    archetype: "hermes-hosted" as const,
    authority: "orgmemory-infra" as const,
    satellites: ["seal-linux", "seal-windows", "seal-darwin", "browser-pool"] as const,
    driver: "Hosted Hermes loop writes WorkEvents; the dashboard is a projection.",
    ...runtimeStatus(db, orgId),
  };
}
