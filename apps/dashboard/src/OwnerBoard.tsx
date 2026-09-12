import { useCallback, useEffect, useState } from "react";
import {
  type ActorId,
  type BrowserJob,
  type ClusterBriefing,
  type ClusterCard,
  type FetchRes,
  type HardCommit,
  type InsightRollup,
  type OwnerBoard,
  type RuntimeStatus,
  type Suggestion,
  type TimelineMirror,
  orgmemory,
} from "./api";

export function OwnerBoardView({
  actor,
  onError,
}: {
  actor: ActorId;
  onError: (s: string | null) => void;
}) {
  const [board, setBoard] = useState<OwnerBoard | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>("cl_rent");
  const [briefing, setBriefing] = useState<ClusterBriefing | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBoard = useCallback(() => {
    onError(null);
    setLoading(true);
    orgmemory
      .harness(actor)
      .then((b) => {
        setBoard(b);
        setSelectedId((current) => {
          if (current) return current;
          return b.departments[0]?.teams[0]?.clusters[0]?.id ?? null;
        });
      })
      .catch((e: Error) => onError(e.message))
      .finally(() => setLoading(false));
  }, [actor, onError]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (!selectedId) {
      setBriefing(null);
      return;
    }
    orgmemory
      .cluster(actor, selectedId)
      .then(setBriefing)
      .catch((e: Error) => onError(e.message));
  }, [actor, selectedId, onError, board]);

  if (loading && !board) {
    return <p className="text-sm text-paper/45">Loading harness state…</p>;
  }
  if (!board) {
    return <p className="text-sm text-paper/45">No harness state yet. Seed the org (`pnpm seed`).</p>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)]">
      <div className="space-y-6">
        <section className="rounded-xl border border-line bg-ink-2 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="serif text-xl">Owner Concurrent Dashboard</h3>
              <p className="mt-1 text-xs leading-5 text-paper/50">
                Hosted Hermes loop is the driver — department × work × stage × node. This screen is a projection of
                harness state, not a chatbot. Bus: {board.bus}.
              </p>
            </div>
            <button type="button" className="text-xs text-brass underline" onClick={loadBoard}>
              Refresh
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-paper/55">
            <span className="rounded-full border border-line px-2 py-0.5">{board.clusterCount} clusters</span>
            <span className="rounded-full border border-line px-2 py-0.5">{board.eventCount} events</span>
            <span className="rounded-full border border-line px-2 py-0.5">{board.nodes?.length ?? 0} nodes</span>
            {board.sources.map((s) => (
              <span key={s.source} className="rounded-full border border-line px-2 py-0.5">
                {sourceLabel(s.source)} {s.events}
              </span>
            ))}
          </div>
        </section>

        {board.departments.length === 0 ? (
          <p className="text-sm text-paper/45">No concurrent clusters.</p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {board.departments.map((dept) => (
            <section key={dept.department} className="rounded-xl border border-line bg-ink-2 p-5">
              <h4 className="text-[11px] tracking-[0.18em] text-brass uppercase">{dept.department}</h4>
              {dept.teams.map((team) => (
                <div key={team.team} className="mt-4">
                  <div className="text-xs text-paper/45">{team.team}</div>
                  <ul className="mt-2 space-y-2">
                    {team.clusters.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(c.id)}
                          className={`w-full rounded-lg border px-3 py-3 text-left ${
                            selectedId === c.id
                              ? "border-brass/50 bg-ink"
                              : "border-line bg-ink/40 hover:border-brass/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-sm">{c.title}</div>
                            <StagePill stage={c.stage} />
                          </div>
                          <div className="mt-1 text-[11px] text-paper/45">
                            {c.artifactCount ?? 0} artifacts · {relative(c.updatedAt)}
                            {c.frozenCommitId ? " · frozen" : ""}
                          </div>
                          {c.nodes?.length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {c.nodes.map((n) => (
                                <span key={n.id} className="rounded-full border border-line px-1.5 py-0 text-[10px] text-paper/45">
                                  {n.label}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {c.recentEvents?.[0] ? (
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-paper/65">
                              {sourceLabel(c.recentEvents[0].source)} · {c.recentEvents[0].summary}
                            </p>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
        <FabricStrip actor={actor} tick={board.eventCount} onError={onError} onChanged={loadBoard} />
      </div>

      <BrainstormPanel
        actor={actor}
        briefing={briefing}
        selected={board.departments.flatMap((d) => d.teams.flatMap((t) => t.clusters)).find((c) => c.id === selectedId)}
        onError={onError}
        onChanged={loadBoard}
      />
    </div>
  );
}

function BrainstormPanel({
  actor,
  briefing,
  selected,
  onError,
  onChanged,
}: {
  actor: ActorId;
  briefing: ClusterBriefing | null;
  selected: ClusterCard | undefined;
  onError: (s: string | null) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Suggestion[]>([]);
  const [fetched, setFetched] = useState<FetchRes | null>(null);

  useEffect(() => {
    setHits([]);
    setFetched(null);
  }, [selected?.id]);

  if (!selected) {
    return (
      <section className="rounded-xl border border-dashed border-line bg-ink-2 p-5">
        <h3 className="serif text-xl">Brainstorm</h3>
        <p className="mt-2 text-sm text-paper/50">Select a concurrent cluster to see related artifacts and recent events.</p>
      </section>
    );
  }

  const runSuggest = async () => {
    setBusy(true);
    onError(null);
    setFetched(null);
    try {
      const res = await orgmemory.suggest(actor, {
        query: selected.title,
        context: `${selected.department} / ${selected.team} — ${briefing?.events[0]?.summary ?? selected.title}`,
        projectId: "proj_re",
        clusterId: selected.id,
      });
      setHits(res.suggestions);
      onChanged();
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
        purpose: `Owner brainstorm on ${selected.title}`,
        matterId: s.file.matterId ?? undefined,
        clusterId: selected.id,
      });
      setFetched(res);
      await orgmemory.verify(actor, res.receipt);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-line bg-ink-2 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] tracking-[0.18em] text-brass uppercase">Selected cluster</div>
          <h3 className="serif mt-1 text-xl">{selected.title}</h3>
          <p className="mt-1 text-xs text-paper/50">
            {selected.department} · {selected.team} · {stageLabel(selected.stage)}
          </p>
        </div>
        <StagePill stage={selected.stage} />
      </div>

      <div className="mt-5">
        <h4 className="text-xs uppercase tracking-wide text-paper/40">Related artifacts</h4>
        {briefing?.artifacts.length ? (
          <ul className="mt-2 space-y-2">
            {briefing.artifacts.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 text-sm">
                <span>{a.title}</span>
                <span className="shrink-0 text-[11px] text-paper/40">{sourceLabel(a.source)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-paper/45">No artifacts on this cluster yet.</p>
        )}
      </div>

      <div className="mt-5">
        <h4 className="text-xs uppercase tracking-wide text-paper/40">Recent events</h4>
        {briefing?.events.length ? (
          <ol className="mt-2 space-y-3">
            {briefing.events.slice(0, 8).map((e) => (
              <li key={e.id} className="border-l border-line pl-3 text-xs leading-5 text-paper/70">
                <div className="text-paper/40">
                  {sourceLabel(e.source)} · {relative(e.occurredAt)} · {e.actorId.replace("user_", "")}
                </div>
                {e.summary}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-paper/45">Quiet cluster — no events yet.</p>
        )}
      </div>

      {briefing?.receipts.length ? (
        <div className="mt-5">
          <h4 className="text-xs uppercase tracking-wide text-paper/40">OKFP receipts</h4>
          <ul className="mt-2 space-y-1 text-xs text-brass">
            {briefing.receipts.map((r) => (
              <li key={r.id}>
                {r.id} · {r.purpose}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runSuggest()}
          disabled={busy}
          className="rounded-md bg-brass px-4 py-2 text-sm font-medium text-ink hover:bg-brass-2 disabled:opacity-50"
        >
          {busy ? "Weighing…" : "Brainstorm with Suggest"}
        </button>
        <button
          type="button"
          disabled={busy || Boolean(selected.frozenCommitId)}
          onClick={() => {
            setBusy(true);
            orgmemory
              .commitCluster(actor, { clusterId: selected.id, label: `Freeze ${selected.title}` })
              .then(() => onChanged())
              .catch((e: Error) => onError(e.message))
              .finally(() => setBusy(false));
          }}
          className="rounded-md border border-brass/40 px-4 py-2 text-sm text-brass disabled:opacity-40"
        >
          {selected.frozenCommitId ? "Hard-committed" : "Hard commit"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-paper/40">
        Same suggest/fetch/OKFP plane the night agent uses. Hits write WorkEvents back onto this cluster. Frozen
        clusters reject soft stage edits.
      </p>

      {hits.length ? (
        <ul className="mt-4 space-y-3">
          {hits.map((h) => (
            <li key={h.id} className="border-t border-line pt-3">
              <div className="flex items-start justify-between gap-2 text-sm">
                <span className="font-medium">{h.file.name}</span>
                <span className="text-brass">{h.score.toFixed(3)}</span>
              </div>
              <p className="mt-1 text-xs text-paper/60">{h.snippet}</p>
              <button type="button" className="mt-2 text-xs text-brass underline" onClick={() => void pull(h)}>
                Fetch + seal onto cluster
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {fetched ? (
        <div className="mt-4 rounded-lg border border-brass/30 bg-ink p-3 text-xs text-paper/70">
          Receipt {fetched.receipt.id} · event {fetched.workEventId ?? "—"} · cluster {fetched.clusterId ?? selected.id}
        </div>
      ) : null}
    </section>
  );
}

function StagePill({ stage }: { stage: ClusterCard["stage"] }) {
  const color = (() => {
    switch (stage) {
      case "intake":
        return "text-brass border-brass/40";
      case "active":
        return "text-moss border-moss/40";
      case "blocked":
        return "text-seal border-seal/40";
      case "review":
        return "text-brass-2 border-brass/30";
      case "sealed":
        return "text-paper/50 border-line";
      default: {
        const _exhaustive: never = stage;
        return _exhaustive;
      }
    }
  })();
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${color}`}>{stageLabel(stage)}</span>;
}

function stageLabel(stage: ClusterCard["stage"]): string {
  switch (stage) {
    case "intake":
      return "Intake";
    case "active":
      return "Active";
    case "blocked":
      return "Blocked";
    case "review":
      return "Review";
    case "sealed":
      return "Sealed";
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case "google_drive":
      return "Drive";
    case "onedrive":
      return "OneDrive";
    case "dropbox":
      return "Dropbox";
    case "linux_fs":
      return "Linux FS";
    case "slack":
      return "Slack";
    case "salesforce":
      return "Salesforce";
    case "ramp":
      return "Ramp";
    case "seal":
      return "Seal";
    case "suggest":
      return "Suggest";
    case "fetch":
      return "Fetch";
    case "composio":
      return "Composio";
    case "prompt":
      return "Prompt";
    case "mirror":
      return "Mirror";
    case "commit":
      return "Commit";
    case "vault":
      return "Vault";
    case "browser":
      return "Browser";
    case "node":
      return "Node";
    case "runtime":
      return "Runtime";
    default:
      return source;
  }
}

function FabricStrip({
  actor,
  tick,
  onError,
  onChanged,
}: {
  actor: ActorId;
  tick: number;
  onError: (s: string | null) => void;
  onChanged: () => void;
}) {
  const [mirrors, setMirrors] = useState<TimelineMirror[]>([]);
  const [commits, setCommits] = useState<HardCommit[]>([]);
  const [insights, setInsights] = useState<InsightRollup | null>(null);
  const [vaultNote, setVaultNote] = useState("");
  const [jobs, setJobs] = useState<BrowserJob[]>([]);
  const [email, setEmail] = useState("");
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [ticking, setTicking] = useState(false);

  useEffect(() => {
    Promise.all([
      orgmemory.mirrors(actor),
      orgmemory.commits(actor),
      orgmemory.insights(actor),
      orgmemory.vaults(actor),
      orgmemory.jobs(actor),
      orgmemory.identities(actor),
      orgmemory.runtime(actor),
    ])
      .then(([m, c, i, v, j, t, rt]) => {
        setMirrors(m.mirrors);
        setCommits(c.commits);
        setInsights(i.rollup);
        setVaultNote(v.ethics);
        setJobs(j.jobs);
        setEmail(t.identities[0]?.enterpriseEmail ?? "");
        setRuntime(rt);
      })
      .catch((e: Error) => onError(e.message));
  }, [actor, onError, tick]);

  return (
    <section className="rounded-xl border border-line bg-ink-2 p-5">
      <h3 className="serif text-xl">Concurrent fabric</h3>
      <p className="mt-1 text-xs text-paper/50">
        Hosted Hermes runtime on OrgMemory infra. Seal devices and the browser pool are satellites. Dashboard is a
        projection of the loop.
      </p>
      <div className="mt-3 rounded-lg border border-brass/30 bg-ink p-3 text-xs">
        <div className="text-brass">
          {runtime?.runtime?.label ?? "No runtime"} · {runtime?.runtime?.status ?? "absent"}
        </div>
        <p className="mt-1 text-paper/55">{runtime?.driver}</p>
        <ul className="mt-2 space-y-1 text-paper/70">
          {(runtime?.routines ?? []).map((r) => (
            <li key={r.id}>{r.title}</li>
          ))}
        </ul>
        <button
          type="button"
          disabled={ticking}
          className="mt-3 rounded-md bg-brass px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
          onClick={() => {
            setTicking(true);
            orgmemory
              .runtimeTick(actor, { clusterId: "cl_rent" })
              .then(() => onChanged())
              .catch((e: Error) => onError(e.message))
              .finally(() => setTicking(false));
          }}
        >
          {ticking ? "Ticking…" : "Run hosted loop"}
        </button>
        {(runtime?.ticks ?? []).slice(0, 3).map((t) => (
          <div key={t.id} className="mt-2 text-[11px] text-paper/50">
            {t.steps.map((s) => s.tool).join(" → ")} · {t.clusterId}
          </div>
        ))}
      </div>

      <h4 className="mt-4 text-xs uppercase tracking-wide text-paper/40">Mirrors</h4>
      <ul className="mt-2 space-y-2">
        {mirrors.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-2 text-sm">
            <div>
              <div>{m.label}</div>
              <div className="text-[11px] text-paper/40">
                {m.clusterCount} clusters · {m.eventCount} events
              </div>
            </div>
            <button
              type="button"
              className="text-xs text-brass underline"
              onClick={() => {
                orgmemory
                  .rollback(actor, m.id)
                  .then(() => onChanged())
                  .catch((e: Error) => onError(e.message));
              }}
            >
              Rollback
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-2 text-xs text-brass underline"
        onClick={() => {
          orgmemory
            .createMirror(actor, `Owner snapshot ${new Date().toISOString().slice(11, 19)}`)
            .then(() => onChanged())
            .catch((e: Error) => onError(e.message));
        }}
      >
        Snapshot now
      </button>

      <h4 className="mt-5 text-xs uppercase tracking-wide text-paper/40">Hard commits</h4>
      <ul className="mt-2 space-y-1 text-xs text-paper/70">
        {commits.map((c) => (
          <li key={c.id}>
            {c.label} · {c.subgraph}/{c.targetId}
          </li>
        ))}
      </ul>

      <h4 className="mt-5 text-xs uppercase tracking-wide text-paper/40">HR / manager insight (aggregated)</h4>
      <p className="mt-1 text-[11px] text-paper/45">Official PromptTraces — not covert scoring.</p>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        {insights?.byInsight.map((x) => (
          <span key={x.insight} className="rounded-full border border-line px-2 py-0.5">
            {x.insight} {x.n}
          </span>
        ))}
      </div>

      <h4 className="mt-5 text-xs uppercase tracking-wide text-paper/40">Vault / automation / Composio</h4>
      <p className="mt-1 text-[11px] leading-5 text-paper/50">{vaultNote}</p>
      <p className="mt-2 text-xs text-paper/65">Tenant email {email || "—"}</p>
      <ul className="mt-2 space-y-1 text-xs text-paper/60">
        {jobs.map((j) => (
          <li key={j.id}>
            {j.status} · {j.intent}
          </li>
        ))}
      </ul>
    </section>
  );
}

function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 36) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
