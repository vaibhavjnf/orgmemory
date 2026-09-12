import { checkLicense } from "@orgmemory/license";
import { createEmbeddingProvider, parseEmbeddingKind } from "@orgmemory/core";
import { buildApp } from "./app.js";
import { openDb } from "./db/store.js";
import { seedIfEmpty } from "./db/seed.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const db = openDb(env.dbPath);
await seedIfEmpty(db, {
  embedding: createEmbeddingProvider(parseEmbeddingKind(env.embeddingProvider)),
});
const license = checkLicense({
  mode: env.licenseMode,
  token: env.licenseToken,
  secret: env.licenseSecret,
});

const app = await buildApp({ db, env, license });
await app.listen({ host: env.host, port: env.port });
console.log(`OrgMemory API on http://${env.host}:${env.port}  (license ${license.ok ? "ok" : "blocked"})`);
