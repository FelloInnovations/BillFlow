-- Add openrouter_api_key column to agents_portfolio
alter table agents_portfolio add column if not exists openrouter_api_key text;

-- Seed OpenRouter key names from the AI Agents Portfolio CSV
-- WHERE clause matches on agents_projects (the column name used by the app)
update agents_portfolio set openrouter_api_key = 'octo'                              where agents_projects = 'Octo';
update agents_portfolio set openrouter_api_key = 'coworking'                         where agents_projects = 'Fia';
update agents_portfolio set openrouter_api_key = 'mad (adarsh)'                      where agents_projects = 'MAD (v2)';
update agents_portfolio set openrouter_api_key = 'octo'                              where agents_projects = 'YoungTeam Octo';
update agents_portfolio set openrouter_api_key = 'GTM-Digital-Office'                where agents_projects = 'GTM Digital Office';
update agents_portfolio set openrouter_api_key = 'fello-designer-portal'             where agents_projects = 'Fello Designer Portal';
update agents_portfolio set openrouter_api_key = 'mad (adarsh)'                      where agents_projects = 'PROSPECTOR';
update agents_portfolio set openrouter_api_key = 'mad (adarsh)'                      where agents_projects = 'Data Pilot';
update agents_portfolio set openrouter_api_key = 'mirofish'                          where agents_projects = 'Miro Fish';
update agents_portfolio set openrouter_api_key = 'ATRIUM - Agnetic real estate - Hemanth' where agents_projects = 'Atrium';
update agents_portfolio set openrouter_api_key = 'blog-writter-code'                 where agents_projects = 'Arthur for Fello';
update agents_portfolio set openrouter_api_key = 'blog-writter-code'                 where agents_projects = 'Arthur for Young Team';
update agents_portfolio set openrouter_api_key = 'aurthur_audit'                     where agents_projects = 'Arthur Audit';
update agents_portfolio set openrouter_api_key = 'aurthur_audit'                     where agents_projects = 'Arthur Crawler (brain)';
update agents_portfolio set openrouter_api_key = 'billflow'                          where agents_projects = 'BillFlow';
