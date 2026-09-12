import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { ALL_FEATURES, checkLicense, issueLicense } from "@orgmemory/license";

const port = Number(process.env.ORGMEMORY_LICENSE_PORT ?? 43123);
const secret = process.env.ORGMEMORY_LICENSE_SECRET ?? "orgmemory-demo-license-secret";

const issueBody = z.object({
  sub: z.string().min(1),
  mode: z.enum(["cloud", "onprem", "oem"]),
  features: z
    .object({
      suggest: z.boolean(),
      receipts: z.boolean(),
      atlas: z.boolean(),
    })
    .optional(),
  days: z.number().int().positive().optional(),
});

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

app.get("/v1/health", async () => ({
  ok: true,
  service: "orgmemory-license",
  product: "OrgMemory License",
}));

app.post("/v1/licenses/issue", async (req, reply) => {
  const parsed = issueBody.safeParse(req.body);
  if (!parsed.success) return reply.status(400).send({ error: "invalid issue payload" });
  const now = Math.floor(Date.now() / 1000);
  const token = issueLicense(secret, {
    sub: parsed.data.sub,
    mode: parsed.data.mode,
    features: parsed.data.features ?? ALL_FEATURES,
    iat: now,
    exp: now + 86400 * (parsed.data.days ?? 365),
  });
  return { token };
});

app.post("/v1/licenses/validate", async (req, reply) => {
  const token = (req.body as { token?: string } | undefined)?.token;
  const check = checkLicense({
    mode: "onprem",
    token,
    secret,
  });
  return check;
});

await app.listen({ host: "127.0.0.1", port });
console.log(`OrgMemory License on http://127.0.0.1:${port}`);
