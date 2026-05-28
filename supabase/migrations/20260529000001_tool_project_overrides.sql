create table if not exists tool_project_overrides (
  id uuid primary key default gen_random_uuid(),
  vendor_name text not null,
  project_names text[] not null default '{}',
  notes text,
  attributed_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint tool_project_overrides_vendor_unique unique (vendor_name)
);

alter table tool_project_overrides disable row level security;
