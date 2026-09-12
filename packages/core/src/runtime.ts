import type { WorkStage } from "./harness.js";
import { assertNever } from "./types.js";

/** Hosted Hermes-style tools. Not an OpenClaw/picoclaw clone. */
export type RuntimeToolName =
  | "suggest"
  | "fetch"
  | "composio"
  | "browser"
  | "mirror"
  | "prompt_trace"
  | "remember";

export type RuntimeStatus = "idle" | "running" | "paused" | "error";

export interface TenantRuntime {
  id: string;
  orgId: string;
  actorId: string;
  label: string;
  archetype: "hermes-hosted";
  authority: "orgmemory-infra";
  status: RuntimeStatus;
  lastTickAt: string | null;
}

export interface RuntimeRoutine {
  id: string;
  orgId: string;
  runtimeId: string;
  clusterId: string;
  title: string;
  cadence: "on_demand" | "follow_through";
  enabled: boolean;
}

export interface HostedMemorySlot {
  id: string;
  orgId: string;
  runtimeId: string;
  key: string;
  value: string;
  updatedAt: string;
}

export interface LoopStep {
  tool: RuntimeToolName;
  ok: boolean;
  summary: string;
}

export interface LoopTick {
  id: string;
  orgId: string;
  runtimeId: string;
  routineId: string;
  clusterId: string;
  steps: LoopStep[];
  startedAt: string;
  finishedAt: string;
}

export function runtimeStatusLabel(status: RuntimeStatus): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    case "error":
      return "Error";
    default:
      return assertNever(status);
  }
}

export function runtimeToolLabel(tool: RuntimeToolName): string {
  switch (tool) {
    case "suggest":
      return "Suggest";
    case "fetch":
      return "Fetch";
    case "composio":
      return "Composio";
    case "browser":
      return "Browser job";
    case "mirror":
      return "Mirror";
    case "prompt_trace":
      return "Prompt trace";
    case "remember":
      return "Hosted memory";
    default:
      return assertNever(tool);
  }
}

export function planTickTools(stage: WorkStage): RuntimeToolName[] {
  switch (stage) {
    case "intake":
      return ["suggest", "prompt_trace", "remember"];
    case "active":
      return ["suggest", "fetch", "prompt_trace", "remember"];
    case "blocked":
      return ["suggest", "composio", "prompt_trace", "remember"];
    case "review":
      return ["suggest", "mirror", "prompt_trace", "remember"];
    case "sealed":
      return ["prompt_trace", "remember"];
    default:
      return assertNever(stage);
  }
}
