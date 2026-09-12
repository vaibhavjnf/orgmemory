import { describe, expect, it } from "vitest";
import type { SourceFile, User } from "@orgmemory/core";
import { evaluateFetch } from "../src/index.js";

const jordan: User = {
  id: "user_jordan",
  orgId: "org_acme",
  email: "jordan@acme.legal",
  displayName: "Jordan Hale",
  role: "employee",
  agentId: null,
};

const sam: User = {
  id: "user_sam",
  orgId: "org_acme",
  email: "sam@acme.legal",
  displayName: "Sam Ortiz",
  role: "employee",
  agentId: null,
};

const file: SourceFile = {
  id: "file_4419",
  orgId: "org_acme",
  connectorId: "conn_gdrive",
  projectId: "proj_client",
  externalId: "gdrive:4419",
  name: "Lease Abstract 4419",
  mimeType: "text/plain",
  path: "/Clients/4419/abstract.md",
  acl: { ownerId: "user_priya", sharedWith: ["user_jordan"] },
  content: null,
  contentHash: "sha256:x",
  metadata: {},
  authorRole: "manager",
  matterId: "matter_4419",
  createdAt: "2026-01-01T00:00:00.000Z",
  modifiedAt: "2026-06-01T00:00:00.000Z",
  indexedAt: "2026-09-01T00:00:00.000Z",
  reuseCount: 2,
};

describe("fetch policy", () => {
  it("allows a project member on the ACL with the matter on their wall", () => {
    const r = evaluateFetch({
      actor: jordan,
      file,
      memberProjectIds: ["proj_client"],
      matterIds: ["matter_4419"],
      afterHours: true,
      blockEmployeesAfterHours: false,
    });
    expect(r.decision).toBe("allow");
  });

  it("denies matter wall even when ACL would allow", () => {
    const r = evaluateFetch({
      actor: jordan,
      file,
      memberProjectIds: ["proj_client"],
      matterIds: [],
      afterHours: false,
      blockEmployeesAfterHours: false,
    });
    expect(r.decision).toBe("deny");
    expect(r.code).toBe("matter_wall");
  });

  it("denies project membership for a user not on the project", () => {
    const r = evaluateFetch({
      actor: sam,
      file: { ...file, acl: { ownerId: "user_priya", sharedWith: ["user_sam"] } },
      memberProjectIds: ["proj_kb"],
      matterIds: ["matter_4419"],
      afterHours: false,
      blockEmployeesAfterHours: false,
    });
    expect(r.decision).toBe("deny");
    expect(r.code).toBe("project_membership");
  });

  it("can block employees after hours while leaving the decision to the caller to audit", () => {
    const r = evaluateFetch({
      actor: jordan,
      file,
      memberProjectIds: ["proj_client"],
      matterIds: ["matter_4419"],
      afterHours: true,
      blockEmployeesAfterHours: true,
    });
    expect(r.decision).toBe("deny");
    expect(r.code).toBe("after_hours");
  });
});
