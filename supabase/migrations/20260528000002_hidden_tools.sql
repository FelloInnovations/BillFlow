create table if not exists hidden_tools (
  id         uuid default gen_random_uuid() primary key,
  tool_key   text not null unique,  -- canonical name or "OpenRouter:keyname"
  hidden_at  timestamptz not null default now()
);
