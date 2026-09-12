import { describe, expect, it } from "vitest";
import { embedLocal } from "../src/embeddings.js";
import {
  canonicalize,
  generateOkfpKeys,
  signReceiptBody,
  verifyReceipt,
} from "../src/okfp.js";
import { DEFAULT_MIDNIGHT_WEIGHTS, weigh } from "../src/ranker.js";
import type { OkfpReceiptBody, SourceFile, User } from "../src/types.js";

const actor: User = {
  id: "user_jordan",
  orgId: "org_acme",
  email: "jordan@acme.legal",
  displayName: "Jordan Hale",
  role: "employee",
  agentId: null,
};

function file(partial: Partial<SourceFile> & Pick<SourceFile, "id" | "name">): SourceFile {
  return {
    orgId: "org_acme",
    connectorId: "conn_gdrive",
    projectId: "proj_re",
    externalId: partial.id,
    mimeType: "text/plain",
    path: `/Leases/${partial.name}`,
    acl: { ownerId: "user_priya", sharedWith: ["user_jordan"] },
    content: null,
    contentHash: "sha256:demo",
    metadata: {},
    authorRole: "manager",
    matterId: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    modifiedAt: "2026-06-01T00:00:00.000Z",
    indexedAt: "2026-09-01T00:00:00.000Z",
    reuseCount: 0,
    ...partial,
  };
}

const rentSchedule = `EXHIBIT B — RENT SCHEDULE
Base Rent: Year 1 $186,400 per month. Escalation 3% annually.
Payment due on the first day of each calendar month.`;

const handbook = `EMPLOYEE HANDBOOK
PTO accrues at 15 days per year. No mention of commercial real estate.`;

describe("midnight ranking", () => {
  it("ranks a lease rent schedule above an unrelated handbook", () => {
    const query = "lease rent schedule";
    const qEmb = embedLocal(query);
    const lease = weigh({
      query,
      queryEmbedding: qEmb,
      chunkText: rentSchedule,
      chunkEmbedding: embedLocal(rentSchedule),
      file: file({
        id: "file_lease",
        name: "HQ Office Lease — Exhibit B Rent Schedule",
        reuseCount: 4,
        authorRole: "manager",
      }),
      reuseCount: 4,
      authorRole: "manager",
      actor,
      queryProjectId: "proj_re",
    });
    const other = weigh({
      query,
      queryEmbedding: qEmb,
      chunkText: handbook,
      chunkEmbedding: embedLocal(handbook),
      file: file({
        id: "file_handbook",
        name: "Employee Handbook 2024",
        projectId: "proj_kb",
        acl: { ownerId: "user_priya", sharedWith: [] },
        reuseCount: 0,
        authorRole: "employee",
      }),
      reuseCount: 0,
      authorRole: "employee",
      actor,
      queryProjectId: "proj_re",
    });
    expect(lease.score).toBeGreaterThan(other.score);
  });

  it("lets reuse + recency beat raw similarity", () => {
    const query = "lease rent schedule";
    const now = new Date("2026-09-11T00:30:00.000Z");
    const similar = weigh({
      query,
      queryEmbedding: embedLocal(query),
      chunkText: query,
      chunkEmbedding: embedLocal(query),
      file: file({
        id: "file_similar",
        name: "scratch notes lease rent schedule",
        projectId: "proj_kb",
        authorRole: "agent",
        reuseCount: 0,
        modifiedAt: "2024-01-01T00:00:00.000Z",
        acl: { ownerId: "user_agent", sharedWith: ["user_jordan"] },
      }),
      reuseCount: 0,
      authorRole: "agent",
      actor,
      queryProjectId: "proj_re",
      now,
    });
    const institutional = weigh({
      query,
      queryEmbedding: embedLocal(query),
      chunkText:
        "Executed HQ office lease. Exhibit B covers the rent schedule, monthly base rent, and 3% escalation. Partners treat this as the authority copy.",
      chunkEmbedding: embedLocal(
        "Executed HQ office lease. Exhibit B covers the rent schedule, monthly base rent, and 3% escalation. Partners treat this as the authority copy.",
      ),
      file: file({
        id: "file_authority",
        name: "HQ Office Lease — Exhibit B Rent Schedule",
        projectId: "proj_re",
        authorRole: "manager",
        reuseCount: 18,
        modifiedAt: "2026-09-01T00:00:00.000Z",
      }),
      reuseCount: 18,
      authorRole: "manager",
      actor,
      queryProjectId: "proj_re",
      now,
    });

    expect(similar.sim).toBeGreaterThan(institutional.sim);
    expect(institutional.score).toBeGreaterThan(similar.score);
    const reuseWhy = institutional.why.find((w) => w.factor === "reuse");
    const recencyWhy = institutional.why.find((w) => w.factor === "recency");
    expect((reuseWhy?.contribution ?? 0) + (recencyWhy?.contribution ?? 0)).toBeGreaterThan(0.2);
  });

  it("emits official midnight factors whose contributions sum to the score", () => {
    const result = weigh({
      query: "rent",
      queryEmbedding: embedLocal("rent"),
      chunkText: rentSchedule,
      chunkEmbedding: embedLocal(rentSchedule),
      file: file({ id: "f", name: "Lease" }),
      reuseCount: 1,
      authorRole: "manager",
      actor,
    });
    const factors = result.why.map((w) => w.factor).sort();
    expect(factors).toEqual(
      [
        "acl_reachable",
        "authority",
        "embedding_similarity",
        "project_affinity",
        "recency",
        "reuse",
      ].sort(),
    );
    const summed = result.why.reduce((s, w) => s + w.contribution, 0);
    expect(Math.abs(summed - result.score)).toBeLessThan(1e-9);
    const wsum =
      DEFAULT_MIDNIGHT_WEIGHTS.sim +
      DEFAULT_MIDNIGHT_WEIGHTS.recency +
      DEFAULT_MIDNIGHT_WEIGHTS.reuse +
      DEFAULT_MIDNIGHT_WEIGHTS.authority +
      DEFAULT_MIDNIGHT_WEIGHTS.project +
      DEFAULT_MIDNIGHT_WEIGHTS.acl;
    expect(wsum).toBeCloseTo(1, 5);
  });
});

describe("OKFP receipts", () => {
  it("signs canonical JSON and verifies with ed25519", () => {
    const keys = generateOkfpKeys("okfp_test");
    const body: OkfpReceiptBody = {
      v: "okfp-1",
      id: "rcpt_test",
      orgId: "org_acme",
      actorId: "user_agent",
      agentId: "user_agent",
      fileId: "file_lease",
      suggestionId: "sug_1",
      purpose: "Draft HQ rent amendment at 00:30",
      matterId: "matter_hq",
      ticketId: null,
      aclSnapshot: { ownerId: "user_priya", sharedWith: ["user_jordan"] },
      contentHash: "sha256:abc",
      issuedAt: "2026-09-11T00:30:00.000Z",
    };
    const receipt = signReceiptBody(body, keys);
    expect(verifyReceipt(receipt, keys.publicKey)).toEqual({ ok: true });
    const tampered = { ...receipt, purpose: "not the purpose" };
    expect(verifyReceipt(tampered, keys.publicKey).ok).toBe(false);
  });

  it("canonicalize is key-order insensitive", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });
});
