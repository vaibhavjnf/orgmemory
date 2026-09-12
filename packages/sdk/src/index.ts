import type {
  AuditEvent,
  FetchRequest,
  OkfpReceipt,
  SuggestRequest,
  Suggestion,
} from "@orgmemory/core";

export interface OrgMemoryClientOptions {
  baseUrl: string;
  apiKey: string;
  actorId?: string;
  fetchImpl?: typeof fetch;
}

export interface SuggestResponse {
  suggestionBatchId: string;
  suggestions: Suggestion[];
  auditId: string;
}

export interface FetchResponse {
  file: Suggestion["file"];
  content: string | null;
  receipt: OkfpReceipt;
  auditId: string;
}

export interface VerifyReceiptResponse {
  ok: boolean;
  reason?: string;
  receipt?: OkfpReceipt;
}

export class OrgMemoryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "OrgMemoryError";
  }
}

/**
 * Primary commercial surface for agents. Midnight drafters call
 * suggest → fetch → verifyReceipt without waking a human.
 */
export class OrgMemoryClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: OrgMemoryClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async suggest(req: SuggestRequest): Promise<SuggestResponse> {
    return this.request("POST", "/v1/suggest", req);
  }

  async fetch(req: FetchRequest): Promise<FetchResponse> {
    return this.request("POST", "/v1/fetch", req);
  }

  async verifyReceipt(receiptOrId: string | OkfpReceipt): Promise<VerifyReceiptResponse> {
    if (typeof receiptOrId === "string") {
      return this.request("POST", "/v1/receipts/verify", { id: receiptOrId });
    }
    return this.request("POST", "/v1/receipts/verify", { receipt: receiptOrId });
  }

  async getReceipt(id: string): Promise<OkfpReceipt> {
    return this.request("GET", `/v1/receipts/${id}`);
  }

  async audit(query?: { limit?: number; action?: string }): Promise<{ events: AuditEvent[] }> {
    const qs = new URLSearchParams();
    if (query?.limit) qs.set("limit", String(query.limit));
    if (query?.action) qs.set("action", query.action);
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.request("GET", `/v1/audit${suffix}`);
  }

  async enrollSealDevice(body: {
    id: string;
    hostname: string;
    os: "linux" | "windows" | "darwin";
    osUser: string;
    allowlist: string[];
    capabilities: {
      os: "linux" | "windows" | "darwin";
      admin: boolean;
      usnJournal: boolean;
      fanotify: boolean;
      esf: boolean;
      volumeEncryption: boolean;
      signedBinaryAttest: boolean;
    };
    ownerUserId?: string;
  }): Promise<{ device: unknown; auditId: string }> {
    return this.request("POST", "/v1/seal/devices", body);
  }

  async ingestSealEvents(deviceId: string, events: unknown[]): Promise<{
    accepted: number;
    rejected: unknown[];
    auditId: string;
  }> {
    return this.request("POST", "/v1/seal/events", { deviceId, events });
  }

  async listSealDevices(): Promise<{ devices: unknown[] }> {
    return this.request("GET", "/v1/seal/devices");
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.opts.apiKey}`,
      accept: "application/json",
    };
    if (this.opts.actorId) headers["x-orgmemory-actor"] = this.opts.actorId;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      throw new OrgMemoryError(json.error ?? `OrgMemory ${method} ${path} failed`, res.status, json);
    }
    return json;
  }
}

export type { FetchRequest, SuggestRequest, Suggestion, OkfpReceipt, AuditEvent };
