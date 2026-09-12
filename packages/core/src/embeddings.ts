import { hash32, l2normalize, tokenize } from "./text.js";
import { assertNever } from "./types.js";

export const LOCAL_EMBEDDING_DIM = 64;

export type EmbeddingKind = "local-hash" | "openai" | "voyage";

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Offline default. Token-hashing into a fixed vector so overlapping
 * legal vocabulary ("lease", "rent", "schedule") lands nearby.
 * Swap for OpenAI / Voyage by implementing EmbeddingProvider.
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local-hash";
  readonly dimensions: number;

  constructor(dimensions = LOCAL_EMBEDDING_DIM) {
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => embedLocal(t, this.dimensions));
  }
}

/**
 * Hook for a real provider. Throws until wired with an HTTP client —
 * intentionally unused by the local demo so `pnpm dev` never calls the network.
 */
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly dimensions: number;
  constructor(
    private readonly apiKey: string,
    private readonly model = "text-embedding-3-small",
    dimensions = 1536,
  ) {
    this.dimensions = dimensions;
    void this.apiKey;
    void this.model;
  }

  async embed(_texts: string[]): Promise<number[][]> {
    throw new Error(
      "OpenAiEmbeddingProvider is a hook only. Use ORGMEMORY_EMBEDDING_PROVIDER=local-hash for the demo, or implement the HTTP call.",
    );
  }
}

export function parseEmbeddingKind(raw: string | undefined): EmbeddingKind {
  const k = (raw ?? "local-hash").toLowerCase();
  if (k === "openai") return "openai";
  if (k === "voyage") return "voyage";
  return "local-hash";
}

export function createEmbeddingProvider(kind: EmbeddingKind): EmbeddingProvider {
  switch (kind) {
    case "local-hash":
      return new LocalHashEmbeddingProvider();
    case "openai":
      return new OpenAiEmbeddingProvider(process.env.OPENAI_API_KEY ?? "");
    case "voyage":
      return new OpenAiEmbeddingProvider(process.env.VOYAGE_API_KEY ?? "", "voyage-3");
    default:
      return assertNever(kind);
  }
}

export function embedLocal(text: string, dim = LOCAL_EMBEDDING_DIM): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;
  for (const tok of tokens) {
    const h1 = hash32(tok);
    const i1 = h1 % dim;
    vec[i1] = (vec[i1] ?? 0) + ((h1 & 1) === 0 ? 1 : -1);
    const h2 = hash32(`${tok}#2`);
    const i2 = h2 % dim;
    vec[i2] = (vec[i2] ?? 0) + 0.5 * ((h2 & 1) === 0 ? 1 : -1);
  }
  return l2normalize(vec);
}

export function chunkText(
  text: string,
  opts?: { targetChars?: number; overlap?: number },
): string[] {
  const target = opts?.targetChars ?? 420;
  const overlap = opts?.overlap ?? 60;
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf.length === 0) {
      buf = p;
      continue;
    }
    if (buf.length + 2 + p.length <= target) {
      buf = `${buf}\n\n${p}`;
    } else {
      chunks.push(buf);
      const tail = buf.slice(Math.max(0, buf.length - overlap));
      buf = `${tail}\n\n${p}`.trim();
    }
  }
  if (buf) chunks.push(buf);
  if (chunks.length === 0 && text.trim()) chunks.push(text.trim());
  return chunks;
}
