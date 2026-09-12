import type { ActivityConnector, ConnectorDraft } from "@orgmemory/core";

export class SlackStubConnector implements ActivityConnector {
  readonly kind = "slack" as const;
  readonly displayName = "Slack (stub)";
  pull(_orgId: string): ConnectorDraft[] {
    return [
      {
        externalId: "slack:leases-0031",
        actorId: "user_jordan",
        verb: "said",
        summary: "#leases — pulling the HQ rent schedule so the amendment can go out before standup.",
        occurredAt: hoursAgo(3),
        clusterHint: "HQ rent amendment",
        artifact: { kind: "message", title: "#leases thread", ref: "slack:#leases" },
      },
      {
        externalId: "slack:4419-block",
        actorId: "user_priya",
        verb: "said",
        summary: "#4419 — landlord still has not sent the estoppel. Cluster stays blocked.",
        occurredAt: hoursAgo(6),
        clusterHint: "Matter 4419",
        artifact: { kind: "message", title: "#4419", ref: "slack:#4419" },
      },
    ];
  }
}

export class SalesforceStubConnector implements ActivityConnector {
  readonly kind = "salesforce" as const;
  readonly displayName = "Salesforce (stub)";
  pull(_orgId: string): ConnectorDraft[] {
    return [
      {
        externalId: "sf:opp-conti",
        actorId: "user_priya",
        verb: "moved",
        summary: "Opportunity Conti Corp retainer moved to Proposal. Needs the executed HQ lease as a capability proof.",
        occurredAt: hoursAgo(8),
        clusterHint: "Conti Corp retainer",
        artifact: { kind: "record", title: "Opp: Conti Corp", ref: "sf:006Conti" },
      },
    ];
  }
}

export class RampStubConnector implements ActivityConnector {
  readonly kind = "ramp" as const;
  readonly displayName = "Ramp (stub)";
  pull(_orgId: string): ConnectorDraft[] {
    return [
      {
        externalId: "ramp:tx-1882",
        actorId: "user_sam",
        verb: "submitted",
        summary: "Ramp expense $2,410 — court reporter + exhibit printing for Matter 4419.",
        occurredAt: hoursAgo(5),
        clusterHint: "Matter 4419",
        artifact: { kind: "expense", title: "Ramp · exhibit printing", ref: "ramp:tx-1882" },
      },
      {
        externalId: "ramp:tx-1901",
        actorId: "user_sam",
        verb: "submitted",
        summary: "Ramp card Q3 office spend — Montgomery rent copay (CAM estimate).",
        occurredAt: hoursAgo(12),
        clusterHint: "Q3 office spend",
        artifact: { kind: "expense", title: "Ramp · CAM copay", ref: "ramp:tx-1901" },
      },
    ];
  }
}

export function activityConnectors(): ActivityConnector[] {
  return [new SlackStubConnector(), new SalesforceStubConnector(), new RampStubConnector()];
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}
