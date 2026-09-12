import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LicenseMode } from "@orgmemory/core";
import { parseRankWeights, type RankWeights } from "@orgmemory/core";

const here = path.dirname(fileURLToPath(import.meta.url));

export interface OrgMemoryEnv {
  host: string;
  port: number;
  dbPath: string;
  embeddingProvider: string;
  rankWeights: RankWeights;
  licenseMode: LicenseMode;
  licenseToken: string | undefined;
  licenseSecret: string;
  blockEmployeesAfterHours: boolean;
  logLevel: string;
}

export function loadEnv(): OrgMemoryEnv {
  return {
    host: process.env.ORGMEMORY_API_HOST ?? process.env.ACS_API_HOST ?? "127.0.0.1",
    port: Number(process.env.ORGMEMORY_API_PORT ?? process.env.ACS_API_PORT ?? 43121),
    dbPath:
      process.env.ORGMEMORY_SQLITE_PATH ??
      process.env.ACS_SQLITE_PATH ??
      path.resolve(here, "../../../data/orgmemory.sqlite"),
    embeddingProvider: process.env.ORGMEMORY_EMBEDDING_PROVIDER ?? process.env.ACS_EMBEDDING_PROVIDER ?? "local-hash",
    rankWeights: parseRankWeights(process.env.ORGMEMORY_RANK_WEIGHTS),
    licenseMode: (process.env.ORGMEMORY_LICENSE_MODE as LicenseMode) ?? "cloud",
    licenseToken: process.env.ORGMEMORY_LICENSE_TOKEN,
    licenseSecret: process.env.ORGMEMORY_LICENSE_SECRET ?? "orgmemory-demo-license-secret",
    blockEmployeesAfterHours: process.env.ORGMEMORY_BLOCK_EMPLOYEES_AFTER_HOURS === "true",
    logLevel: process.env.ORGMEMORY_LOG_LEVEL ?? "info",
  };
}
