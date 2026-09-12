export type ActorId = "user_agent" | "user_jordan" | "user_priya" | "user_sam";

export const ACTORS: { id: ActorId; name: string; role: string; key: string }[] = [
  { id: "user_agent", name: "Night Agent", role: "agent", key: "om_demo_acme_legal" },
  { id: "user_jordan", name: "Jordan Hale", role: "associate", key: "om_demo_jordan" },
  { id: "user_priya", name: "Priya Shah", role: "partner", key: "om_demo_priya" },
  { id: "user_sam", name: "Sam Ortiz", role: "KB only", key: "om_demo_sam" },
];

async function api<T>(
  path: string,
  actor: ActorId,
  init?: RequestInit,
): Promise<T> {
  const a = ACTORS.find((x) => x.id === actor) ?? ACTORS[0]!;
  const res = await fetch(path, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${a.key}`,
      "x-orgmemory-actor": actor,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? `${res.status} ${path}`);
  }
  return json;
}

export const orgmemory = {
  health: () => fetch("/v1/health").then((r) => r.json()),
  me: (actor: ActorId) => api("/v1/me", actor),
  connectors: (actor: ActorId) => api<{ connectors: Connector[] }>("/v1/connectors", actor),
  harness: (actor: ActorId) => api<OwnerBoard>("/v1/harness", actor),
  cluster: (actor: ActorId, id: string) => api<ClusterBriefing>(`/v1/harness/clusters/${id}`, actor),
  mirrors: (actor: ActorId) => api<{ mirrors: TimelineMirror[] }>("/v1/mirrors", actor),
  createMirror: (actor: ActorId, label: string) =>
    api<{ mirror: TimelineMirror }>("/v1/mirrors", actor, { method: "POST", body: JSON.stringify({ label }) }),
  rollback: (actor: ActorId, id: string) =>
    api<{ receipt: { id: string; purpose: string; signature: string }; mirror: TimelineMirror }>(
      `/v1/mirrors/${id}/rollback`,
      actor,
      { method: "POST", body: JSON.stringify({}) },
    ),
  commits: (actor: ActorId) => api<{ commits: HardCommit[] }>("/v1/commits", actor),
  commitCluster: (actor: ActorId, body: { clusterId: string; label: string }) =>
    api<{ commit: HardCommit }>("/v1/commits", actor, { method: "POST", body: JSON.stringify(body) }),
  vaults: (actor: ActorId) => api<{ vaults: SessionVault[]; ethics: string }>("/v1/vaults", actor),
  jobs: (actor: ActorId) => api<{ jobs: BrowserJob[] }>("/v1/browser/jobs", actor),
  identities: (actor: ActorId) =>
    api<{ identities: ToolIdentity[]; enablements: Enablement[] }>("/v1/tools/identities", actor),
  insights: (actor: ActorId) => api<{ rollup: InsightRollup; note: string }>("/v1/insights", actor),
  runtime: (actor: ActorId) => api<RuntimeStatus>("/v1/runtime", actor),
  runtimeTick: (actor: ActorId, body?: { clusterId?: string; routineId?: string }) =>
    api<{ tick: RuntimeTick; runtime: RuntimeStatus }>("/v1/runtime/tick", actor, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  audit: (actor: ActorId) => api<{ events: Audit[]; scope: string }>("/v1/audit?limit=40", actor),
  reuse: (actor: ActorId) => api<{ documents: Reused[] }>("/v1/reuse", actor),
  atlas: (actor: ActorId) => api<Atlas>("/v1/atlas", actor),
  sealDevices: (actor: ActorId) => api<{ devices: SealDevice[] }>("/v1/seal/devices", actor),
  suggest: (actor: ActorId, body: { query: string; context?: string; projectId?: string; clusterId?: string }) =>
    api<SuggestRes>("/v1/suggest", actor, { method: "POST", body: JSON.stringify(body) }),
  fetchFile: (
    actor: ActorId,
    body: { fileId: string; purpose: string; suggestionId?: string; matterId?: string; clusterId?: string },
  ) => api<FetchRes>("/v1/fetch", actor, { method: "POST", body: JSON.stringify(body) }),
  verify: (actor: ActorId, receipt: unknown) =>
    api<{ ok: boolean; reason?: string }>("/v1/receipts/verify", actor, {
      method: "POST",
      body: JSON.stringify({ receipt }),
    }),
};

export interface Connector {
  id: string;
  kind: string;
  displayName: string;
  status: string;
  fileCount: number;
  lastSyncAt: string | null;
}

export interface Why {
  factor: string;
  weight: number;
  raw: number;
  contribution: number;
  note: string;
}

export interface Suggestion {
  id: string;
  fileId: string;
  score: number;
  snippet: string;
  why: Why[];
  file: { id: string; name: string; path: string; projectId: string | null; matterId: string | null };
}

export interface SuggestRes {
  suggestionBatchId: string;
  suggestions: Suggestion[];
  auditId: string;
}

export interface FetchRes {
  content: string | null;
  receipt: {
    id: string;
    purpose: string;
    signature: string;
    contentHash: string;
    issuedAt: string;
    actorId: string;
    agentId: string | null;
    fileId: string;
    suggestionId: string | null;
  };
  auditId: string;
  workEventId?: string;
  clusterId?: string | null;
}

export interface WorkEvent {
  id: string;
  clusterId: string | null;
  actorId: string;
  source: string;
  verb: string;
  summary: string;
  artifactId: string | null;
  occurredAt: string;
}

export interface Artifact {
  id: string;
  clusterId: string | null;
  kind: string;
  title: string;
  source: string;
  ref: string;
  createdAt: string;
}

export interface HarnessReceipt {
  id: string;
  clusterId: string | null;
  artifactId: string | null;
  actorId: string;
  purpose: string;
  issuedAt: string;
}

export interface ClusterCard {
  id: string;
  department: string;
  team: string;
  title: string;
  stage: "intake" | "active" | "blocked" | "review" | "sealed";
  ownerActorId: string;
  actorIds: string[];
  nodeIds?: string[];
  frozenCommitId?: string | null;
  updatedAt: string;
  artifactCount?: number;
  recentEvents?: WorkEvent[];
  nodes?: Array<{ id: string; label: string; kind: string }>;
}

export interface OwnerBoard {
  identity: "harness";
  bus: string;
  actors: Array<{ id: string; displayName: string; department: string; team: string; role: string }>;
  nodes: Array<{ id: string; label: string; kind: string; department: string; actorId: string; online: boolean }>;
  departments: Array<{
    department: string;
    teams: Array<{ team: string; clusters: ClusterCard[] }>;
  }>;
  sources: Array<{ source: string; events: number }>;
  clusterCount: number;
  eventCount: number;
}

export interface TimelineMirror {
  id: string;
  label: string;
  createdBy: string;
  createdAt: string;
  sliceHash: string;
  clusterCount: number;
  eventCount: number;
}

export interface HardCommit {
  id: string;
  subgraph: string;
  targetId: string;
  label: string;
  actorId: string;
  sliceHash: string;
  createdAt: string;
}

export interface SessionVault {
  id: string;
  deviceId: string;
  actorId: string;
  allowlistedOrigins: string[];
  sessions?: Array<{ origin: string; tool: string; redactedHint: string; status: string }>;
}

export interface BrowserJob {
  id: string;
  origin: string;
  intent: string;
  status: string;
  nodeId: string;
  clusterId: string | null;
}

export interface ToolIdentity {
  id: string;
  enterpriseEmail: string;
  provider: string;
  status: string;
}

export interface Enablement {
  tool: string;
  enabled: boolean;
  mock: boolean;
}

export interface InsightRollup {
  byInsight: Array<{ insight: string; n: number }>;
  byActor: Array<{ actorId: string; n: number }>;
  byTool: Array<{ tool: string; n: number }>;
  traceCount: number;
}

export interface RuntimeTick {
  id: string;
  routineId: string;
  clusterId: string;
  steps: Array<{ tool: string; ok: boolean; summary: string }>;
  startedAt: string;
  finishedAt: string;
}

export interface RuntimeStatus {
  archetype: string;
  authority: string;
  driver?: string;
  runtime?: {
    id: string;
    label: string;
    status: string;
    lastTickAt: string | null;
  };
  routines: Array<{ id: string; title: string; clusterId: string; cadence: string }>;
  memory: Array<{ key: string; value: string }>;
  ticks: RuntimeTick[];
}

export interface ClusterBriefing {
  cluster: ClusterCard;
  actors: Array<{ id: string; displayName: string; department: string; team: string; role: string }>;
  artifacts: Artifact[];
  events: WorkEvent[];
  receipts: HarnessReceipt[];
}

export interface Audit {
  id: string;
  actorId: string;
  agentId: string | null;
  action: string;
  purpose: string | null;
  fileId: string | null;
  receiptId: string | null;
  decision: string;
  createdAt: string;
}

export interface Reused {
  fetches: number;
  file: { id: string; name: string; path: string };
}

export interface Atlas {
  nodes: { id: string; name: string; kind: string; description: string; parentId: string | null }[];
  edges: { id: string; fromNodeId: string; toNodeId: string; fileId: string; producerId: string; reuseCount: number }[];
  reused: Reused[];
  devices: SealDevice[];
  insights?: InsightRollup;
  traces?: Array<{ id: string; actorId: string; prompt: string; insight: string; outcome: string }>;
}

export interface SealDevice {
  id: string;
  hostname: string;
  os: "linux" | "windows" | "darwin";
  osUser: string;
  integrityTier: "T0" | "T1" | "T2" | "T3";
  degradeReason: string | null;
  lastHeartbeatAt: string | null;
}
