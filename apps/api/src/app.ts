import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { createPublicKey } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  canReadFile,
  createEmbeddingProvider,
  embedLocal,
  isManagedOrigin,
  newReceiptId,
  OKFP_VERSION,
  parseEmbeddingKind,
  pickSnippet,
  redactHint,
  sessionPayloadForbidden,
  signReceiptBody,
  verifyReceipt,
  weigh,
  type OkfpReceipt,
  type Suggestion,
} from "@orgmemory/core";
import { checkLicense, featureEnabled, type LicenseCheck } from "@orgmemory/license";
import { evaluateFetch, isAfterHours } from "@orgmemory/policy";
import { resolveIntegrityTier, validateIngestBatch, type SealCapabilities } from "@orgmemory/seal-protocol";
import { describeBusHop } from "@orgmemory/harness";
import { authenticate, HttpError, sendError } from "./auth.js";
import {
  bumpSkillReuse,
  getFile,
  getOrgKeys,
  getReceipt,
  getSuggestion,
  insertAudit,
  listAudit,
  listChunks,
  listConnectors,
  listFiles,
  listSkillGraph,
  listUsers,
  matterIdsFor,
  memberProjectIds,
  saveReceipt,
  saveSuggestionBatch,
  topReused,
  getSealDevice,
  listSealDevices,
  upsertSealDevice,
  insertSealEvents,
  touchSealHeartbeat,
  listOwnerBoard,
  getClusterBriefing,
  listTimelineMirrors,
  listHardCommits,
  listWorkClusters,
  listSessionVaults,
  getSessionVault,
  upsertSessionVault,
  upsertSessionRecord,
  listSessionRecords,
  listBrowserJobs,
  listTenantIdentities,
  listEnablements,
  listPromptTraces,
  insertPromptTrace,
  insightRollup,
  upsertWorkCluster,
} from "./db/store.js";
import { loadOkfpKeys } from "./db/seed.js";
import { ingestActivityConnectors, recordHarnessFetch, recordHarnessSuggest } from "./harness/ingest.js";
import { createMirror, enqueueBrowserJob, hardCommitCluster, invokeComposioMock, rollbackMirror } from "./harness/fabric.js";
import { hostedRuntimeView, runHostedTick } from "./harness/runtime.js";
import type { OrgMemoryEnv } from "./env.js";

