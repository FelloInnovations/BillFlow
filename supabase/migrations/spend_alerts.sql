-- Drop old budget-based table (no production data was ever set)
drop table if exists project_guardrails;

-- New threshold-based alert system
create table if not exists spend_alerts (
  id                    uuid        primary key default gen_random_uuid(),
  project_name          text        not null,
  openrouter_key_name   text        not null,

  -- Threshold definition
  period_type           text        not null check (period_type in ('daily', 'weekly', 'monthly')),
  threshold_usd         numeric     not null check (threshold_usd > 0),

  -- Notification settings
  -- notify_email: comma-separated list, or the literal 'team' to use the default team list
  notify_email          text        not null default 'team',
  notify_frequency      text        not null default 'immediate'
                        check (notify_frequency in ('immediate', 'daily_digest', 'weekly_digest')),

  -- State — prevents duplicate notifications within the same period
  last_notified_at      timestamptz,
  last_period_start     text,  -- 'YYYY-MM-DD' for daily, 'YYYY-Www' for weekly, 'YYYY-MM' for monthly

  is_active             boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- One alert per project per period type
  unique (project_name, period_type)
);

alter table spend_alerts disable row level security;

-- Digest queue: holds alerts waiting to be batched into digest emails
create table if not exists alert_digest_queue (
  id            uuid        primary key default gen_random_uuid(),
  alert_id      uuid        references spend_alerts(id) on delete cascade,
  project_name  text        not null,
  period_type   text        not null,
  threshold_usd numeric     not null,
  actual_spend  numeric     not null,
  detected_at   timestamptz not null default now(),
  sent          boolean     not null default false,
  digest_type   text        not null  -- 'daily_digest' or 'weekly_digest'
);

alter table alert_digest_queue disable row level security;
