import { assertNever } from "./types.js";

export type WorkNodeKind = "device" | "agent" | "workspace" | "browser";

/** A concurrent publisher on the causal work graph. */
export interface WorkNode {
  id: string;
  orgId: string;
  kind: WorkNodeKind;
  label: string;
  department: string;
  actorId: string;
  online: boolean;
  lastSeenAt: string;
}

export interface HarnessSlice {
  clusters: Array<{
    id: string;
    title: string;
    stage: string;
    department: string;
    team: string;
    ownerActorId: string;
    actorIds: string[];
    nodeIds: string[];
    frozenCommitId: string | null;
    updatedAt: string;
  }>;
  artifacts: Array<{
    id: string;
    clusterId: string | null;
    kind: string;
    title: string;
    source: string;
    ref: string;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    clusterId: string | null;
    actorId: string;
    nodeId: string | null;
    source: string;
    verb: string;
    summary: string;
    artifactId: string | null;
    occurredAt: string;
  }>;
}

export interface TimelineMirror {
  id: string;
  orgId: string;
  label: string;
  createdBy: string;
  createdAt: string;
  sliceHash: string;
  clusterCount: number;
  eventCount: number;
}

export type CommitSubgraph = "matter" | "cluster" | "policy" | "org";

export interface HardCommit {
  id: string;
  orgId: string;
  subgraph: CommitSubgraph;
  targetId: string;
  label: string;
  actorId: string;
  sliceHash: string;
  signature: string;
  publicKeyId: string;
  createdAt: string;
}

export interface SessionVault {
  id: string;
  orgId: string;
  deviceId: string;
  actorId: string;
  allowlistedOrigins: string[];
  enrolledAt: string;
}

export type SessionStatus = "valid" | "expired" | "revoked";

/** Metadata only — never a raw cookie or bearer token. */
export interface SessionRecord {
  id: string;
  vaultId: string;
  origin: string;
  tool: string;
  status: SessionStatus;
  cookiePresent: boolean;
  redactedHint: string;
  updatedAt: string;
}

export type BrowserJobStatus = "queued" | "running" | "done" | "failed" | "stub";

export interface BrowserJobStep {
  verb: string;
  summary: string;
  at: string;
}

export interface BrowserOperatorJob {
  id: string;
  orgId: string;
  vaultId: string | null;
  nodeId: string;
  actorId: string;
  clusterId: string | null;
  origin: string;
  intent: string;
  status: BrowserJobStatus;
  steps: BrowserJobStep[];
  createdAt: string;
}

export interface TenantToolIdentity {
  id: string;
  orgId: string;
  provider: "composio";
  enterpriseEmail: string;
  actorId: string;
  status: "active" | "invited" | "revoked";
}

export interface ConnectorEnablement {
  id: string;
  orgId: string;
  identityId: string;
  tool: string;
  enabled: boolean;
  mock: boolean;
}

export interface PromptTrace {
  id: string;
  orgId: string;
  actorId: string;
  clusterId: string | null;
  prompt: string;
  tools: string[];
  outcome: string;
  insight: string;
  occurredAt: string;
}

export interface InsightRollup {
  byInsight: Array<{ insight: string; n: number }>;
  byActor: Array<{ actorId: string; n: number }>;
  byTool: Array<{ tool: string; n: number }>;
  traceCount: number;
}

export const MANAGED_ORIGINS = [
  "https://acme.slack.com",
  "https://acme.my.salesforce.com",
  "https://app.ramp.com",
  "https://drive.google.com",
  "https://login.microsoftonline.com",
] as const;

const SECRET_KEYS = new Set(["cookie", "cookies", "secret", "token", "authorization", "password", "value", "raw"]);

export function isManagedOrigin(origin: string): boolean {
  return (MANAGED_ORIGINS as readonly string[]).includes(origin);
}

export function sessionPayloadForbidden(body: Record<string, unknown>): string | null {
  for (const key of Object.keys(body)) {
    if (SECRET_KEYS.has(key.toLowerCase())) {
      return `Refusing to store raw secret field "${key}". Put redacted session metadata only.`;
    }
  }
  return null;
}

/** Last-four placeholder. Never persist the input. */
export function redactHint(label: string): string {
  const trimmed = label.replace(/\s+/g, "");
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

export function nodeKindLabel(kind: WorkNodeKind): string {
  switch (kind) {
    case "device":
      return "Device";
    case "agent":
      return "Agent";
    case "workspace":
      return "Workspace";
    case "browser":
      return "Browser";
    default:
      return assertNever(kind);
  }
}

export function browserJobStatusLabel(status: BrowserJobStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    case "stub":
      return "Stub";
    default:
      return assertNever(status);
  }
}

export function commitSubgraphLabel(subgraph: CommitSubgraph): string {
  switch (subgraph) {
    case "matter":
      return "Matter";
    case "cluster":
      return "Cluster";
    case "policy":
      return "Policy";
    case "org":
      return "Org";
    default:
      return assertNever(subgraph);
  }
}