const suggestBody = z.object({
  query: z.string().min(1),
  context: z.string().optional(),
  projectId: z.string().optional(),
  clusterId: z.string().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

const fetchBody = z.object({
  fileId: z.string().min(1),
  purpose: z.string().min(3),
  matterId: z.string().optional(),
  ticketId: z.string().optional(),
  suggestionId: z.string().optional(),
  clusterId: z.string().optional(),
  includeContent: z.boolean().optional(),
});

const verifyBody = z.object({
  id: z.string().optional(),
  receipt: z.record(z.string(), z.unknown()).optional(),
});

const enrollBody = z.object({
  id: z.string().min(1),
  hostname: z.string().min(1),
  os: z.enum(["linux", "windows", "darwin"]),
  osUser: z.string().min(1),
  ownerUserId: z.string().optional(),
  allowlist: z.array(z.string()).min(1),
  capabilities: z.object({
    os: z.enum(["linux", "windows", "darwin"]),
    admin: z.boolean(),
    usnJournal: z.boolean(),
    fanotify: z.boolean(),
    esf: z.boolean(),
    volumeEncryption: z.boolean(),
    signedBinaryAttest: z.boolean(),
  }),
});

const ingestBody = z.object({
  deviceId: z.string().min(1),
  events: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
});

export interface AppContext {
  db: DatabaseSync;
  env: OrgMemoryEnv;
  license: LicenseCheck;
}

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  const { db, env, license } = ctx;

  const requireFeature = (feature: "suggest" | "receipts" | "atlas") => {
    if (!featureEnabled(license, feature)) {
      throw new HttpError(402, `OrgMemory License does not include this layer (${feature}).`, {
        layer: feature,
      });
    }
  };

  app.get("/v1/health", async () => {
    const connectors = listConnectors(db, "org_acme");
    const board = listOwnerBoard(db, "org_acme");
    return {
      ok: true,
      service: "orgmemory-api",
      product: "OrgMemory",
      identity: "harness",
      tagline: "Official memory for agentic teams",
      layers: {
        suggest: "OrgMemory Suggest",
        atlas: "OrgMemory Atlas",
        seal: "OrgMemory Seal",
        license: "OrgMemory License",
      },
      db: "ok",
      embedding: env.embeddingProvider,
      license: license.ok
        ? { mode: license.claims.mode, source: license.source, features: license.claims.features }
        : { ok: false, reason: license.reason },
      connectors: connectors.map((c) => ({
        id: c.id,
        kind: c.kind,
        status: c.status,
        fileCount: c.fileCount,
        lastSyncAt: c.lastSyncAt,
      })),
      harness: {
        bus: describeBusHop("slack"),
        clusters: board.clusterCount,
        events: board.eventCount,
        nodes: board.nodes.length,
        sources: board.sources,
      },
      runtime: (() => {
        const view = hostedRuntimeView(db, "org_acme");
        return {
          archetype: view.archetype,
          authority: view.authority,
          id: view.runtime?.id ?? null,
          status: view.runtime?.status ?? "absent",
          lastTickAt: view.runtime?.lastTickAt ?? null,
          routines: view.routines.length,
        };
      })(),
      seal: {
        platforms: ["linux", "windows", "darwin"],
        devices: listSealDevices(db, "org_acme").map((d) => ({
          id: d.id,
          os: d.os,
          integrityTier: d.integrityTier,
        })),
      },
    };
  });

  app.get("/v1/license", async (req, reply) => {
    try {
      await authenticate(db, req);
      return {
        check: license.ok
          ? { ok: true, mode: license.claims.mode, features: license.claims.features, source: license.source }
          : { ok: false, reason: license.reason },
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/me", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      return {
        user,
        org: { id: "org_acme", name: "Acme Legal" },
        projects: memberProjectIds(db, user.id),
        matters: matterIdsFor(db, user.id),
        colleagues: listUsers(db, user.orgId).map((u) => ({
          id: u.id,
          displayName: u.displayName,
          role: u.role,
        })),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/connectors", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      return { connectors: listConnectors(db, user.orgId) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/harness", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      return listOwnerBoard(db, user.orgId);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/harness/clusters/:id", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const { id } = req.params as { id: string };
      const briefing = getClusterBriefing(db, user.orgId, id);
      if (!briefing) throw new HttpError(404, "Unknown work cluster.");
      return briefing;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/harness/sync", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const ingested = ingestActivityConnectors(db, user.orgId);
      return { ingested, board: listOwnerBoard(db, user.orgId) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/mirrors", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      return { mirrors: listTimelineMirrors(db, user.orgId) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/mirrors", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const body = z.object({ label: z.string().min(1) }).parse(req.body ?? {});
      const keys = loadOkfpKeys(db, user.orgId);
      const mirror = createMirror(db, { orgId: user.orgId, actorId: user.id, label: body.label, keys });
      return { mirror };
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ error: "label required", details: err.issues });
      return sendError(reply, err);
    }
  });

  app.post("/v1/mirrors/:id/rollback", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const { id } = req.params as { id: string };
      const keys = loadOkfpKeys(db, user.orgId);
      const result = rollbackMirror(db, { orgId: user.orgId, actor: user, mirrorId: id, keys });
      const audit = insertAudit(db, {
        id: `aud_${randomUUID()}`,
        orgId: user.orgId,
        actorId: user.id,
        agentId: user.agentId,
        action: "mirror_rollback",
        purpose: result.receipt.purpose,
        matterId: null,
        ticketId: null,
        fileId: id,
        suggestionId: null,
        query: null,
        aclSnapshot: null,
        contentHash: result.mirror.sliceHash,
        receiptId: result.receipt.id,
        decision: "allow",
        metadata: { mirrorId: id },
      });
      return { ...result, auditId: audit.id };
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unknown")) {
        return reply.status(404).send({ error: err.message });
      }
      return sendError(reply, err);
    }
  });

  app.get("/v1/commits", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      return { commits: listHardCommits(db, user.orgId) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/commits", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const body = z
        .object({
          clusterId: z.string().min(1),
          label: z.string().min(1),
          subgraph: z.enum(["matter", "cluster", "policy", "org"]).optional(),
        })
        .parse(req.body ?? {});
      const keys = loadOkfpKeys(db, user.orgId);
      const commit = hardCommitCluster(db, {
        orgId: user.orgId,
        actorId: user.id,
        clusterId: body.clusterId,
        label: body.label,
        subgraph: body.subgraph ?? "cluster",
        keys,
      });
      const audit = insertAudit(db, {
        id: `aud_${randomUUID()}`,
        orgId: user.orgId,
        actorId: user.id,
        agentId: user.agentId,
        action: "hard_commit",
        purpose: body.label,
        matterId: null,
        ticketId: null,
        fileId: body.clusterId,
        suggestionId: null,
        query: null,
        aclSnapshot: null,
        contentHash: commit.sliceHash,
        receiptId: commit.id,
        decision: "allow",
        metadata: { subgraph: commit.subgraph },
      });
      return { commit, auditId: audit.id };
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ error: "Invalid commit payload", details: err.issues });
      if (err instanceof Error && err.message.includes("Unknown")) {
        return reply.status(404).send({ error: err.message });
      }
      return sendError(reply, err);
    }
  });

  app.post("/v1/clusters/:id/stage", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const { id } = req.params as { id: string };
      const body = z
        .object({ stage: z.enum(["intake", "active", "blocked", "review", "sealed"]) })
        .parse(req.body ?? {});
      const cluster = listWorkClusters(db, user.orgId).find((c) => c.id === id);
      if (!cluster) throw new HttpError(404, "Unknown cluster.");
      upsertWorkCluster(db, { ...cluster, stage: body.stage, updatedAt: new Date().toISOString() });
      return { cluster: { ...cluster, stage: body.stage } };
    } catch (err) {
      if (err instanceof Error && err.message.includes("frozen")) {
        return reply.status(409).send({ error: err.message });
      }
      if (err instanceof z.ZodError) return reply.status(400).send({ error: "Invalid stage", details: err.issues });
      return sendError(reply, err);
    }
  });

  app.get("/v1/vaults", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const vaults = listSessionVaults(db, user.orgId).map((v) => ({
        ...v,
        sessions: listSessionRecords(db, v.id),
      }));
      return { vaults, ethics: "Enterprise-managed origins on enrolled devices only. No personal-profile scrape. No raw cookies." };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/vaults", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const body = z
        .object({
          id: z.string().min(1),
          deviceId: z.string().min(1),
          origins: z.array(z.string().url()).min(1),
        })
        .parse(req.body ?? {});
      const bad = body.origins.filter((o) => !isManagedOrigin(o));
      if (bad.length) {
        throw new HttpError(400, `Origins not on the enterprise allowlist: ${bad.join(", ")}`);
      }
      const vault = {
        id: body.id,
        orgId: user.orgId,
        deviceId: body.deviceId,
        actorId: user.id,
        allowlistedOrigins: body.origins,
        enrolledAt: new Date().toISOString(),
      };
      upsertSessionVault(db, vault);
      insertAudit(db, {
        id: `aud_${randomUUID()}`,
        orgId: user.orgId,
        actorId: user.id,
        agentId: user.agentId,
        action: "vault_enroll",
        purpose: "managed session vault",
        matterId: null,
        ticketId: null,
        fileId: null,
        suggestionId: null,
        query: null,
        aclSnapshot: null,
        contentHash: null,
        receiptId: null,
        decision: "allow",
        metadata: { vaultId: vault.id, deviceId: vault.deviceId },
      });
      return { vault };
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ error: "Invalid vault enroll", details: err.issues });
      return sendError(reply, err);
    }
  });

  app.post("/v1/vaults/:id/sessions", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const { id } = req.params as { id: string };
      const vault = getSessionVault(db, id);
      if (!vault || vault.orgId !== user.orgId) throw new HttpError(404, "Unknown vault.");
      const raw = (req.body ?? {}) as Record<string, unknown>;
      const forbidden = sessionPayloadForbidden(raw);
      if (forbidden) throw new HttpError(400, forbidden);
      const body = z
        .object({
          origin: z.string().url(),
          tool: z.string().min(1),
          status: z.enum(["valid", "expired", "revoked"]).optional(),
          hint: z.string().optional(),
        })
        .parse(raw);
      if (!vault.allowlistedOrigins.includes(body.origin) || !isManagedOrigin(body.origin)) {
        throw new HttpError(400, "Origin is not allowlisted on this enrolled vault.");
      }
      const rec = {
        id: `sess_${randomUUID().slice(0, 8)}`,
        vaultId: vault.id,
        origin: body.origin,
        tool: body.tool,
        status: body.status ?? "valid",
        cookiePresent: true,
        redactedHint: redactHint(body.hint ?? body.tool),
        updatedAt: new Date().toISOString(),
      };
      upsertSessionRecord(db, rec);
      return { session: rec };
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ error: "Invalid session metadata", details: err.issues });
      return sendError(reply, err);
    }
  });

  app.get("/v1/browser/jobs", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      return { jobs: listBrowserJobs(db, user.orgId) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/browser/jobs", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const body = z
        .object({
          origin: z.string().url(),
          intent: z.string().min(3),
          nodeId: z.string().min(1),
          vaultId: z.string().optional(),
          clusterId: z.string().optional(),
        })
        .parse(req.body ?? {});
      const job = enqueueBrowserJob(db, {
        orgId: user.orgId,
        actorId: user.id,
        nodeId: body.nodeId,
        vaultId: body.vaultId ?? null,
        clusterId: body.clusterId ?? null,
        origin: body.origin,
        intent: body.intent,
      });
      insertAudit(db, {
        id: `aud_${randomUUID()}`,
        orgId: user.orgId,
        actorId: user.id,
        agentId: user.agentId,
        action: "browser_job",
        purpose: body.intent,
        matterId: null,
        ticketId: null,
        fileId: null,
        suggestionId: null,
        query: null,
        aclSnapshot: null,
        contentHash: null,
        receiptId: null,
        decision: "allow",
        metadata: { jobId: job.id, origin: job.origin },
      });
      return { job };
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ error: "Invalid browser job", details: err.issues });
      if (err instanceof Error && err.message.includes("managed origins")) {
        return reply.status(400).send({ error: err.message });
      }
      return sendError(reply, err);
    }
  });

  app.get("/v1/tools/identities", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      return {
        identities: listTenantIdentities(db, user.orgId),
        enablements: listEnablements(db, user.orgId),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/tools/invoke", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const body = z
        .object({ tool: z.string().min(1), action: z.string().min(1), clusterId: z.string().optional() })
        .parse(req.body ?? {});
      const result = invokeComposioMock(db, {
        orgId: user.orgId,
        actorId: user.id,
        tool: body.tool,
        action: body.action,
        clusterId: body.clusterId,
      });
      return result;
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ error: "Invalid invoke", details: err.issues });
      if (err instanceof Error) return reply.status(400).send({ error: err.message });
      return sendError(reply, err);
    }
  });

  app.get("/v1/prompts", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      return { traces: listPromptTraces(db, user.orgId) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/prompts", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const body = z
        .object({
          prompt: z.string().min(1),
          tools: z.array(z.string()).optional(),
          outcome: z.string().min(1),
          insight: z.string().min(1),
          clusterId: z.string().optional(),
        })
        .parse(req.body ?? {});
      const trace = {
        id: `pt_${randomUUID().slice(0, 8)}`,
        orgId: user.orgId,
        actorId: user.id,
        clusterId: body.clusterId ?? null,
        prompt: body.prompt,
        tools: body.tools ?? [],
        outcome: body.outcome,
        insight: body.insight,
        occurredAt: new Date().toISOString(),
      };
      insertPromptTrace(db, trace);
      insertAudit(db, {
        id: `aud_${randomUUID()}`,
        orgId: user.orgId,
        actorId: user.id,
        agentId: user.agentId,
        action: "prompt_trace",
        purpose: body.insight,
        matterId: null,
        ticketId: null,
        fileId: null,
        suggestionId: null,
        query: body.prompt,
        aclSnapshot: null,
        contentHash: null,
        receiptId: null,
        decision: "allow",
        metadata: { insight: body.insight },
      });
      return { trace };
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ error: "Invalid prompt trace", details: err.issues });
      return sendError(reply, err);
    }
  });

  app.get("/v1/insights", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      return {
        rollup: insightRollup(db, user.orgId),
        note: "Aggregated official PromptTraces — employee-visible harness bus, not covert HR scoring.",
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/runtime", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      return hostedRuntimeView(db, user.orgId);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/runtime/tick", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const body = z
        .object({ clusterId: z.string().optional(), routineId: z.string().optional() })
        .parse(req.body ?? {});
      const tick = await runHostedTick(db, { user, clusterId: body.clusterId, routineId: body.routineId });
      insertAudit(db, {
        id: `aud_${randomUUID()}`,
        orgId: user.orgId,
        actorId: user.id,
        agentId: user.agentId,
        action: "runtime_tick",
        purpose: "hosted Hermes follow-through",
        matterId: null,
        ticketId: null,
        fileId: null,
        suggestionId: null,
        query: tick.clusterId,
        aclSnapshot: null,
        contentHash: null,
        receiptId: tick.id,
        decision: "allow",
        metadata: { routineId: tick.routineId, steps: String(tick.steps.length) },
      });
      return { tick, runtime: hostedRuntimeView(db, user.orgId) };
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ error: "Invalid tick", details: err.issues });
      if (err instanceof Error) return reply.status(400).send({ error: err.message });
      return sendError(reply, err);
    }
  });

  app.post("/v1/suggest", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      requireFeature("suggest");
      const body = suggestBody.parse(req.body);
      const embedding = createEmbeddingProvider(parseEmbeddingKind(env.embeddingProvider));
      const [queryVec] = await embedding.embed([`${body.query}\n${body.context ?? ""}`]);
      const files = listFiles(db, user.orgId).filter((f) => canReadFile(user, f));
      const fileById = new Map(files.map((f) => [f.id, f]));
      const chunks = listChunks(db, user.orgId).filter((c) => fileById.has(c.fileId));
      const ranked: Suggestion[] = [];
      for (const chunk of chunks) {
        const file = fileById.get(chunk.fileId);
        if (!file) continue;
        const { score, why } = weigh({
          query: body.query,
          context: body.context,
          queryEmbedding: queryVec ?? embedLocal(body.query),
          chunkText: chunk.text,
          chunkEmbedding: chunk.embedding,
          file,
          reuseCount: file.reuseCount,
          actor: user,
          queryProjectId: body.projectId ?? file.projectId,
          authorRole: file.authorRole,
          weights: env.rankWeights,
        });
        ranked.push({
          id: `sug_${randomUUID()}`,
          fileId: file.id,
          chunkId: chunk.id,
          score,
          snippet: pickSnippet(chunk.text, body.query),
          why,
          file,
        });
      }
      ranked.sort((a, b) => b.score - a.score);
      const bestByFile = new Map<string, Suggestion>();
      for (const s of ranked) {
        const prev = bestByFile.get(s.fileId);
        if (!prev || s.score > prev.score) bestByFile.set(s.fileId, s);
      }
      const limit = body.limit ?? 5;
      const suggestions = [...bestByFile.values()].sort((a, b) => b.score - a.score).slice(0, limit);
      const batchId = `sbatch_${randomUUID()}`;
      saveSuggestionBatch(db, batchId, user.orgId, user.id, body.query, suggestions);
      const harnessEvent = recordHarnessSuggest(db, {
        orgId: user.orgId,
        actorId: user.id,
        query: body.query,
        context: body.context,
        hitCount: suggestions.length,
        clusterId: body.clusterId,
      });
      const audit = insertAudit(db, {
        id: `aud_${randomUUID()}`,
        orgId: user.orgId,
        actorId: user.id,
        agentId: user.agentId,
        action: "suggest",
        purpose: "midnight-suggest",
        matterId: null,
        ticketId: null,
        fileId: suggestions[0]?.fileId ?? null,
        suggestionId: suggestions[0]?.id ?? null,
        query: body.query,
        aclSnapshot: null,
        contentHash: null,
        receiptId: null,
        decision: "allow",
        metadata: { batchId, hits: String(suggestions.length) },
      });
      return {
        suggestionBatchId: batchId,
        suggestions,
        auditId: audit.id,
        workEventId: harnessEvent?.id ?? null,
        clusterId: harnessEvent?.clusterId ?? null,
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "Invalid suggest payload", details: err.issues });
      }
      return sendError(reply, err);
    }
  });

  app.post("/v1/fetch", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      requireFeature("suggest");
      const body = fetchBody.parse(req.body);
      const file = getFile(db, body.fileId);
      if (!file || file.orgId !== user.orgId) {
        throw new HttpError(404, "File not in overlay index.");
      }
      if (body.suggestionId) {
        const sug = getSuggestion(db, body.suggestionId);
        if (!sug || sug.fileId !== file.id) {
          throw new HttpError(400, "suggestionId does not lineage to this file.");
        }
      }
      const matters = [...new Set([...matterIdsFor(db, user.id), body.matterId ?? ""].filter(Boolean))];
      const policy = evaluateFetch({
        actor: user,
        file,
        memberProjectIds: memberProjectIds(db, user.id),
        matterIds: matters,
        afterHours: isAfterHours(new Date()),
        blockEmployeesAfterHours: env.blockEmployeesAfterHours,
      });

      if (policy.decision === "deny") {
        const audit = insertAudit(db, {
          id: `aud_${randomUUID()}`,
          orgId: user.orgId,
          actorId: user.id,
          agentId: user.agentId,
          action: "fetch_denied",
          purpose: body.purpose,
          matterId: body.matterId ?? file.matterId,
          ticketId: body.ticketId ?? null,
          fileId: file.id,
          suggestionId: body.suggestionId ?? null,
          query: null,
          aclSnapshot: file.acl,
          contentHash: file.contentHash,
          receiptId: null,
          decision: "deny",
          metadata: { code: policy.code, reason: policy.reason },
        });
        throw new HttpError(403, policy.reason, { code: policy.code, auditId: audit.id });
      }

      requireFeature("receipts");
      const keys = loadOkfpKeys(db, user.orgId);
      const receiptId = newReceiptId();
      const receipt = signReceiptBody(
        {
          v: OKFP_VERSION,
          id: receiptId,
          orgId: user.orgId,
          actorId: user.id,
          agentId: user.agentId,
          fileId: file.id,
          suggestionId: body.suggestionId ?? null,
          purpose: body.purpose,
          matterId: body.matterId ?? file.matterId,
          ticketId: body.ticketId ?? null,
          aclSnapshot: file.acl,
          contentHash: file.contentHash,
          issuedAt: new Date().toISOString(),
        },
        keys,
      );
      saveReceipt(db, receipt);
      const audit = insertAudit(db, {
        id: `aud_${randomUUID()}`,
        orgId: user.orgId,
        actorId: user.id,
        agentId: user.agentId,
        action: "fetch",
        purpose: body.purpose,
        matterId: receipt.matterId,
        ticketId: receipt.ticketId,
        fileId: file.id,
        suggestionId: body.suggestionId ?? null,
        query: null,
        aclSnapshot: file.acl,
        contentHash: file.contentHash,
        receiptId: receipt.id,
        decision: "allow",
        metadata: { okfp: OKFP_VERSION },
      });
      bumpSkillReuse(db, file.id);
      const harnessEvent = recordHarnessFetch(db, {
        orgId: user.orgId,
        actorId: user.id,
        file,
        purpose: body.purpose,
        receiptId: receipt.id,
        clusterId: body.clusterId,
      });
      const include = body.includeContent !== false;
      return {
        file: { ...file, content: include ? file.content : null },
        content: include ? file.content : null,
        receipt,
        auditId: audit.id,
        workEventId: harnessEvent.id,
        clusterId: harnessEvent.clusterId,
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "Fetch requires purpose (+ fileId).", details: err.issues });
      }
      return sendError(reply, err);
    }
  });

  app.get("/v1/audit", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      const q = req.query as { limit?: string };
      const events = listAudit(db, user.orgId, user, Number(q.limit ?? 50));
      return { events, scope: user.role === "manager" || user.role === "admin" ? "org" : "self" };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/receipts/:id", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      requireFeature("receipts");
      const { id } = req.params as { id: string };
      const receipt = getReceipt(db, id);
      if (!receipt || receipt.orgId !== user.orgId) throw new HttpError(404, "Unknown receipt.");
      return receipt;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/receipts/verify", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      requireFeature("receipts");
      const body = verifyBody.parse(req.body ?? {});
      let receipt: OkfpReceipt | undefined;
      if (body.id) receipt = getReceipt(db, body.id);
      if (!receipt && body.receipt) receipt = body.receipt as unknown as OkfpReceipt;
      if (!receipt) throw new HttpError(400, "Provide receipt id or receipt object.");
      const keys = getOrgKeys(db, user.orgId);
      if (!keys) throw new HttpError(500, "Org has no OKFP key.");
      const result = verifyReceipt(receipt, createPublicKey(keys.publicPem));
      insertAudit(db, {
        id: `aud_${randomUUID()}`,
        orgId: user.orgId,
        actorId: user.id,
        agentId: user.agentId,
        action: "receipt_verify",
        purpose: "verify",
        matterId: receipt.matterId,
        ticketId: receipt.ticketId,
        fileId: receipt.fileId,
        suggestionId: receipt.suggestionId,
        query: null,
        aclSnapshot: receipt.aclSnapshot,
        contentHash: receipt.contentHash,
        receiptId: receipt.id,
        decision: result.ok ? "allow" : "deny",
        metadata: { ok: String(result.ok) },
      });
      return result.ok ? { ok: true, receipt } : { ok: false, reason: result.reason, receipt };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "Invalid verify payload", details: err.issues });
      }
      return sendError(reply, err);
    }
  });

  app.get("/v1/reuse", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      return { documents: topReused(db, user.orgId) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/atlas", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      requireFeature("atlas");
      const graph = listSkillGraph(db, user.orgId);
      return {
        ...graph,
        reused: topReused(db, user.orgId),
        devices: listSealDevices(db, user.orgId),
        insights: insightRollup(db, user.orgId),
        traces: listPromptTraces(db, user.orgId, 8),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/seal/devices", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      requireFeature("receipts");
      return { devices: listSealDevices(db, user.orgId) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/seal/devices", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      requireFeature("receipts");
      const body = enrollBody.parse(req.body);
      const caps: SealCapabilities = body.capabilities;
      if (caps.os !== body.os) {
        throw new HttpError(400, "capabilities.os must match device os.");
      }
      const resolved = resolveIntegrityTier(caps);
      const now = new Date().toISOString();
      const device = {
        id: body.id,
        orgId: user.orgId,
        hostname: body.hostname,
        os: body.os,
        osUser: body.osUser,
        ownerUserId: body.ownerUserId ?? user.id,
        integrityTier: resolved.tier,
        claimedTier: "T3" as const,
        degradeReason: resolved.tier === "T3" ? null : resolved.reason,
        allowlist: body.allowlist,
        capabilities: caps,
        lastHeartbeatAt: now,
        enrolledAt: now,
      };
      upsertSealDevice(db, device);
      const audit = insertAudit(db, {
        id: `aud_${randomUUID()}`,
        orgId: user.orgId,
        actorId: user.id,
        agentId: user.agentId,
        action: "seal_enroll",
        purpose: "endpoint enrollment",
        matterId: null,
        ticketId: null,
        fileId: null,
        suggestionId: null,
        query: null,
        aclSnapshot: null,
        contentHash: null,
        receiptId: null,
        decision: "allow",
        metadata: { deviceId: device.id, tier: device.integrityTier, os: device.os },
      });
      return { device, auditId: audit.id };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "Invalid enroll payload", details: err.issues });
      }
      return sendError(reply, err);
    }
  });

  app.post("/v1/seal/events", async (req, reply) => {
    try {
      const user = await authenticate(db, req);
      requireFeature("receipts");
      const body = ingestBody.parse(req.body);
      const device = getSealDevice(db, body.deviceId);
      if (!device || device.orgId !== user.orgId) {
        throw new HttpError(404, "Unknown Seal device. Enroll first.");
      }
      const { accepted, rejected } = validateIngestBatch(body.events, {
        deviceId: device.id,
        os: device.os,
        allowlist: device.allowlist,
      });
      insertSealEvents(db, user.orgId, accepted);
      if (accepted.some((e) => e.kind === "heartbeat")) {
        touchSealHeartbeat(db, device.id, new Date().toISOString());
      }
      const audit = insertAudit(db, {
        id: `aud_${randomUUID()}`,
        orgId: user.orgId,
        actorId: user.id,
        agentId: user.agentId,
        action: "seal_ingest",
        purpose: "endpoint integrity batch",
        matterId: null,
        ticketId: null,
        fileId: null,
        suggestionId: null,
        query: null,
        aclSnapshot: null,
        contentHash: null,
        receiptId: null,
        decision: rejected.length && !accepted.length ? "deny" : "allow",
        metadata: {
          deviceId: device.id,
          accepted: String(accepted.length),
          rejected: String(rejected.length),
        },
      });
      return { accepted: accepted.length, rejected, auditId: audit.id };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "Invalid ingest payload", details: err.issues });
      }
      return sendError(reply, err);
    }
  });

  return app;
}
