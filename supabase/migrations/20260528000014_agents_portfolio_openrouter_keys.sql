-- Fix Scrapey 2 (code) key — OR key is 'scrrpy(code version)'
update agents_portfolio
  set openrouter_api_key = 'scrrpy(code version)'
  where agents_projects = 'Scrapey 2 (code)';

-- Fix Reddit Mentions key — OR key is 'reddit auto post'
update agents_portfolio
  set openrouter_api_key = 'reddit auto post'
  where agents_projects = 'Reddit Mentions';

-- Add missing projects seen in api_invocation_logs
insert into agents_portfolio (row_number, agents_projects, description, llms, status, openrouter_api_key) values
  (46, 'PatchPilot',            'AI-assisted patch and bug-fix workflow',              'OpenRouter',    'production', 'PatchPilot'),
  (47, 'n8n Automation',        'n8n workflow automation using LLM nodes',             'OpenRouter',    'production', 'n8n'),
  (48, 'LLM Layer for AI Blog', 'LLM pipeline powering AI blog content generation',   'OpenRouter',    'production', 'LLM layer for AI Blog'),
  (49, 'Stephen Octo',          'Octo instance for Stephen',                           'OpenRouter',    'production', 'stephen octo'),
  (50, 'AI Strategist (Arpan)', 'AI strategy agent for Arpan',                        'OpenRouter',    'production', 'ai startegist(arpan)')
on conflict do nothing;
