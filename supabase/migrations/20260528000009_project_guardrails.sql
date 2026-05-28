create table if not exists project_guardrails (
  id                    uuid        default gen_random_uuid() primary key,
  project_name          text        not null unique,
  monthly_budget_usd    numeric,
  warning_threshold_pct int         not null default 80,
  recommended_budget_usd numeric,
  last_warned_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table project_guardrails disable row level security;
