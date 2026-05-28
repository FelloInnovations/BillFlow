create table if not exists api_invocation_logs (
  id               uuid        primary key default gen_random_uuid(),
  key_name         text        not null,
  project_name     text,
  model            text,
  prompt_tokens    integer,
  completion_tokens integer,
  total_tokens     integer,
  cost_usd         numeric,
  invoked_at       timestamptz not null,
  provider_name    text,
  endpoint_id      text,
  source           text        default 'openrouter_activity_sync'
);

create index if not exists api_invocation_logs_key_time on api_invocation_logs (key_name, invoked_at desc);
create index if not exists api_invocation_logs_proj_time on api_invocation_logs (project_name, invoked_at desc);

-- Dedup index: treat (key_name, endpoint_id) as unique when endpoint_id is known
create unique index if not exists api_invocation_logs_endpoint_dedup
  on api_invocation_logs (key_name, endpoint_id)
  where endpoint_id is not null;

alter table api_invocation_logs disable row level security;
