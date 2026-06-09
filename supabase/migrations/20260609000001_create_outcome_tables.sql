-- Outcome metric configuration per project
create table if not exists project_outcome_config (
  id          uuid primary key default gen_random_uuid(),
  project_id  text not null,
  metric_key  text not null,
  label       text not null,
  target_value numeric,
  is_active   boolean default true,
  sort_order  int not null,
  created_at  timestamptz default now(),
  unique (project_id, metric_key)
);

alter table project_outcome_config disable row level security;

-- Actual metric values, one row per project/metric/date
create table if not exists project_outcome_metrics (
  id          uuid primary key default gen_random_uuid(),
  project_id  text not null,
  metric_key  text not null,
  value       numeric not null,
  date        date not null,
  source      text not null default 'manual',
  notes       text,
  created_at  timestamptz default now(),
  unique (project_id, metric_key, date)
);

alter table project_outcome_metrics disable row level security;

-- Seed Arthur's metric config
insert into project_outcome_config (project_id, metric_key, label, sort_order) values
  ('arthur', 'llm_traffic_daily',  'LLM Traffic',    1),
  ('arthur', 'blog_traffic_daily', 'Blog Traffic',   2),
  ('arthur', 'demos_booked_mtd',   'Demos Booked',   3),
  ('arthur', 'demos_held_mtd',     'Demos Held',     4),
  ('arthur', 'closed_won_mtd',     'Closed Won',     5),
  ('arthur', 'arr_closed_mtd',     'ARR Closed',     6)
on conflict (project_id, metric_key) do nothing;
