export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  agent_id TEXT,
  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS matter_grants (
  user_id TEXT NOT NULL,
  matter_id TEXT NOT NULL,
  PRIMARY KEY (user_id, matter_id)
);

CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL,
  last_sync_at TEXT,
  last_error TEXT,
  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

CREATE TABLE IF NOT EXISTS source_files (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  project_id TEXT,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  path TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  shared_with_json TEXT NOT NULL,
  content TEXT,
  content_hash TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  author_role TEXT NOT NULL,
  matter_id TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  indexed_at TEXT,
  UNIQUE (connector_id, external_id)
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding_json TEXT NOT NULL,
  token_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS suggestion_batches (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  query TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  score REAL NOT NULL,
  snippet TEXT NOT NULL,
  why_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  agent_id TEXT,
  action TEXT NOT NULL,
  purpose TEXT,
  matter_id TEXT,
  ticket_id TEXT,
  file_id TEXT,
  suggestion_id TEXT,
  query TEXT,
  acl_snapshot_json TEXT,
  content_hash TEXT,
  receipt_id TEXT,
  decision TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  body_json TEXT NOT NULL,
  signature TEXT NOT NULL,
  public_key_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS org_keys (
  org_id TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  public_pem TEXT NOT NULL,
  private_pem TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_nodes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id TEXT,
  kind TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_edges (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  producer_id TEXT NOT NULL,
  reuse_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seal_devices (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  hostname TEXT NOT NULL,
  os TEXT NOT NULL,
  os_user TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  integrity_tier TEXT NOT NULL,
  claimed_tier TEXT NOT NULL,
  degrade_reason TEXT,
  allowlist_json TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  last_heartbeat_at TEXT,
  enrolled_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seal_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  dest_path TEXT,
  content_hash TEXT,
  mtime TEXT NOT NULL,
  os_user TEXT NOT NULL,
  integrity_tier TEXT NOT NULL,
  placeholder TEXT,
  allowlisted INTEGER NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_org ON source_files(org_id);
CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_events(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS harness_actors (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  department TEXT NOT NULL,
  team TEXT NOT NULL,
  role TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_clusters (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  department TEXT NOT NULL,
  team TEXT NOT NULL,
  title TEXT NOT NULL,
  stage TEXT NOT NULL,
  owner_actor_id TEXT NOT NULL,
  actor_ids_json TEXT NOT NULL,
  node_ids_json TEXT NOT NULL DEFAULT '[]',
  frozen_commit_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  cluster_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  ref TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  cluster_id TEXT,
  actor_id TEXT NOT NULL,
  node_id TEXT,
  source TEXT NOT NULL,
  verb TEXT NOT NULL,
  summary TEXT NOT NULL,
  artifact_id TEXT,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS harness_receipts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  cluster_id TEXT,
  artifact_id TEXT,
  actor_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  issued_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_events_org ON work_events(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_cluster ON artifacts(cluster_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_ref ON artifacts(org_id, ref);

CREATE TABLE IF NOT EXISTS work_nodes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  department TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  online INTEGER NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_mirrors (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  label TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  slice_json TEXT NOT NULL,
  slice_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hard_commits (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  subgraph TEXT NOT NULL,
  target_id TEXT NOT NULL,
  label TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  slice_hash TEXT NOT NULL,
  body_json TEXT NOT NULL,
  signature TEXT NOT NULL,
  public_key_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_vaults (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  origins_json TEXT NOT NULL,
  enrolled_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_records (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  tool TEXT NOT NULL,
  status TEXT NOT NULL,
  cookie_present INTEGER NOT NULL,
  redacted_hint TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS browser_jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  vault_id TEXT,
  node_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  cluster_id TEXT,
  origin TEXT NOT NULL,
  intent TEXT NOT NULL,
  status TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_tool_identities (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  enterprise_email TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connector_enablements (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  mock INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_traces (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  cluster_id TEXT,
  prompt TEXT NOT NULL,
  tools_json TEXT NOT NULL,
  outcome TEXT NOT NULL,
  insight TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_runtimes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  last_tick_at TEXT
);

CREATE TABLE IF NOT EXISTS runtime_routines (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  cluster_id TEXT NOT NULL,
  title TEXT NOT NULL,
  cadence TEXT NOT NULL,
  enabled INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_memory (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  slot_value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (runtime_id, slot_key)
);

CREATE TABLE IF NOT EXISTS runtime_ticks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  routine_id TEXT NOT NULL,
  cluster_id TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);
`;
