import type { ConnectorKind, EmbeddingProvider } from "@orgmemory/core";
import type { RemoteFile } from "../db/corpus.js";
import { dropboxFiles, googleDriveFiles, oneDriveFiles } from "../db/corpus.js";

export interface CloudProvider {
  kind: ConnectorKind;
  displayName: string;
  status: "healthy" | "stub" | "unenrolled";
  list(): RemoteFile[];
}

export class MockGoogleDriveProvider implements CloudProvider {
  kind = "google_drive" as const;
  displayName = "Google Drive (mock — swap for OAuth later)";
  status = "healthy" as const;
  list(): RemoteFile[] {
    return googleDriveFiles();
  }
}

export class OneDriveStubProvider implements CloudProvider {
  kind = "onedrive" as const;
  displayName = "OneDrive (stub)";
  status = "stub" as const;
  list(): RemoteFile[] {
    return oneDriveFiles();
  }
}

export class DropboxStubProvider implements CloudProvider {
  kind = "dropbox" as const;
  displayName = "Dropbox (stub)";
  status = "stub" as const;
  list(): RemoteFile[] {
    return dropboxFiles();
  }
}

export class LinuxFsUnenrolledProvider implements CloudProvider {
  kind = "linux_fs" as const;
  displayName = "Linux workstations (unenrolled)";
  status = "unenrolled" as const;
  list(): RemoteFile[] {
    return [];
  }
}

export function defaultProviders(): CloudProvider[] {
  return [
    new MockGoogleDriveProvider(),
    new OneDriveStubProvider(),
    new DropboxStubProvider(),
    new LinuxFsUnenrolledProvider(),
  ];
}

export type { EmbeddingProvider };
