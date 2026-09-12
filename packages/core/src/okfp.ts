import { createHash, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import type { OkfpReceipt, OkfpReceiptBody } from "./types.js";
import { OKFP_VERSION } from "./types.js";

export function sha256Hex(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number" || t === "boolean") return JSON.stringify(value);
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(",")}]`;
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface OkfpKeyPair {
  keyId: string;
  publicKey: KeyObject;
  privateKey: KeyObject;
  publicPem: string;
  privatePem: string;
}

export function generateOkfpKeys(keyId = "okfp_demo"): OkfpKeyPair {
  const pair = generateKeyPairSync("ed25519");
  return {
    keyId,
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    publicPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    privatePem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function signReceiptBody(body: OkfpReceiptBody, keys: OkfpKeyPair): OkfpReceipt {
  const payload = canonicalize(body);
  const signature = sign(null, Buffer.from(payload, "utf8"), keys.privateKey).toString("base64url");
  return {
    ...body,
    alg: "ed25519",
    publicKeyId: keys.keyId,
    signature,
  };
}

export function verifyReceipt(
  receipt: OkfpReceipt,
  publicKey: KeyObject,
): { ok: true } | { ok: false; reason: string } {
  if (receipt.v !== OKFP_VERSION) {
    return { ok: false, reason: `unsupported version ${receipt.v}` };
  }
  if (receipt.alg !== "ed25519") {
    return { ok: false, reason: `unsupported alg ${receipt.alg}` };
  }
  const { signature, publicKeyId: _id, alg: _alg, ...body } = receipt;
  void _id;
  void _alg;
  const payload = canonicalize(body);
  const ok = verify(null, Buffer.from(payload, "utf8"), publicKey, Buffer.from(signature, "base64url"));
  return ok ? { ok: true } : { ok: false, reason: "ed25519 signature mismatch" };
}

export function newReceiptId(): string {
  return `rcpt_${createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex").slice(0, 20)}`;
}

export function signCanonical(
  value: unknown,
  keys: OkfpKeyPair,
): { hash: string; signature: string; publicKeyId: string } {
  const payload = canonicalize(value);
  return {
    hash: sha256Hex(payload),
    signature: sign(null, Buffer.from(payload, "utf8"), keys.privateKey).toString("base64url"),
    publicKeyId: keys.keyId,
  };
}
