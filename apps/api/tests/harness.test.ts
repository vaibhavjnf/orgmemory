import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createEmbeddingProvider } from "@orgmemory/core";
import { OrgMemoryClient } from "@orgmemory/sdk";
import { checkLicense } from "@orgmemory/license";
import { buildApp } from "../src/app.js";
import { seedAcme } from "../src/db/seed.js";
import { loadEnv } from "../src/env.js";
import { listWorkEvents, listOwnerBoard, openDb } from "../src/db/store.js";

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

describe("owner concurrent harness", () => {
  it("health leads with harness identity and multi-source activity", async () => {
    const res = await fetch(`${baseUrl}/v1/health`);
    const body = (await res.json()) as {
      identity: string;
      harness: { clusters: number; sources: Array<{ source: string }> };
      connectors: Array<{ kind: string }>;
    };
    expect(body.identity).toBe("harness");
    expect(body.harness.clusters).toBeGreaterThanOrEqual(4);
    const kinds = new Set(body.connectors.map((c) => c.kind));
    expect(kinds.has("slack")).toBe(true);
    expect(kinds.has("salesforce")).toBe(true);
    expect(kinds.has("ramp")).toBe(true);
    expect(kinds.has("google_drive")).toBe(true);
    const sources = new Set(body.harness.sources.map((s) => s.source));
    expect(sources.has("slack")).toBe(true);
    expect(sources.has("salesforce")).toBe(true);
    expect(sources.has("ramp")).toBe(true);
  });

  it("GET /v1/harness returns department lanes with Slack/SF/Ramp clusters", async () => {
    const res = await fetch(`${baseUrl}/v1/harness`, {
      headers: { authorization: "Bearer om_demo_priya" },
    });
    expect(res.status).toBe(200);
    const board = (await res.json()) as {
      identity: string;
      departments: Array<{
        department: string;
        teams: Array<{ team: string; clusters: Array<{ id: string; title: string; stage: string }> }>;
      }>;
    };
    expect(board.identity).toBe("harness");
    const clusters = board.departments.flatMap((d) => d.teams.flatMap((t) => t.clusters));
    expect(clusters.find((c) => c.title === "HQ rent amendment")?.stage).toBe("active");
    expect(clusters.find((c) => c.title === "Matter 4419 estoppel")?.stage).toBe("blocked");
    expect(clusters.find((c) => c.title === "Q3 office spend")?.stage).toBe("intake");
    expect(clusters.find((c) => c.title === "Conti Corp retainer")).toBeTruthy();
    expect(board.departments.some((d) => d.department === "Real Estate")).toBe(true);
    expect(board.departments.some((d) => d.department === "Finance")).toBe(true);
  });

  it("cluster briefing includes related artifacts and multi-source events", async () => {
    const res = await fetch(`${baseUrl}/v1/harness/clusters/cl_rent`, {
      headers: { authorization: "Bearer om_demo_priya" },
    });
    const briefing = (await res.json()) as {
      cluster: { title: string };
      artifacts: Array<{ source: string }>;
      events: Array<{ source: string; summary: string }>;
    };
    expect(briefing.cluster.title).toBe("HQ rent amendment");
    const sources = new Set(briefing.events.map((e) => e.source));
    expect(sources.has("slack")).toBe(true);
    expect(sources.has("google_drive") || sources.has("seal") || sources.has("fetch")).toBe(true);
    expect(briefing.artifacts.length).toBeGreaterThan(0);
  });

  it("fetch writes a WorkEvent + harness receipt onto a cluster", async () => {
    const client = new OrgMemoryClient({
      baseUrl,
      apiKey: "om_demo_acme_legal",
      actorId: "user_agent",
    });
    const sug = await client.suggest({ query: "lease rent schedule", projectId: "proj_re" });
    const hit = sug.suggestions[0]!;
    const fetched = await client.fetch({
      fileId: hit.fileId,
      suggestionId: hit.id,
      purpose: "Draft HQ rent amendment at 00:30 without pinging Priya",
      matterId: "matter_hq",
    });
    const events = listWorkEvents(db, "org_acme", { limit: 40 });
    const fetchEvt = events.find((e) => e.id === `wevt_fetch_${fetched.receipt.id}`);
    expect(fetchEvt?.source).toBe("fetch");
    expect(fetchEvt?.clusterId).toBe("cl_rent");
    const board = listOwnerBoard(db, "org_acme");
    expect(board.eventCount).toBeGreaterThan(0);
  });
});
