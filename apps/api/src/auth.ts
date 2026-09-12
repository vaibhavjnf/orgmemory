import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import type { User } from "@orgmemory/core";
import { getUserByApiKey, getUserById } from "./db/store.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function authenticate(db: DatabaseSync, req: FastifyRequest): Promise<User> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing Bearer token. Use a demo API key (om_demo_acme_legal).");
  }
  const token = header.slice("Bearer ".length).trim();
  const fromKey = getUserByApiKey(db, token);
  if (!fromKey) {
    throw new HttpError(401, "Unknown API key.");
  }
  const actorHeader = req.headers["x-orgmemory-actor"];
  if (typeof actorHeader === "string" && actorHeader.length > 0) {
    const impersonated = getUserById(db, actorHeader);
    if (!impersonated || impersonated.orgId !== fromKey.orgId) {
      throw new HttpError(403, "X-OrgMemory-Actor is not in this org.");
    }
    // Org demo key (the agent) may act as any org user for the playground.
    if (fromKey.role === "agent" || fromKey.id === impersonated.id) {
      return impersonated;
    }
    throw new HttpError(403, "This key cannot switch actors.");
  }
  return fromKey;
}

export function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply.status(err.status).send({ error: err.message, ...err.extra });
  }
  const message = err instanceof Error ? err.message : "internal error";
  return reply.status(500).send({ error: message });
}
