import { describe, expect, it } from "vitest";
import type { ActivityConnector, ConnectorDraft } from "@orgmemory/core";
import { assignCluster, describeBusHop, normalizeConnector } from "../src/index.js";

const slack: ActivityConnector = {
  kind: "slack",
  displayName: "Slack (stub)",
  pull(): ConnectorDraft[] {
    return [
      {
        externalId: "slack:1",
        actorId: "user_jordan",
        verb: "said",
        summary: "Need the HQ rent schedule exhibit tonight",
        occurredAt: "2026-09-11T00:28:00.000Z",
        clusterHint: "HQ rent amendment",
        artifact: { kind: "message", title: "#leases", ref: "slack:leases" },
      },
    ];
  },
};

describe("activity bus", () => {
  it("normalizes connector drafts onto the common bus", () => {
    const batch = normalizeConnector(slack, "org_acme");
    expect(batch.source).toBe("slack");
    expect(batch.events[0]?.summary).toMatch(/rent schedule/i);
    expect(describeBusHop("slack")).toContain("WorkEvent");
  });

  it("returns null when no cluster title matches", () => {
    expect(
      assignCluster("unrelated slack chatter about lunch", [
        { id: "cl_rent", title: "HQ rent amendment" },
        { id: "cl_finance", title: "Q3 office spend" },
      ]),
    ).toBeNull();
  });

  it("assigns events to a concurrent cluster by title tokens", () => {
    const id = assignCluster("Drafting HQ rent amendment using Exhibit B", [
      { id: "cl_finance", title: "Q3 office spend" },
      { id: "cl_rent", title: "HQ rent amendment" },
    ]);
    expect(id).toBe("cl_rent");
  });
});
