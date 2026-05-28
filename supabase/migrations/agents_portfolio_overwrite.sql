-- Ensure openrouter_api_key column exists
alter table agents_portfolio add column if not exists openrouter_api_key text;

-- Overwrite: this CSV is now the single source of truth
truncate table agents_portfolio;

-- Insert one row per project
-- llms rules:
--   has LLM_Used  → "OpenRouter <model>" per model (comma-separated)
--   blank LLM + has OR key → "OpenRouter"  (links project to OR spend)
--   blank LLM + no OR key → ""
-- services_used rules:
--   every project gets Supabase
--   scraper/enrichment projects also get Oxylabs, Apify, ScraperAPI
--   Octo / YoungTeam Octo also get ngrok
--   30DC Roleplay also gets ElevenLabs
insert into agents_portfolio
  (agents_projects, description, llms, llm_accounts, services_used, status, openrouter_api_key)
values
  -- ── Production ──────────────────────────────────────────────────────────
  ('Octo',
   'Original Octo — application connector for internal tools',
   'OpenRouter Sonnet 4.6',
   '', 'Supabase, ngrok', 'production', 'octo'),

  ('30DC God Mode',
   'Admin dashboard for the 30-Day Challenge portal',
   'OpenRouter gpt-4o-mini',
   '', 'Supabase', 'production', null),

  ('30DC App',
   'Real estate team challenge portal with AI chat',
   'OpenRouter gpt-4o-mini',
   '', 'Supabase', 'production', null),

  ('BillFlow',
   'Spend tracking and sync tool for internal operations',
   'OpenRouter gpt-4o-mini',
   '', 'Supabase', 'production', 'billflow'),

  ('Fia',
   'Complete AI Chatbot with Fello.ai product knowledge expertise',
   'OpenRouter Gemini Flash',
   '', 'Supabase', 'production', 'coworking'),

  ('Zillow Scraper',
   'Zillow agents and listings scraper for enrichment pipeline',
   '',
   '', 'Supabase, Oxylabs, Apify, ScraperAPI', 'production', null),

  ('30DC Roleplay',
   'AI roleplay training for real estate agents with phone simulation',
   '',
   '', 'Supabase, ElevenLabs', 'production', null),

  ('MAD (v2)',
   'Analytics dashboard for Mega Agent Directory',
   'OpenRouter',
   '', 'Supabase, Oxylabs, Apify, ScraperAPI', 'production', 'mad (adarsh)'),

  ('Team Size Webhook',
   'Webhook service for team size enrichment pipeline',
   'OpenRouter Grok, OpenRouter gpt-4o-mini',
   '', 'Supabase', 'production', null),

  ('YoungTeam Octo',
   'Young Team variant of Octo connector',
   'OpenRouter',
   '', 'Supabase, ngrok', 'production', 'octo'),

  ('AI Resume Analyser',
   'Ranks top candidates from application pools based on requirements',
   'OpenRouter Qwen 3.5',
   '', 'Supabase', 'production', null),

  ('Prospector',
   'Mega Agent Dashboard — enriching US Real Estate professionals and teams in proprietary infrastructure',
   'OpenRouter',
   '', 'Supabase, Oxylabs, Apify, ScraperAPI', 'production', 'mad (adarsh)'),

  ('Data Pilot',
   'Comprehensive data operations supporting Sales',
   'OpenRouter',
   '', 'Supabase, Oxylabs, Apify, ScraperAPI', 'production', 'mad (adarsh)'),

  ('Felix Command Center',
   '',
   'OpenRouter',
   '', 'Supabase', 'production', 'felix-launch-command-center'),

  ('Arthur for Fello',
   '',
   'OpenRouter',
   '', 'Supabase', 'production', 'blog-writter-code'),

  ('Arthur for Young Team',
   '',
   'OpenRouter',
   '', 'Supabase', 'production', 'blog-writter-code'),

  ('Arthur Audit',
   '',
   'OpenRouter',
   '', 'Supabase', 'production', 'aurthur_audit'),

  ('Scrapey 2 (code)',
   '',
   '',
   '', 'Supabase, Oxylabs, Apify, ScraperAPI', 'production', null),

  ('Webinar Enrichment',
   '',
   '',
   '', 'Supabase, Oxylabs, Apify, ScraperAPI', 'production', null),

  ('Arthur Crawler (brain)',
   '',
   'OpenRouter',
   '', 'Supabase, Oxylabs, Apify, ScraperAPI', 'production', 'aurthur_audit'),

  -- ── Prototype ────────────────────────────────────────────────────────────
  ('GTM Digital Office',
   'AI Chief of Staff — Orin bot across Google Chat & Slack',
   'OpenRouter Grok-4',
   '', 'Supabase', 'prototype', 'GTM-Digital-Office'),

  ('Fello Designer Portal',
   'Internal design portal for the Fello team',
   'OpenRouter',
   '', 'Supabase', 'prototype', 'fello-designer-portal'),

  ('Felix Job Application',
   '',
   '',
   '', 'Supabase', 'prototype', null),

  ('Felix Sells',
   '',
   'OpenRouter',
   '', 'Supabase', 'prototype', 'Felix Sells'),

  ('Atrium',
   '',
   'OpenRouter',
   '', 'Supabase', 'prototype', 'ATRIUM - Agnetic real estate - Hemanth'),

  ('Meta Ads',
   '',
   '',
   '', 'Supabase', 'prototype', null),

  ('Marketing Labs',
   '',
   'OpenRouter',
   '', 'Supabase', 'prototype', 'Marketing Labs - Hemanth'),

  ('Fello Competitor Analysis',
   '',
   'OpenRouter',
   '', 'Supabase', 'prototype', 'Marketing Labs - Hemanth'),

  ('Fello Academy',
   '',
   'OpenRouter',
   '', 'Supabase', 'prototype', 'Fello_Academy_Main, Fello_Academy_Backup'),

  -- ── R&D ─────────────────────────────────────────────────────────────────
  ('HubSpot LLM Wiki',
   'LLM-powered wiki for HubSpot knowledge base',
   '',
   '', 'Supabase', 'r&d', null),

  ('LibreChat',
   'Self-hosted LibreChat instance for internal AI experimentation',
   '',
   '', 'Supabase', 'r&d', null),

  ('OpenClaw - Nikhil',
   '',
   'OpenRouter',
   '', 'Supabase, Oxylabs, Apify, ScraperAPI', 'r&d', 'openclaw (nikhil)'),

  ('OpenClaw - Riyon',
   '',
   'OpenRouter',
   '', 'Supabase, Oxylabs, Apify, ScraperAPI', 'r&d', 'openclaw(riyon)'),

  ('OpenClaw - Aryan',
   '',
   'OpenRouter',
   '', 'Supabase, Oxylabs, Apify, ScraperAPI', 'r&d', 'spiderclaw'),

  -- ── Deprecated ───────────────────────────────────────────────────────────
  ('Scrapey',
   'Auto-enriches Real Estate professional details from Zillow',
   'OpenRouter Perplexity Sonar, OpenRouter Sonnet 4',
   '', 'Supabase, Oxylabs, Apify, ScraperAPI', 'deprecated', null),

  ('Customer Support 30DC',
   'Customer support agent for 30-Day Challenge platform',
   '',
   '', 'Supabase', 'deprecated', null),

  ('Miro Fish',
   'Experimental Miro integration tool',
   'OpenRouter',
   '', 'Supabase', 'deprecated', 'mirofish'),

  ('DB Health Report Quiz',
   'Comprehensive agent database diagnostics through intelligent questioning',
   'OpenRouter gpt-4',
   '', 'Supabase', 'deprecated', null),

  ('Churn Call Analysis',
   'Comprehensive chronological report on churned client calls',
   '',
   '', 'Supabase', 'deprecated', null),

  ('AI SDR',
   'Identified website visitors',
   '',
   '', 'Supabase, Oxylabs, Apify, ScraperAPI', 'deprecated', null),

  ('Reddit Mentions',
   'Real-time monitoring of brand mentions and discussions on Reddit',
   '',
   '', 'Supabase', 'deprecated', null),

  ('Product Marketing AI',
   'Real-time competitive gap analysis identifying opportunities against competitors',
   '',
   '', 'Supabase', 'deprecated', null),

  ('Testimonial Agent',
   'Converts customer call recordings into testimonial blogs',
   'OpenRouter gpt-4o-mini',
   '', 'Supabase', 'deprecated', null),

  ('Felix Actor',
   '',
   '',
   '', 'Supabase', 'deprecated', null);
