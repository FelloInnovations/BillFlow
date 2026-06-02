-- Replace old guardrails/alert tables with shared-state version for n8n integration
drop table if exists project_guardrails cascade;
drop table if exists alert_digest_queue cascade;
drop table if exists spend_alerts cascade;

create table spend_alerts (
  id                    uuid        primary key default gen_random_uuid(),
  project_name          text        not null unique,
  openrouter_key_name   text        not null,

  -- Set by user in BillFlow
  limit_usd             numeric     not null,
  limit_period          text        not null default 'monthly'
                        check (limit_period in ('daily', 'weekly', 'monthly')),
  warning_pct           int         not null default 80,

  -- Written by n8n after each check
  current_spend         numeric     not null default 0,
  current_pct           numeric     not null default 0,
  status                text        not null default 'ok'
                        check (status in ('ok', 'warning', 'breached')),
  last_checked_at       timestamptz,

  -- Notification state (n8n uses these to prevent duplicate emails)
  warning_notified_at   timestamptz,
  breach_notified_at    timestamptz,

  is_active             boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table spend_alerts disable row level security;
