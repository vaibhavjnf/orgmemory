import { describe, expect, it } from "vitest";
import { detectPlaceholder, pathOnAllowlist } from "../src/allowlist.js";
import { validateIngestBatch } from "../src/parse.js";
import { resolveIntegrityTier, watcherName } from "../src/tier.js";
import type { SealCapabilities } from "../src/types.js";

const winBase: SealCapabilities = {
  os: "windows",
  admin: false,
  usnJournal: false,
  fanotify: false,
  esf: false,
  volumeEncryption: false,
  signedBinaryAttest: false,
};

describe("integrity tiers — degrade don't die", () => {
  it("Windows without USN/admin falls to T1 ReadDirectoryChangesW", () => {
    const r = resolveIntegrityTier(winBase);
    expect(r.tier).toBe("T1");
    expect(r.degradedFrom).toBe("T2");
    expect(watcherName("windows", r.tier)).toBe("ReadDirectoryChangesW");
  });

  it("macOS without ESF falls to T1 FSEvents", () => {
    const r = resolveIntegrityTier({ ...winBase, os: "darwin" });
    expect(r.tier).toBe("T1");
    expect(watcherName("darwin", "T1")).toBe("FSEvents");
  });

  it("Linux without fanotify falls to T1 inotify", () => {
    const r = resolveIntegrityTier({ ...winBase, os: "linux" });
    expect(r.tier).toBe("T1");
    expect(watcherName("linux", "T1")).toBe("inotify");
  });

  it("T3 requires journal + encryption + signed attest", () => {
    const r = resolveIntegrityTier({
      os: "darwin",
      admin: true,
      usnJournal: false,
      fanotify: false,
      esf: true,
      volumeEncryption: true,
      signedBinaryAttest: true,
    });
    expect(r.tier).toBe("T3");
  });

  it("journal without encryption stays T2, not T3", () => {
    const r = resolveIntegrityTier({
      os: "linux",
      admin: true,
      usnJournal: false,
      fanotify: true,
      esf: false,
      volumeEncryption: false,
      signedBinaryAttest: true,
    });
    expect(r.tier).toBe("T2");
    expect(r.degradedFrom).toBe("T3");
  });
});

describe("allowlist — never auto-widen", () => {
  const prefixes = ["C:/Users/Priya/Work/Acme", "/srv/matters"];

  it("accepts nested enrolled paths", () => {
    expect(pathOnAllowlist("C:\\Users\\Priya\\Work\\Acme\\Leases\\exhibit-b.pdf", prefixes)).toBe(true);
    expect(pathOnAllowlist("/srv/matters/4419/abstract.md", prefixes)).toBe(true);
  });

  it("rejects sibling folders the watcher happened to see", () => {
    expect(pathOnAllowlist("C:\\Users\\Priya\\Downloads\\lease.pdf", prefixes)).toBe(false);
    expect(pathOnAllowlist("/home/priya/secrets/id_rsa", prefixes)).toBe(false);
  });
});

describe("ingest schema", () => {
  const ctx = {
    deviceId: "dev_win",
    os: "windows" as const,
    allowlist: ["C:/Users/Priya/Work/Acme"],
  };

  it("accepts created|modified|renamed|deleted|heartbeat", () => {
    const { accepted, rejected } = validateIngestBatch(
      [
        {
          kind: "heartbeat",
          path: "",
          mtime: "2026-09-11T00:30:00.000Z",
          osUser: "priya",
          integrityTier: "T1",
        },
        {
          kind: "modified",
          path: "C:/Users/Priya/Work/Acme/Leases/exhibit-b.pdf",
          contentHash: "sha256:abc",
          mtime: "2026-09-11T00:31:00.000Z",
          osUser: "priya",
          integrityTier: "T1",
        },
        {
          kind: "renamed",
          path: "C:/Users/Priya/Work/Acme/Leases/old.pdf",
          destPath: "C:/Users/Priya/Work/Acme/Leases/new.pdf",
          mtime: "2026-09-11T00:32:00.000Z",
          osUser: "priya",
          integrityTier: "T1",
        },
      ],
      ctx,
    );
    expect(rejected).toEqual([]);
    expect(accepted.map((e) => e.kind)).toEqual(["heartbeat", "modified", "renamed"]);
  });

  it("rejects off-allowlist paths instead of widening", () => {
    const { accepted, rejected } = validateIngestBatch(
      [
        {
          kind: "created",
          path: "C:/Users/Priya/Desktop/random.docx",
          mtime: "2026-09-11T00:33:00.000Z",
          osUser: "priya",
          integrityTier: "T1",
        },
      ],
      ctx,
    );
    expect(accepted).toEqual([]);
    expect(rejected[0]?.code).toBe("allowlist");
  });

  it("strips hashes from OneDrive/iCloud placeholders", () => {
    expect(detectPlaceholder("C:/Users/Priya/OneDrive/Acme/lease.docx", "windows")).toBe("onedrive");
    expect(detectPlaceholder("/Users/jordan/Library/Mobile Documents/com~apple~CloudDocs/x.md.icloud", "darwin")).toBe(
      "icloud",
    );
    const { accepted, rejected } = validateIngestBatch(
      [
        {
          kind: "modified",
          path: "C:/Users/Priya/Work/Acme/OneDrive/lease.docx",
          contentHash: "sha256:should-not-stick",
          mtime: "2026-09-11T00:34:00.000Z",
          osUser: "priya",
          integrityTier: "T1",
        },
      ],
      ctx,
    );
    expect(rejected).toEqual([]);
    expect(accepted[0]?.placeholder).toBe("onedrive");
    expect(accepted[0]?.contentHash).toBeNull();
  });
});
