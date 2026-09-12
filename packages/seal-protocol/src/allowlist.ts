import type { CloudPlaceholder, SealOs } from "./types.js";

/**
 * Never auto-widen. A path is in-policy only if it is equal to or nested under
 * an enrolled prefix. Agents must not append newly seen folders to the allowlist.
 */
export function pathOnAllowlist(filePath: string, prefixes: string[]): boolean {
  const normalized = normalizePath(filePath);
  if (!normalized) return false;
  return prefixes.some((raw) => {
    const prefix = normalizePath(raw);
    if (!prefix) return false;
    if (normalized === prefix) return true;
    const sep = prefix.includes("/") ? "/" : "\\";
    const withSep = prefix.endsWith("/") || prefix.endsWith("\\") ? prefix : `${prefix}${sep}`;
    return normalized.startsWith(withSep);
  });
}

export function normalizePath(p: string): string {
  return p.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** OneDrive Files On-Demand, iCloud, Google Drive File Stream placeholders. */
export function detectPlaceholder(filePath: string, os: SealOs): CloudPlaceholder | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".icloud") || lower.includes("/mobile documents/com~apple~clouddocs/")) {
    return "icloud";
  }
  if (
    /\/onedrive\b/.test(lower) ||
    lower.includes("/one drive/") ||
    /\.partial$/i.test(filePath) ||
    lower.includes("\\onedrive")
  ) {
    if (os === "windows" || os === "darwin" || os === "linux") return "onedrive";
  }
  if (lower.includes("google drive") || lower.includes("/googledrivefs")) {
    return "google_drive_fs";
  }
  return null;
}

/**
 * Placeholders must not be hashed as if they were bytes. Cloud hydrates on
 * open — hashing the reparse point would look like content and leak sync.
 */
export function shouldHashContent(placeholder: CloudPlaceholder | null, kind: string): boolean {
  if (placeholder) return false;
  return kind === "created" || kind === "modified";
}
