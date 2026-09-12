import { DatabaseSync } from "node:sqlite";
import { createEmbeddingProvider } from "@orgmemory/core";
import { checkLicense } from "@orgmemory/license";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { seedAcme } from "../src/db/seed.js";
import { loadEnv } from "../src/env.js";
import { listHardCommits, listTimelineMirrors, listWorkClusters, openDb } from "../src/db/store.js";

let db: DatabaseSync;
let baseUrl: string;
let close: () => Promise<void>;

beforeAll(async () => {
  db = openDb(":memory:");
  await seedAcme(db, createEmbeddingProvider("local-hash"));
  const env = { ...loadEnv(), dbPath: ":memory:" };
  const license = checkLicense({ mode: "cloud", token: undefined, secret: env.licenseSecret });
  const app = await buildApp({ db, env, license });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const addr = app.server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  baseUrl = `http://127.0.0.1:${addr.port}`;
  close = () => app.close();
});

afterAll(async () => {
  await close();
  db.close();
});

const headers = {
  authorization: "Bearer om_demo_priya",
  "content-type": "application/json",
};

describe("concurrent fabric", () => {
  it("seeds three timeline mirrors and a hard commit on HQ rent", () => {
    const mirrors = listTimelineMirrors(db, "org_acme");
    expect(mirrors.length).toBeGreaterThanOrEqual(3);
    const commits = listHardCommits(db, "org_acme");
    expect(commits.some((c) => c.targetId === "cl_rent")).toBe(true);
    const rent = listWorkClusters(db, "org_acme").find((c) => c.id === "cl_rent");
    expect(rent?.frozenCommitId).toBeTruthy();
  });

  it("rejects soft stage edits on a frozen cluster", async () => {
    const res = await fetch(`${baseUrl}/v1/clusters/cl_rent/stage`, {
      method: "POST",
      headers,
      body: JSON.stringify({ stage: "sealed" }),
    });
    expect(res.status).toBe(409);
  });

  it("lists mirrors and rolls back with a receipt", async () => {
    const listed = await fetch(`${baseUrl}/v1/mirrors`, { headers });
    const body = (await listed.json()) as { mirrors: Array<{ id: string; label: string }> };
    expect(body.mirrors.length).toBeGreaterThanOrEqual(3);
    const target = body.mirrors.find((m) => m.label === "After HQ rent freeze") ?? body.mirrors[0]!;
    const rb = await fetch(`${baseUrl}/v1/mirrors/${target.id}/rollback`, {
      method: "POST",
      headers,
      body: "{}",
    });
    expect(rb.status).toBe(200);
    const rolled = (await rb.json()) as { receipt: { signature: string; purpose: string } };
    expect(rolled.receipt.signature.length).toBeGreaterThan(20);
    expect(rolled.receipt.purpose).toMatch(/rollback/i);
  });

  it("refuses raw cookies in the session vault", async () => {
    const res = await fetch(`${baseUrl}/v1/vaults/vault_priya_win/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ origin: "https://acme.slack.com", tool: "slack", cookie: "steal-me" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/raw secret/i);
  });

  it("invokes Composio mock via tenant enterprise email", async () => {
    const res = await fetch(`${baseUrl}/v1/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool: "salesforce", action: "get_opportunity", clusterId: "cl_conti" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mock: boolean; identityEmail: string };
    expect(body.mock).toBe(true);
    expect(body.identityEmail).toMatch(/orgmemory/);
  });

  it("returns aggregated prompt insights", async () => {
    const res = await fetch(`${baseUrl}/v1/insights`, { headers });
    const body = (await res.json()) as { rollup: { traceCount: number; byInsight: Array<{ insight: string }> } };
    expect(body.rollup.traceCount).toBeGreaterThanOrEqual(4);
    expect(body.rollup.byInsight.some((i) => i.insight === "reuse")).toBe(true);
  });

  it("owner board includes nodes", async () => {
    const res = await fetch(`${baseUrl}/v1/harness`, { headers });
    const board = (await res.json()) as { nodes: Array<{ id: string }>; identity: string };
    expect(board.identity).toBe("harness");
    expect(board.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("hosted Hermes runtime ticks suggest/fetch/prompt-trace onto a cluster", async () => {
    const res = await fetch(`${baseUrl}/v1/runtime/tick`, {
      method: "POST",
      headers: {
        authorization: "Bearer om_demo_acme_legal",
        "content-type": "application/json",
        "x-orgmemory-actor": "user_agent",
      },
      body: JSON.stringify({ clusterId: "cl_rent" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tick: { steps: Array<{ tool: string; ok: boolean }>; clusterId: string };
      runtime: { archetype: string; authority: string };
    };
    expect(body.runtime.archetype).toBe("hermes-hosted");
    expect(body.runtime.authority).toBe("orgmemory-infra");
    expect(body.tick.clusterId).toBe("cl_rent");
    const tools = body.tick.steps.map((s) => s.tool);
    expect(tools).toContain("suggest");
    expect(tools).toContain("fetch");
    expect(tools).toContain("prompt_trace");
    expect(body.tick.steps.every((s) => s.ok)).toBe(true);
  });

  it("GET /v1/runtime names the hosted Hermes driver", async () => {
    const res = await fetch(`${baseUrl}/v1/runtime`, { headers });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      archetype: string;
      authority: string;
      runtime: { id: string };
      routines: Array<{ id: string }>;
    };
    expect(body.archetype).toBe("hermes-hosted");
    expect(body.authority).toBe("orgmemory-infra");
    expect(body.runtime.id).toBe("rt_acme");
    expect(body.routines.length).toBeGreaterThanOrEqual(2);
  });
});
