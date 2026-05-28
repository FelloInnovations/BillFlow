-- Add SignalCards project (idempotent — insert only if not already present)
insert into agents_portfolio (row_number, agents_projects, description, llms, llm_accounts, services_used, status, openrouter_api_key)
select (select coalesce(max(row_number), 0) + 1 from agents_portfolio), 'SignalCards', '', 'OpenRouter', '', '', 'r&d', 'signalcards(boduu)'
where not exists (
  select 1 from agents_portfolio where agents_projects = 'SignalCards'
);

-- Ensure key and status are correct if row already existed
update agents_portfolio
set openrouter_api_key = 'signalcards(boduu)', status = 'r&d'
where agents_projects = 'SignalCards';

-- Rename Prospector → Pipeline Monitor
update agents_portfolio
set agents_projects = 'Pipeline Monitor'
where agents_projects = 'Prospector';
