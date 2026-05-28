-- Drop the partial unique index (it doesn't work with .upsert() ON CONFLICT resolution)
drop index if exists api_invocation_logs_endpoint_dedup;

-- Add a proper unique constraint for per-key, per-model, per-day deduplication
alter table api_invocation_logs
  add constraint api_invocation_logs_unique
  unique (key_name, endpoint_id, invoked_at);
