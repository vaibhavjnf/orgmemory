/**
 * OrgMemory hosted worker — satellite of the control plane, not the authority.
 * Calls POST /v1/runtime/tick so suggest/fetch/tools/prompt-trace run on infra we host.
 *
 *   pnpm worker            # one tick
 *   ORGMEMORY_WORKER_POLL_MS=15000 pnpm worker
 */
const baseUrl = process.env.ORGMEMORY_API_URL ?? "http://127.0.0.1:43121";
const apiKey = process.env.ORGMEMORY_API_KEY ?? "om_demo_acme_legal";
const pollMs = Number(process.env.ORGMEMORY_WORKER_POLL_MS ?? "0");

export async function tick(clusterId?: string): Promise<unknown> {
  const res = await fetch(`${baseUrl}/v1/runtime/tick`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "x-orgmemory-actor": "user_agent",
    },
    body: JSON.stringify({ clusterId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `tick ${res.status}`);
  return json;
}

const once = pollMs <= 0;
const json = await tick(process.argv.includes("--blocked") ? "cl_4419" : "cl_rent");
console.log(JSON.stringify(json, null, 2));
if (once) process.exit(0);

setInterval(() => {
  void tick("cl_rent").then((row) => console.log(JSON.stringify(row)));
}, pollMs);
