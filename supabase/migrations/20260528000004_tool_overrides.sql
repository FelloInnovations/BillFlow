CREATE TABLE IF NOT EXISTS tool_overrides (
  tool_key  TEXT PRIMARY KEY,
  display_label TEXT,
  type      TEXT,
  notes     TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
