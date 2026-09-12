import {
  assertNever,
  planTickTools,
  runtimeToolLabel,
  type LoopStep,
  type RuntimeToolName,
  type WorkStage,
} from "@orgmemory/core";

/**
 * Ports onto OrgMemory-hosted infra. The runtime never talks to employee
 * laptops as authority — Seal/browser nodes are satellites.
 */
export interface HostedInfraPorts {
  suggest(input: { query: string; context: string; clusterId: string }): Promise<{ summary: string }>;
  fetch(input: { purpose: string; clusterId: string }): Promise<{ summary: string }>;
  composio(input: { tool: string; action: string; clusterId: string }): Promise<{ summary: string }>;
  browser(input: { intent: string; clusterId: string }): Promise<{ summary: string }>;
  mirror(input: { label: string }): Promise<{ summary: string }>;
  promptTrace(input: { prompt: string; tools: string[]; outcome: string; insight: string; clusterId: string }): Promise<{ summary: string }>;
  remember(input: { key: string; value: string }): Promise<{ summary: string }>;
}

export interface TickRequest {
  orgId: string;
  runtimeId: string;
  routineId: string;
  clusterId: string;
  clusterTitle: string;
  stage: WorkStage;
  query: string;
}

export interface TickResult {
  steps: LoopStep[];
  tools: RuntimeToolName[];
}

export async function runTenantLoop(ports: HostedInfraPorts, req: TickRequest): Promise<TickResult> {
  const tools = planTickTools(req.stage);
  const steps: LoopStep[] = [];
  const used: string[] = [];
  let last = "";

  for (const tool of tools) {
    used.push(tool);
    const step = await runTool(ports, tool, req, last);
    steps.push(step);
    if (step.ok && tool !== "prompt_trace" && tool !== "remember") last = step.summary;
  }

  return { steps, tools };
}

async function runTool(
  ports: HostedInfraPorts,
  tool: RuntimeToolName,
  req: TickRequest,
  last: string,
): Promise<LoopStep> {
  try {
    switch (tool) {
      case "suggest": {
        const r = await ports.suggest({
          query: req.query,
          context: `${req.clusterTitle} (${req.stage})`,
          clusterId: req.clusterId,
        });
        return { tool, ok: true, summary: r.summary };
      }
      case "fetch": {
        const r = await ports.fetch({
          purpose: `Hosted Hermes follow-through on ${req.clusterTitle}`,
          clusterId: req.clusterId,
        });
        return { tool, ok: true, summary: r.summary };
      }
      case "composio": {
        const r = await ports.composio({
          tool: "salesforce",
          action: "get_opportunity",
          clusterId: req.clusterId,
        });
        return { tool, ok: true, summary: r.summary };
      }
      case "browser": {
        const r = await ports.browser({
          intent: `Follow through ${req.clusterTitle}`,
          clusterId: req.clusterId,
        });
        return { tool, ok: true, summary: r.summary };
      }
      case "mirror": {
        const r = await ports.mirror({ label: `Runtime tick ${req.clusterTitle}` });
        return { tool, ok: true, summary: r.summary };
      }
      case "prompt_trace": {
        const r = await ports.promptTrace({
          prompt: req.query,
          tools: [runtimeToolLabel("suggest")],
          outcome: last || `Followed through ${req.clusterTitle}`,
          insight: req.stage === "blocked" ? "blocked" : "reuse",
          clusterId: req.clusterId,
        });
        return { tool, ok: true, summary: r.summary };
      }
      case "remember": {
        const r = await ports.remember({
          key: `last:${req.clusterId}`,
          value: last || req.query,
        });
        return { tool, ok: true, summary: r.summary };
      }
      default:
        return assertNever(tool);
    }
  } catch (err) {
    return { tool, ok: false, summary: err instanceof Error ? err.message : "tool failed" };
  }
}

export { planTickTools };
