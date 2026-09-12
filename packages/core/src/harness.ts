import type { UserRole } from "./types.js";
import { assertNever } from "./types.js";

export type WorkStage = "intake" | "active" | "blocked" | "review" | "sealed";

export type ActivitySource =
  | "google_drive"
  | "onedrive"
  | "dropbox"
  | "linux_fs"
  | "slack"
  | "salesforce"
  | "ramp"
  | "seal"
  | "suggest"
  | "fetch"
  | "composio"
  | "prompt"
  | "mirror"
  | "commit"
  | "vault"
  | "browser"
  | "node"
  | "runtime";

export type ArtifactKind = "file" | "message" | "record" | "expense" | "receipt";

/** Harness actor — a person or agent in a department/team. */
export interface Actor {
  id: string;
  orgId: string;
  displayName: string;
  department: string;
  team: string;
  role: UserRole;
}

export interface Artifact {
  id: string;
  orgId: string;
  clusterId: string | null;
  kind: ArtifactKind;
  title: string;
  source: ActivitySource;
  ref: string;
  createdAt: string;
}

export interface WorkEvent {
  id: string;
  orgId: string;
  clusterId: string | null;
  actorId: string;
  nodeId: string | null;
  source: ActivitySource;
  verb: string;
  summary: string;
  artifactId: string | null;
  occurredAt: string;
}

/** Concurrent unit of work the owner dashboard rows on. */
export interface WorkCluster {
  id: string;
  orgId: string;
  department: string;
  team: string;
  title: string;
  stage: WorkStage;
  ownerActorId: string;
  actorIds: string[];
  nodeIds: string[];
  frozenCommitId: string | null;
  updatedAt: string;
}

/** OKFP receipt projected into the harness graph. */
export interface Receipt {
  id: string;
  orgId: string;
  clusterId: string | null;
  artifactId: string | null;
  actorId: string;
  purpose: string;
  issuedAt: string;
}

export interface ActivityConnector {
  readonly kind: ActivitySource;
  readonly displayName: string;
  pull(orgId: string): ConnectorDraft[];
}

export interface ConnectorDraft {
  externalId: string;
  actorId: string;
  verb: string;
  summary: string;
  occurredAt: string;
  artifact?: {
    kind: ArtifactKind;
    title: string;
    ref: string;
  };
  clusterHint: string;
}

export function stageLabel(stage: WorkStage): string {
  switch (stage) {
    case "intake":
      return "Intake";
    case "active":
      return "Active";
    case "blocked":
      return "Blocked";
    case "review":
      return "Review";
    case "sealed":
      return "Sealed";
    default:
      return assertNever(stage);
  }
}

export function sourceLabel(source: ActivitySource): string {
  switch (source) {
    case "google_drive":
      return "Google Drive";
    case "onedrive":
      return "OneDrive";
    case "dropbox":
      return "Dropbox";
    case "linux_fs":
      return "Linux FS";
    case "slack":
      return "Slack";
    case "salesforce":
      return "Salesforce";
    case "ramp":
      return "Ramp";
    case "seal":
      return "Seal";
    case "suggest":
      return "Suggest";
    case "fetch":
      return "Fetch";
    case "composio":
      return "Composio";
    case "prompt":
      return "Prompt";
    case "mirror":
      return "Mirror";
    case "commit":
      return "Commit";
    case "vault":
      return "Vault";
    case "browser":
      return "Browser";
    case "node":
      return "Node";
    case "runtime":
      return "Runtime";
    default:
      return assertNever(source);
  }
}
