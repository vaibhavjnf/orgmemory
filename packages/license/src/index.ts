import { createHmac, timingSafeEqual } from "node:crypto";
import type { LicenseClaims, LicenseFeatures, LicenseMode } from "@orgmemory/core";

const ISS = "orgmemory-license" as const;

export const ALL_FEATURES: LicenseFeatures = {
  suggest: true,
  receipts: true,
  atlas: true,
};

export function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64url");
}

function parseB64urlJson<T>(part: string): T {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
}

export function issueLicense(
  secret: string,
  claims: Omit<LicenseClaims, "iss">,
): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ ...claims, iss: ISS }));
  const data = `${header}.${payload}`;
  const sig = createHmac("sha256", secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

export type LicenseCheck =
  | { ok: true; claims: LicenseClaims; source: "token" | "cloud_bypass" }
  | { ok: false; reason: string };

/**
 * Cloud mode ignores a missing token and enables every commercial flag.
 * On-prem / OEM must present a signed license JWT.
 */
export function checkLicense(opts: {
  mode: LicenseMode;
  token: string | undefined;
  secret: string;
  now?: number;
}): LicenseCheck {
  if (opts.mode === "cloud") {
    if (!opts.token) {
      return {
        ok: true,
        source: "cloud_bypass",
        claims: {
          iss: ISS,
          sub: "cloud",
          mode: "cloud",
          features: { ...ALL_FEATURES },
          iat: Math.floor((opts.now ?? Date.now()) / 1000),
          exp: Math.floor((opts.now ?? Date.now()) / 1000) + 86400 * 365,
        },
      };
    }
  }
  if (!opts.token) {
    return { ok: false, reason: "missing license token" };
  }
  const parts = opts.token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return { ok: false, reason: "malformed JWT" };
  }
  const data = `${parts[0]}.${parts[1]}`;
  const expected = createHmac("sha256", opts.secret).update(data).digest();
  const given = Buffer.from(parts[2], "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "invalid license signature" };
  }
  const claims = parseB64urlJson<LicenseClaims>(parts[1]);
  if (claims.iss !== ISS) return { ok: false, reason: "wrong issuer" };
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  if (claims.exp <= nowSec) return { ok: false, reason: "license expired" };
  return { ok: true, claims, source: "token" };
}

export function featureEnabled(check: LicenseCheck, feature: keyof LicenseFeatures): boolean {
  if (!check.ok) return false;
  return check.claims.features[feature] === true;
}
