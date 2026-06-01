-- Marketing Labs - Hemanth key belongs to Marketing Labs only
update agents_portfolio
set openrouter_api_key = 'Marketing Labs - Hemanth'
where agents_projects = 'Marketing Labs';

-- Fello Competitor Analysis has no OpenRouter key
update agents_portfolio
set openrouter_api_key = null
where agents_projects = 'Fello Competitor Analysis';
