# Hermes runtime (hosted)

OrgMemory’s agent loop is a **heavily customized Hermes archetype**: always-on, tool-using, with memory, hosted browser jobs, routines, and follow-through — rebuilt as an **enterprise multi-tenant harness**.

It is **not** a port of Mac picoclaw, Ego, or OpenClaw. Those codebases stay out of this repo. We implement the *shape* (loop + tools + memory + follow-through) as `@orgmemory/harness-runtime`, with **authority on infra we host**.

## Authority

| Lives on OrgMemory-hosted infra | Satellite (not authority) |
| --- | --- |
| API, SQLite harness store | Seal Win/Mac/Linux agents |
| Timeline mirrors + hard commits | Enrolled device file watches |
| Browser job queue | Managed-origin browser pool stub |
| Composio tenant identities | Employee laptops |
| Prompt traces + hosted memory | Personal profiles / unmanaged Chrome |

The Owner Concurrent Dashboard is a **projection** of that hosted loop. Clicking Suggest on a cluster is the same plane the worker ticks.

```
apps/worker  →  POST /v1/runtime/tick
                    → @orgmemory/harness-runtime.runTenantLoop
                    → hosted ports: suggest / fetch / composio / browser / mirror / prompt_trace / remember
                    → WorkEvent (source=runtime) + PromptTrace
                    → Owner Concurrent Dashboard
```

## Loop

`planTickTools(stage)`:

| Stage | Tools |
| --- | --- |
| intake | suggest → prompt_trace → remember |
| active | suggest → fetch → prompt_trace → remember |
| blocked | suggest → composio → prompt_trace → remember |
| review | suggest → mirror → prompt_trace → remember |
| sealed | prompt_trace → remember |

Fetch is purpose-bound OKFP path when invoked via the public API; the hosted loop records the same harness `WorkEvent`s. Seal endpoints remain ingest-only satellites.

## HTTP

- `GET /v1/runtime` — tenant runtime, routines, hosted memory, recent ticks
- `POST /v1/runtime/tick` `{ clusterId?, routineId? }` — run one follow-through loop

Worker: `pnpm worker` (one tick against `:43121`).

See `docs/HARNESS.md` and `docs/CONCURRENT_FABRIC.md`.
