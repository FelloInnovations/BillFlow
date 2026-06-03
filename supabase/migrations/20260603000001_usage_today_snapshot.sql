alter table openrouter_usage_snapshots
  add column if not exists usage_today numeric not null default 0;
