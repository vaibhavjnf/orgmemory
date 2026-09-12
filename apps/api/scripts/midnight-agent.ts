/**
 * Midnight agent: suggest → fetch → verifyReceipt.
 * Run after `pnpm dev` (API on :43121):
 *   pnpm --filter @orgmemory/api exec tsx scripts/midnight-agent.ts
 */
import { OrgMemoryClient } from "@orgmemory/sdk";

const client = new OrgMemoryClient({
  baseUrl: process.env.ORGMEMORY_API_URL ?? "http://127.0.0.1:43121",
  apiKey: process.env.ORGMEMORY_API_KEY ?? "om_demo_acme_legal",
  actorId: "user_agent",
});

const suggest = await client.suggest({
  query: "lease rent schedule",
  context: "Drafting an HQ rent amendment at 00:30. Need executed Exhibit B.",
  projectId: "proj_re",
});

const top = suggest.suggestions[0];
if (!top) throw new Error("No suggestions — seed missing?");

const fetched = await client.fetch({
  fileId: top.fileId,
  suggestionId: top.id,
  purpose: "Draft HQ rent amendment at 00:30 without pinging a human",
  matterId: top.file.matterId ?? "matter_hq",
});

const verified = await client.verifyReceipt(fetched.receipt);
console.log(
  JSON.stringify(
    {
      hit: top.file.name,
      score: top.score,
      receiptId: fetched.receipt.id,
      verified: verified.ok,
      auditId: fetched.auditId,
    },
    null,
    2,
  ),
);
