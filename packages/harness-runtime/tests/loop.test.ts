import { describe, expect, it } from "vitest";
import { planTickTools, runTenantLoop, type HostedInfraPorts } from "../src/index.js";

const ports: HostedInfraPorts = {
  async suggest() {
    return { summary: "suggested Exhibit B" };
  },
  async fetch() {
    return { summary: "fetched Exhibit B" };
  },
  async composio() {
    return { summary: "composio mock" };
  },
  async browser() {
    return { summary: "browser stub" };
  },
  async mirror() {
    return { summary: "mirrored" };
  },
  async promptTrace() {
    return { summary: "traced" };
  },
  async remember() {
    return { summary: "remembered" };
  },
};

describe("hosted Hermes runtime", () => {
  it("plans fetch follow-through on active clusters and composio on blocked", () => {
    expect(planTickTools("active")).toContain("fetch");
    expect(planTickTools("blocked")).toContain("composio");
    expect(planTickTools("blocked")).not.toContain("fetch");
  });

  it("runs a tenant loop against hosted infra ports", async () => {
    const tick = await runTenantLoop(ports, {
      orgId: "org_acme",
      runtimeId: "rt_acme",
      routineId: "rtn_rent",
      clusterId: "cl_rent",
      clusterTitle: "HQ rent amendment",
      stage: "active",
      query: "lease rent schedule",
    });
    expect(tick.tools).toEqual(["suggest", "fetch", "prompt_trace", "remember"]);
    expect(tick.steps.every((s) => s.ok)).toBe(true);
    expect(tick.steps.find((s) => s.tool === "remember")?.summary).toBe("remembered");
  });
});
