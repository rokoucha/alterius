-- Initial Alterius schema.
CREATE TABLE aliases (
  id TEXT PRIMARY KEY,
  local_part TEXT NOT NULL,
  domain TEXT NOT NULL,
  service_name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (local_part, domain)
);

CREATE INDEX aliases_created_at_idx ON aliases(created_at DESC);
CREATE INDEX aliases_service_name_idx ON aliases(service_name COLLATE NOCASE);
CREATE INDEX aliases_status_idx ON aliases(status);
