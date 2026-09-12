import type { SourceFile, User } from "@orgmemory/core";
import { canReadFile } from "@orgmemory/core";

export interface PolicyContext {
  actor: User;
  file: SourceFile;
  memberProjectIds: string[];
  matterIds: string[];
  afterHours: boolean;
  /** When true, employees are blocked after hours. Agents are never blocked for midnight work. */
  blockEmployeesAfterHours: boolean;
}

export interface PolicyResult {
  decision: "allow" | "deny";
  code:
    | "ok"
    | "acl"
    | "project_membership"
    | "matter_wall"
    | "after_hours";
  reason: string;
}

/**
 * Fetch policy. Denies are still audit-logged by the API.
 * Matter wall is a stub: files with a matterId require that matter on the actor or request.
 */
export function evaluateFetch(ctx: PolicyContext): PolicyResult {
  const { actor, file } = ctx;
  if (!canReadFile(actor, file)) {
    return {
      decision: "deny",
      code: "acl",
      reason: "Actor is not on the inherited ACL (owner or sharedWith).",
    };
  }
  if (file.projectId && actor.role !== "manager" && actor.role !== "admin") {
    if (!ctx.memberProjectIds.includes(file.projectId)) {
      return {
        decision: "deny",
        code: "project_membership",
        reason: "Actor is not a member of the file's project.",
      };
    }
  }
  if (file.matterId && actor.role !== "manager" && actor.role !== "admin") {
    if (!ctx.matterIds.includes(file.matterId)) {
      return {
        decision: "deny",
        code: "matter_wall",
        reason: `Matter wall: ${file.matterId} is not on this actor's wall list.`,
      };
    }
  }
  if (ctx.blockEmployeesAfterHours && ctx.afterHours && actor.role === "employee") {
    return {
      decision: "deny",
      code: "after_hours",
      reason: "After-hours fetch blocked for employees by org policy (agents remain allowed).",
    };
  }
  return { decision: "allow", code: "ok", reason: "Policy allow." };
}

export function isAfterHours(now: Date, tzHour?: number): boolean {
  const hour = tzHour ?? now.getUTCHours();
  return hour < 7 || hour >= 20;
}
