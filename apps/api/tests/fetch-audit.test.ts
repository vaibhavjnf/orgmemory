import { DatabaseSync } from "node:sqlite";
import { createEmbeddingProvider } from "@orgmemory/core";
import { OrgMemoryClient } from "@orgmemory/sdk";
import { checkLicense } from "@orgmemory/license";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { seedAcme } from "../src/db/seed.js";
import { loadEnv } from "../src/env.js";
import { listAudit, openDb } from "../src/db/store.js";

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

describe("suggest → fetch → OKFP receipt", () => {
  const client = () =>
    new OrgMemoryClient({
      baseUrl,
      apiKey: "om_demo_acme_legal",
      actorId: "user_agent",
    });

  it("returns ranked lease docs for lease rent schedule", async () => {
    const res = await client().suggest({ query: "lease rent schedule", projectId: "proj_re" });
    expect(res.suggestions.length).toBeGreaterThan(0);
    const top = res.suggestions[0];
    expect(top?.file.name.toLowerCase()).toMatch(/rent schedule|lease/);
    expect(top?.why.length).toBeGreaterThanOrEqual(6);
  });

  it("creates an audit row and cryptographic receipt on every fetch", async () => {
    const c = client();
    const sug = await c.suggest({ query: "lease rent schedule" });
    const hit = sug.suggestions[0];
    expect(hit).toBeTruthy();
    const fetched = await c.fetch({
      fileId: hit!.fileId,
      suggestionId: hit!.id,
      purpose: "Draft HQ rent amendment at 00:30 without pinging Priya",
      matterId: "matter_hq",
    });
    expect(fetched.receipt.signature.length).toBeGreaterThan(20);
    expect(fetched.receipt.purpose).toContain("00:30");
    expect(fetched.auditId).toMatch(/^aud_/);
    const verified = await c.verifyReceipt(fetched.receipt);
    expect(verified.ok).toBe(true);
    const events = listAudit(db, "org_acme", {
      id: "user_priya",
      orgId: "org_acme",
      email: "p",
      displayName: "Priya",
      role: "manager",
      agentId: null,
    });
    const fetchRow = events.find((e) => e.id === fetched.auditId);
    expect(fetchRow?.action).toBe("fetch");
    expect(fetchRow?.receiptId).toBe(fetched.receipt.id);
    expect(fetchRow?.contentHash).toBeTruthy();
    expect(fetchRow?.aclSnapshot?.ownerId).toBeTruthy();
  });

  it("rejects fetch without purpose and still audits a policy deny", async () => {
    const file = (
      await fetch(`${baseUrl}/v1/suggest`, {
        method: "POST",
        headers: {
          authorization: "Bearer om_demo_acme_legal",
          "content-type": "application/json",
          "x-orgmemory-actor": "user_agent",
        },
        body: JSON.stringify({ query: "nda" }),
      })
    );
    expect(file.status).toBe(200);
    const missing = await fetch(`${baseUrl}/v1/fetch`, {
      method: "POST",
      headers: {
        authorization: "Bearer om_demo_sam",
        "content-type": "application/json",
      },
      body: JSON.stringify({ fileId: "file_gdrive_4419_abstract" }),
    });
    expect(missing.status).toBe(400);

    const denied = await fetch(`${baseUrl}/v1/fetch`, {
      method: "POST",
      headers: {
        authorization: "Bearer om_demo_sam",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fileId: "file_gdrive_4419_abstract",
        purpose: "Curiosity — I am not on this matter",
      }),
    });
    const body = (await denied.json()) as { auditId?: string; code?: string };
    expect(denied.status).toBe(403);
    expect(body.code).toMatch(/matter_wall|project_membership|acl/);
    expect(body.auditId).toMatch(/^aud_/);
  });
});

describe("Seal endpoint ingest (Win/Mac/Linux)", () => {
  const client = () =>
    new OrgMemoryClient({
      baseUrl,
      apiKey: "om_demo_acme_legal",
      actorId: "user_agent",
    });

  it("lists seeded linux/windows/darwin devices with integrity tiers", async () => {
    const { devices } = (await client().listSealDevices()) as {
      devices: Array<{ id: string; os: string; integrityTier: string; degradeReason: string | null }>;
    };
    const byOs = Object.fromEntries(devices.map((d) => [d.os, d]));
    expect(byOs.linux?.integrityTier).toBe("T2");
    expect(byOs.windows?.integrityTier).toBe("T1");
    expect(byOs.darwin?.integrityTier).toBe("T1");
    expect(byOs.windows?.degradeReason ?? "").toMatch(/USN|ReadDirectoryChangesW/i);
  });

  it("accepts an allowlisted Windows modify and rejects auto-widen", async () => {
    const ok = await client().ingestSealEvents("dev_priya_win", [
      {
        kind: "modified",
        path: "C:\\Users\\Priya\\Work\\Acme\\Leases\\exhibit-b.pdf",
        contentHash: "sha256:live",
        mtime: new Date().toISOString(),
        osUser: "acme\\priya",
        integrityTier: "T1",
      },
    ]);
    expect(ok.accepted).toBe(1);
    expect(ok.rejected).toEqual([]);

    const denied = await client().ingestSealEvents("dev_priya_win", [
      {
        kind: "created",
        path: "C:\\Users\\Priya\\Downloads\\secrets.txt",
        mtime: new Date().toISOString(),
        osUser: "acme\\priya",
        integrityTier: "T1",
      },
    ]);
    expect(denied.accepted).toBe(0);
    expect((denied.rejected[0] as { code: string }).code).toBe("allowlist");
  });

  it("strips iCloud placeholder hashes on darwin", async () => {
    const res = await client().ingestSealEvents("dev_jordan_mac", [
      {
        kind: "created",
        path: "/Users/jordan/Work/acme-legal/drafts/x.md.icloud",
        contentHash: "sha256:nope",
        mtime: new Date().toISOString(),
        osUser: "jordan",
        integrityTier: "T1",
      },
    ]);
    expect(res.accepted).toBe(1);
  });
});
