import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACTORS,
  type ActorId,
  type Atlas,
  type Audit,
  type Connector,
  type FetchRes,
  type Reused,
  type Suggestion,
  orgmemory,
} from "./api";
import { OwnerBoardView } from "./OwnerBoard";

type Page = "owner" | "console" | "suggest" | "seal" | "atlas";

export function App() {
  const [page, setPage] = useState<Page>("owner");
  const [actor, setActor] = useState<ActorId>("user_agent");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-ink text-paper">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-line lg:w-60 lg:border-b-0 lg:border-r">
          <div className="px-5 py-6">
            <div className="text-[11px] tracking-[0.22em] text-brass uppercase">OrgMemory</div>
            <h1 className="serif mt-1 text-2xl font-medium text-paper">Official memory</h1>
            <p className="mt-2 text-xs leading-5 text-paper/60">
              Organizational agent harness. The dashboard is a projection of harness state — not a chatbot skin.
            </p>
          </div>
          <nav className="flex gap-1 px-3 pb-4 lg:flex-col">
            {(
              [
                ["owner", "Owner"],
                ["console", "Console"],
                ["suggest", "Suggest"],
                ["seal", "Seal"],
                ["atlas", "Atlas"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPage(id)}
                className={`rounded-md px-3 py-2 text-left text-sm ${
                  page === id ? "bg-ink-2 text-brass-2" : "text-paper/70 hover:text-paper"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="hidden border-t border-line px-4 py-4 lg:block">
            <div className="text-[10px] tracking-widest text-paper/40 uppercase">Actor</div>
            <select
              className="mt-2 w-full rounded-md border border-line bg-ink-2 px-2 py-2 text-sm"
              value={actor}
              onChange={(e) => setActor(e.target.value as ActorId)}
            >
              {ACTORS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.role}
                </option>
              ))}
            </select>
          </div>
        </aside>
        <main className="flex-1 px-4 py-6 lg:px-10">
          <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] tracking-[0.18em] text-brass uppercase">Acme Legal</div>
              <h2 className="serif text-3xl text-paper">
                {page === "owner" && "Concurrent work"}
                {page === "console" && "Org overlay"}
                {page === "suggest" && "OrgMemory Suggest"}
                {page === "seal" && "OrgMemory Seal"}
                {page === "atlas" && "OrgMemory Atlas"}
              </h2>
            </div>
            <label className="lg:hidden text-sm">
              Actor
              <select
                className="ml-2 rounded-md border border-line bg-ink-2 px-2 py-1"
                value={actor}
                onChange={(e) => setActor(e.target.value as ActorId)}
              >
                {ACTORS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </header>
          {error ? (
            <div className="mb-4 rounded-md border border-seal/40 bg-seal/10 px-3 py-2 text-sm text-paper">
              {error}
            </div>
          ) : null}
          {page === "owner" ? <OwnerBoardView actor={actor} onError={setError} /> : null}
          {page === "console" ? <Console actor={actor} onError={setError} /> : null}
          {page === "suggest" ? <Suggest actor={actor} onError={setError} /> : null}
          {page === "seal" ? <Seal actor={actor} onError={setError} /> : null}
          {page === "atlas" ? <AtlasView actor={actor} onError={setError} /> : null}
        </main>
      </div>
    </div>
  );
}

function Console({ actor, onError }: { actor: ActorId; onError: (s: string | null) => void }) {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [reused, setReused] = useState<Reused[]>([]);
  const [events, setEvents] = useState<Audit[]>([]);
  useEffect(() => {
    onError(null);
    Promise.all([orgmemory.connectors(actor), orgmemory.reuse(actor), orgmemory.audit(actor)])
      .then(([c, r, a]) => {
        setConnectors(c.connectors);
        setReused(r.documents);
        setEvents(a.events.slice(0, 8));
      })
      .catch((e: Error) => onError(e.message));
  }, [actor, onError]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-line bg-ink-2 p-5">
        <h3 className="serif text-xl">Connectors</h3>
        <p className="mt-1 text-xs text-paper/50">
          File overlay plus activity stubs (Slack, Salesforce, Ramp). Canonical files stay in Drive / OneDrive / Dropbox.
        </p>
        <ul className="mt-4 space-y-3">
          {connectors.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <div className="font-medium">{c.displayName}</div>
                <div className="text-xs text-paper/50">
                  {isActivityKind(c.kind) ? "Activity bus (stub)" : `${c.fileCount} indexed files`}
                </div>
              </div>
              <StatusPill status={c.status} />
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-line bg-ink-2 p-5">
        <h3 className="serif text-xl">Top reused</h3>
        <p className="mt-1 text-xs text-paper/50">Official fetches only — not opens in Drive.</p>
        <ul className="mt-4 space-y-3">
          {reused.length === 0 ? <Empty>No official fetches yet. Run Suggest → Fetch.</Empty> : null}
          {reused.map((d) => (
            <li key={d.file.id} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{d.file.name}</span>
                <span className="text-brass">{d.fetches}×</span>
              </div>
              <div className="text-xs text-paper/45">{d.file.path}</div>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-line bg-ink-2 p-5 lg:col-span-2">
        <h3 className="serif text-xl">Recent audits</h3>
        <p className="mt-1 text-xs text-paper/50">Employee-visible. Managers see the org; ICs see themselves.</p>
        <AuditTable events={events} />
      </section>
    </div>
  );
}

function Suggest({ actor, onError }: { actor: ActorId; onError: (s: string | null) => void }) {
  const [query, setQuery] = useState("lease rent schedule");
  const [context, setContext] = useState("Drafting an HQ rent amendment at 00:30. Need executed Exhibit B figures.");
  const [purpose, setPurpose] = useState("Draft HQ rent amendment at 00:30 without pinging a partner");
  const [hits, setHits] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [fetched, setFetched] = useState<FetchRes | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);

  const run = async () => {
    setBusy(true);
    onError(null);
    setFetched(null);
    setVerified(null);
    try {
      const res = await orgmemory.suggest(actor, { query, context, projectId: "proj_re" });
      setHits(res.suggestions);
    } catch (e) {
      onError(e instanceof Error ? e.message : "suggest failed");
    } finally {
      setBusy(false);
    }
  };

  const pull = async (s: Suggestion) => {
    setBusy(true);
    onError(null);
    try {
      const res = await orgmemory.fetchFile(actor, {
        fileId: s.fileId,
        suggestionId: s.id,
        purpose,
        matterId: s.file.matterId ?? undefined,
      });
      setFetched(res);
      const v = await orgmemory.verify(actor, res.receipt);
      setVerified(v.ok);
    } catch (e) {
      onError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="rounded-xl border border-line bg-ink-2 p-5">
        <h3 className="serif text-xl">OrgMemory Suggest</h3>
        <p className="mt-1 text-xs text-paper/50">
          Same calls an agent makes at midnight. No colleague is pinged. Their laptop can be off.
        </p>
        <label className="mt-4 block text-xs text-paper/60">
          Query
          <input
            className="mt-1 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-xs text-paper/60">
          Draft context
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm"
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-xs text-paper/60">
          Fetch purpose (required by OKFP)
          <input
            className="mt-1 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="mt-4 rounded-md bg-brass px-4 py-2 text-sm font-medium text-ink hover:bg-brass-2 disabled:opacity-50"
        >
          {busy ? "Weighing…" : "Suggest"}
        </button>
      </section>
      <section className="rounded-xl border border-line bg-ink-2 p-5">
        <h3 className="serif text-xl">Ranked prior work</h3>
        {hits.length === 0 ? <Empty>Run suggest. Seeded query is “lease rent schedule”.</Empty> : null}
        <ul className="mt-3 space-y-4">
          {hits.map((h) => (
            <li key={h.id} className="border-b border-line/80 pb-4 last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{h.file.name}</div>
                  <div className="text-xs text-paper/45">{h.file.path}</div>
                </div>
                <div className="text-sm text-brass">{h.score.toFixed(3)}</div>
              </div>
              <p className="mt-2 text-xs leading-5 text-paper/70">{h.snippet}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {h.why.slice(0, 4).map((w) => (
                  <span key={w.factor} className="rounded-full border border-line px-2 py-0.5 text-[10px] text-paper/60">
                    {w.factor.replaceAll("_", " ")} {(w.contribution * 100).toFixed(0)}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="mt-3 text-xs text-brass underline"
                onClick={() => void pull(h)}
              >
                Fetch + seal
              </button>
            </li>
          ))}
        </ul>
        {fetched ? (
          <div className="mt-4 rounded-lg border border-brass/30 bg-ink p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-brass">OKFP receipt {fetched.receipt.id}</span>
              <span className={verified ? "text-moss" : "text-seal"}>{verified ? "verified" : "unverified"}</span>
            </div>
            <div className="mt-2 text-paper/60">audit {fetched.auditId}</div>
            <pre className="mt-2 max-h-40 overflow-auto text-[10px] leading-4 text-paper/70">
              {JSON.stringify(fetched.receipt, null, 2)}
            </pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Seal({ actor, onError }: { actor: ActorId; onError: (s: string | null) => void }) {
  const [events, setEvents] = useState<Audit[]>([]);
  const [scope, setScope] = useState("");
  const load = useCallback(() => {
    onError(null);
    orgmemory
      .audit(actor)
      .then((a) => {
        setEvents(a.events);
        setScope(a.scope);
      })
      .catch((e: Error) => onError(e.message));
  }, [actor, onError]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="rounded-xl border border-line bg-ink-2 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="serif text-xl">OrgMemory Seal</h3>
          <p className="mt-1 text-xs text-paper/50">
            Scope: {scope || "—"}. Every fetch is an official org event with purpose, ACL snapshot, content hash, and
            an ed25519 receipt. OrgMemory Seal is the cryptographic ledger — not surveillance.
          </p>
        </div>
        <button type="button" className="text-xs text-brass underline" onClick={load}>
          Refresh
        </button>
      </div>
      <AuditTable events={events} />
    </section>
  );
}

function AtlasView({ actor, onError }: { actor: ActorId; onError: (s: string | null) => void }) {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  useEffect(() => {
    onError(null);
    orgmemory
      .atlas(actor)
      .then(setAtlas)
      .catch((e: Error) => onError(e.message));
  }, [actor, onError]);

  const roots = useMemo(() => atlas?.nodes.filter((n) => !n.parentId) ?? [], [atlas]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-line bg-ink-2 p-5">
        <h3 className="serif text-xl">OrgMemory Atlas</h3>
        <p className="mt-1 text-xs text-paper/50">
          Nascent skill graph: producer → reuse. Not an HR grade. OrgMemory Atlas is the licensed layer for knowledge
          consolidation.
        </p>
        <ul className="mt-5 space-y-4">
          {roots.map((root) => (
            <li key={root.id}>
              <div className="text-brass text-sm tracking-wide uppercase">{root.name}</div>
              <p className="text-xs text-paper/50">{root.description}</p>
              <ul className="mt-2 space-y-2 border-l border-line pl-3">
                {atlas?.nodes
                  .filter((n) => n.parentId === root.id)
                  .map((child) => {
                    const edge = atlas.edges.find((e) => e.fromNodeId === child.id || e.toNodeId === child.id);
                    return (
                      <li key={child.id} className="text-sm">
                        <span className="font-medium">{child.name}</span>
                        {edge ? (
                          <span className="ml-2 text-xs text-brass">{edge.reuseCount} official reuses</span>
                        ) : null}
                        <div className="text-xs text-paper/45">{child.description}</div>
                      </li>
                    );
                  })}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-line bg-ink-2 p-5">
        <h3 className="serif text-xl">Documents feeding Atlas</h3>
        <ul className="mt-4 space-y-3">
          {atlas?.reused.length ? null : <Empty>Fetch the HQ rent schedule to grow the graph.</Empty>}
          {atlas?.reused.map((d) => (
            <li key={d.file.id} className="flex justify-between gap-3 text-sm">
              <span>{d.file.name}</span>
              <span className="text-brass">{d.fetches}×</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-line bg-ink-2 p-5">
        <h3 className="serif text-xl">Prompt insight (HR / manager)</h3>
        <p className="mt-1 text-xs text-paper/50">
          Aggregated official PromptTraces from the harness bus — employee-visible, not covert scoring.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {(atlas?.insights?.byInsight ?? []).map((x) => (
            <span key={x.insight} className="rounded-full border border-line px-2 py-0.5">
              {x.insight} {x.n}
            </span>
          ))}
        </div>
        <ul className="mt-4 space-y-2 text-xs text-paper/65">
          {(atlas?.traces ?? []).map((t) => (
            <li key={t.id}>
              <span className="text-brass">{t.insight}</span> · {t.prompt}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-line bg-ink-2 p-5 lg:col-span-2">
        <h3 className="serif text-xl">OrgMemory Seal endpoints</h3>
        <p className="mt-1 text-xs text-paper/50">
          Windows, Mac, and Linux. Integrity drops a tier when USN / ESF / fanotify / admin is missing — it does not
          die, and it never auto-widens the allowlist.
        </p>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {(atlas?.devices ?? []).map((d) => (
            <li key={d.id} className="rounded-lg border border-line bg-ink p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{d.hostname}</span>
                <TierBadge tier={d.integrityTier} />
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-paper/40">{d.os}</div>
              <p className="mt-2 text-xs text-paper/55">
                {d.degradeReason ?? "At claimed integrity. Volume encryption + signed attest required for T3."}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const color =
    tier === "T3"
      ? "text-moss border-moss/40"
      : tier === "T2"
        ? "text-brass border-brass/40"
        : tier === "T1"
          ? "text-brass-2 border-line"
          : "text-paper/40 border-line";
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${color}`}>{tier}</span>;
}

function isActivityKind(kind: string): boolean {
  switch (kind) {
    case "slack":
    case "salesforce":
    case "ramp":
      return true;
    default:
      return false;
  }
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "healthy" ? "text-moss border-moss/40" : status === "unenrolled" ? "text-paper/40 border-line" : "text-brass border-brass/40";
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${color}`}>{status}</span>;
}

function Empty({ children }: { children: string }) {
  return <p className="mt-3 text-sm text-paper/45">{children}</p>;
}

function AuditTable({ events }: { events: Audit[] }) {
  if (events.length === 0) return <Empty>Ledger is quiet.</Empty>;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="text-paper/40">
          <tr>
            <th className="py-2 font-medium">When</th>
            <th className="py-2 font-medium">Action</th>
            <th className="py-2 font-medium">Decision</th>
            <th className="py-2 font-medium">Actor</th>
            <th className="py-2 font-medium">Purpose / receipt</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-t border-line">
              <td className="py-2 text-paper/60">{e.createdAt.replace("T", " ").slice(0, 19)}</td>
              <td className="py-2">{e.action}</td>
              <td className={`py-2 ${e.decision === "deny" ? "text-seal" : "text-moss"}`}>{e.decision}</td>
              <td className="py-2">{e.agentId ?? e.actorId}</td>
              <td className="py-2 text-paper/70">
                {e.purpose ?? "—"}
                {e.receiptId ? <div className="text-[10px] text-brass">{e.receiptId}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
