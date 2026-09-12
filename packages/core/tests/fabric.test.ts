import { describe, expect, it } from "vitest";
import { isManagedOrigin, redactHint, sessionPayloadForbidden } from "../src/fabric.js";

describe("managed session vault helpers", () => {
  it("redacts to a last-four placeholder and never echoes the secret", () => {
    expect(redactHint("sid-enterprise-a3f2")).toBe("••••a3f2");
    expect(redactHint("ab")).toBe("••••");
  });

  it("rejects raw cookie/token fields", () => {
    expect(sessionPayloadForbidden({ cookie: "secret" })).toMatch(/raw secret/i);
    expect(sessionPayloadForbidden({ origin: "https://acme.slack.com", tool: "slack" })).toBeNull();
  });

  it("only allowlists enterprise-managed origins", () => {
    expect(isManagedOrigin("https://acme.my.salesforce.com")).toBe(true);
    expect(isManagedOrigin("https://mail.google.com")).toBe(false);
  });
});
