import type { RankFactor, RankWeights, SourceFile, User, UserRole, WhyScore } from "./types.js";
import { assertNever } from "./types.js";
import { cosineSimilarity, jaccard, tokenize } from "./text.js";

/**
 * Midnight Suggest weights. Exposed via config (`ORGMEMORY_RANK_WEIGHTS`).
 * Intentionally not pure embedding cosine — reuse, recency, authority,
 * project affinity, and ACL reachability are first-class.
 */
export const DEFAULT_MIDNIGHT_WEIGHTS: RankWeights = {
  sim: 0.34,
  recency: 0.14,
  reuse: 0.18,
  authority: 0.12,
  project: 0.12,
  acl: 0.1,
};

export interface RankInput {
  query: string;
  context?: string;
  queryEmbedding: number[];
  chunkText: string;
  chunkEmbedding: number[];
  file: SourceFile;
  reuseCount: number;
  actor: User;
  queryProjectId?: string | null;
  authorRole: UserRole;
  now?: Date;
  weights?: RankWeights;
}

export interface RankResult {
  score: number;
  why: WhyScore[];
  /** Blended similarity (cosine + lexical) before other midnight factors. */
  sim: number;
}

export function parseRankWeights(raw: string | undefined): RankWeights {
  if (!raw) return { ...DEFAULT_MIDNIGHT_WEIGHTS };
  const next = { ...DEFAULT_MIDNIGHT_WEIGHTS };
  for (const part of raw.split(",")) {
    const [k, v] = part.split(":").map((s) => s.trim());
    const n = Number(v);
    if (!k || Number.isNaN(n)) continue;
    switch (k) {
      case "sim":
      case "recency":
      case "reuse":
      case "authority":
      case "project":
      case "acl":
        next[k] = n;
        break;
      default:
        break;
    }
  }
  return next;
}

function recencyScore(modifiedAt: string, now: Date): number {
  const then = new Date(modifiedAt).getTime();
  if (Number.isNaN(then)) return 0;
  const days = Math.max(0, (now.getTime() - then) / (1000 * 60 * 60 * 24));
  return Math.exp(-days / 180);
}

/** log-scaled so a wildly popular file cannot drown the formula. */
export function reuseScore(count: number): number {
  if (count <= 0) return 0;
  return Math.min(1, Math.log2(1 + count) / 4);
}

export function authorityScore(role: UserRole): number {
  switch (role) {
    case "admin":
      return 1;
    case "manager":
      return 0.92;
    case "employee":
      return 0.48;
    case "agent":
      return 0.28;
    default: {
      return assertNever(role);
    }
  }
}

export function projectAffinity(queryProjectId: string | null | undefined, fileProjectId: string | null): number {
  if (!queryProjectId) return 0.45;
  if (!fileProjectId) return 0.25;
  if (queryProjectId === fileProjectId) return 1;
  return 0.12;
}

export function aclReachable(actor: User, file: SourceFile): { raw: number; note: string } {
  if (file.acl.ownerId === actor.id) {
    return { raw: 1, note: "Owner — fully reachable" };
  }
  if (file.acl.sharedWith.includes(actor.id)) {
    return { raw: 0.78, note: "Shared with actor" };
  }
  if (actor.role === "manager" || actor.role === "admin") {
    return { raw: 0.4, note: "Manager-scope reach (not a substitute for ACL)" };
  }
  return { raw: 0, note: "Not reachable under inherited ACL" };
}

function factorNote(factor: RankFactor, raw: number): string {
  switch (factor) {
    case "embedding_similarity":
      return raw > 0.55
        ? "Query is close to this chunk (cosine + lexical blend)"
        : "Weak similarity; other midnight factors may still promote it";
    case "recency":
      return raw > 0.65 ? "Recently touched prior work" : "Older artifact; still in the overlay index";
    case "reuse":
      return raw > 0.35
        ? "Org has officially fetched this before"
        : "Little official reuse yet";
    case "authority":
      return raw > 0.8 ? "Produced by a partner/manager" : "Produced by an IC or agent";
    case "project_affinity":
      return raw > 0.9 ? "Same project as the draft context" : "Cross-project candidate";
    case "acl_reachable":
      return "ACL reachability (inherited owner + sharedWith)";
    default:
      return assertNever(factor);
  }
}

export function weigh(input: RankInput): RankResult {
  const now = input.now ?? new Date();
  const weights = input.weights ?? DEFAULT_MIDNIGHT_WEIGHTS;
  const qTokens = tokenize(`${input.query} ${input.context ?? ""}`);
  const cTokens = tokenize(input.chunkText);
  const cosine = cosineSimilarity(input.queryEmbedding, input.chunkEmbedding);
  const lexical = jaccard(qTokens, cTokens);
  const sim = clamp01(0.65 * cosine + 0.35 * lexical);

  const recency = recencyScore(input.file.modifiedAt, now);
  const reuse = reuseScore(input.reuseCount);
  const authority = authorityScore(input.authorRole);
  const project = projectAffinity(input.queryProjectId, input.file.projectId);
  const acl = aclReachable(input.actor, input.file);

  const rawByFactor: Record<RankFactor, number> = {
    embedding_similarity: sim,
    recency: clamp01(recency),
    reuse: clamp01(reuse),
    authority: clamp01(authority),
    project_affinity: clamp01(project),
    acl_reachable: clamp01(acl.raw),
  };

  const weightByFactor: Record<RankFactor, number> = {
    embedding_similarity: weights.sim,
    recency: weights.recency,
    reuse: weights.reuse,
    authority: weights.authority,
    project_affinity: weights.project,
    acl_reachable: weights.acl,
  };

  const why: WhyScore[] = (Object.keys(rawByFactor) as RankFactor[]).map((factor) => {
    const weight = weightByFactor[factor];
    const raw = rawByFactor[factor];
    const note = factor === "acl_reachable" ? acl.note : factorNote(factor, raw);
    return {
      factor,
      weight,
      raw,
      contribution: weight * raw,
      note,
    };
  });

  const score = why.reduce((s, w) => s + w.contribution, 0);
  why.sort((a, b) => b.contribution - a.contribution);
  return { score, why, sim };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function pickSnippet(text: string, query: string, max = 220): string {
  const tokens = tokenize(query);
  const lower = text.toLowerCase();
  let idx = 0;
  for (const t of tokens) {
    const at = lower.indexOf(t);
    if (at >= 0) {
      idx = at;
      break;
    }
  }
  const start = Math.max(0, idx - 40);
  const slice = text.slice(start, start + max).trim();
  const prefix = start > 0 ? "…" : "";
  const suffix = start + max < text.length ? "…" : "";
  return `${prefix}${slice}${suffix}`;
}
