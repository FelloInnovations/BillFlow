create table if not exists openrouter_usage_snapshots (
  id          uuid    default gen_random_uuid() primary key,
  key_name    text    not null,
  month       text    not null,  -- 'YYYY-MM'
  usage_total numeric not null default 0,
  snapshot_at timestamptz not null default now(),
  unique(key_name, month)
);
