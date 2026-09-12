import { describe, expect, it } from "vitest";
import { checkLicense, featureEnabled, issueLicense } from "../src/index.js";

const secret = "demo-license-secret";

describe("license JWT", () => {
  it("cloud mode bypasses a missing token and enables atlas/receipts/suggest", () => {
    const check = checkLicense({ mode: "cloud", token: undefined, secret });
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(featureEnabled(check, "atlas")).toBe(true);
      expect(featureEnabled(check, "receipts")).toBe(true);
      expect(featureEnabled(check, "suggest")).toBe(true);
    }
  });

  it("on-prem requires a valid signed JWT", () => {
    const missing = checkLicense({ mode: "onprem", token: undefined, secret });
    expect(missing.ok).toBe(false);
    const token = issueLicense(secret, {
      sub: "org_acme",
      mode: "oem",
      features: { suggest: true, receipts: true, atlas: false },
      iat: 1_700_000_000,
      exp: 2_000_000_000,
    });
    const ok = checkLicense({ mode: "onprem", token, secret, now: 1_800_000_000_000 });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.claims.features.atlas).toBe(false);
      expect(ok.claims.features.receipts).toBe(true);
    }
  });
});
