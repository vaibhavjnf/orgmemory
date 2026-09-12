import type { ActivityConnector, ActivitySource, ConnectorDraft, WorkCluster } from "@orgmemory/core";
import { sourceLabel } from "@orgmemory/core";

export interface NormalizedBatch {
  source: ActivitySource;
  events: ConnectorDraft[];
}

/** Connector → WorkEvent drafts. Stubs implement this; OAuth later. */
export function normalizeConnector(connector: ActivityConnector, orgId: string): NormalizedBatch {
  return { source: connector.kind, events: connector.pull(orgId) };
}

export function assignCluster(summary: string, clusters: Pick<WorkCluster, "id" | "title">[]): string | null {
  const hay = summary.toLowerCase();
  for (const c of clusters) {
    if (hay.includes(c.title.toLowerCase())) return c.id;
  }
  for (const c of clusters) {
    const tokens = c.title.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
    if (tokens.some((t) => hay.includes(t))) return c.id;
  }
  return null;
}

export function describeBusHop(source: ActivitySource): string {
  return `${sourceLabel(source)} → WorkEvent → harness store → UI`;
}
