export type UserRole = "employee" | "manager" | "admin" | "agent";

export type ConnectorKind =
  | "google_drive"
  | "onedrive"
  | "dropbox"
  | "linux_fs"
  | "slack"
  | "salesforce"
  | "ramp"
  | "composio";

export type ConnectorStatus = "healthy" | "degraded" | "stub" | "unenrolled" | "error";

export type AuditAction =
  | "suggest"
  | "fetch"
  | "fetch_denied"
  | "sync"
  | "receipt_verify"
  | "seal_ingest"
  | "seal_enroll"
  | "mirror_rollback"
  | "hard_commit"
  | "vault_enroll"
  | "browser_job"
  | "prompt_trace"
  | "runtime_tick";

export type PolicyDecision = "allow" | "deny";

export type ProductLayer = "suggest" | "atlas" | "seal" | "license";

export const PRODUCT_LAYER_NAMES: Record<ProductLayer, string> = {
  suggest: "OrgMemory Suggest",
  atlas: "OrgMemory Atlas",
  seal: "OrgMemory Seal",
  license: "OrgMemory License",
};

export type LicenseMode = "cloud" | "onprem" | "oem";

export interface Org {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface User {
  id: string;
  orgId: string;
  email: string;
  displayName: string;
  role: UserRole;
  apiKey?: string;
  /** Set when this principal is a service agent (may equal id). */
  agentId: string | null;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description: string;
}

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: "member" | "lead";
}

export interface Connector {
  id: string;
  orgId: string;
  kind: ConnectorKind;
  displayName: string;
  status: ConnectorStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  fileCount: number;
}

export interface Acl {
  ownerId: string;
  sharedWith: string[];
}

export interface SourceFile {
  id: string;
  orgId: string;
  connectorId: string;
  projectId: string | null;
  externalId: string;
  name: string;
  mimeType: string;
  path: string;
  acl: Acl;
  content: string | null;
  contentHash: string;
  metadata: Record<string, string>;
  authorRole: UserRole;
  matterId: string | null;
  createdAt: string;
  modifiedAt: string;
  indexedAt: string | null;
  reuseCount: number;
}

export interface Chunk {
  id: string;
  fileId: string;
  orgId: string;
  ordinal: number;
  text: string;
  embedding: number[];
  tokenCount: number;
}

/** Official Midnight Suggest factors. Not pure cosine. */
export type RankFactor =
  | "embedding_similarity"
  | "recency"
  | "reuse"
  | "authority"
  | "project_affinity"
  | "acl_reachable";

export interface RankWeights {
  sim: number;
  recency: number;
  reuse: number;
  authority: number;
  project: number;
  acl: number;
}

export interface WhyScore {
  factor: RankFactor;
  weight: number;
  raw: number;
  contribution: number;
  note: string;
}

export interface Suggestion {
  id: string;
  fileId: string;
  chunkId: string;
  score: number;
  snippet: string;
  why: WhyScore[];
  file: SourceFile;
}

export interface AuditEvent {
  id: string;
  orgId: string;
  actorId: string;
  agentId: string | null;
  action: AuditAction;
  purpose: string | null;
  matterId: string | null;
  ticketId: string | null;
  fileId: string | null;
  suggestionId: string | null;
  query: string | null;
  aclSnapshot: Acl | null;
  contentHash: string | null;
  receiptId: string | null;
  decision: PolicyDecision;
  metadata: Record<string, string>;
  createdAt: string;
}

export const OKFP_VERSION = "okfp-1" as const;
export type OkfpVersion = typeof OKFP_VERSION;

/** Unsigned canonical payload that is ed25519-signed. */
export interface OkfpReceiptBody {
  v: OkfpVersion;
  id: string;
  orgId: string;
  actorId: string;
  agentId: string | null;
  fileId: string;
  suggestionId: string | null;
  purpose: string;
  matterId: string | null;
  ticketId: string | null;
  aclSnapshot: Acl;
  contentHash: string;
  issuedAt: string;
}

export interface OkfpReceipt extends OkfpReceiptBody {
  signature: string;
  publicKeyId: string;
  alg: "ed25519";
}

export interface SkillNode {
  id: string;
  orgId: string;
  name: string;
  parentId: string | null;
  kind: "domain" | "matter" | "tooling";
  description: string;
}

/** Producer → reuse edge for the Atlas provenance graph. */
export interface SkillEdge {
  id: string;
  orgId: string;
  fromNodeId: string;
  toNodeId: string;
  fileId: string;
  producerId: string;
  reuseCount: number;
}

export interface SuggestRequest {
  query: string;
  context?: string;
  projectId?: string;
  limit?: number;
}

export interface FetchRequest {
  fileId: string;
  purpose: string;
  matterId?: string;
  ticketId?: string;
  suggestionId?: string;
  includeContent?: boolean;
}

export interface LicenseFeatures {
  suggest: boolean;
  receipts: boolean;
  atlas: boolean;
}

export interface LicenseClaims {
  iss: "orgmemory-license";
  sub: string;
  mode: LicenseMode;
  features: LicenseFeatures;
  iat: number;
  exp: number;
}

export function canReadFile(user: User, file: SourceFile): boolean {
  if (user.orgId !== file.orgId) return false;
  if (user.role === "manager" || user.role === "admin") return true;
  if (file.acl.ownerId === user.id) return true;
  return file.acl.sharedWith.includes(user.id);
}

export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unhandled variant: ${String(value)}`);
}
