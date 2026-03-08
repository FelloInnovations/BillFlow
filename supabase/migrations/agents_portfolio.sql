-- Create agents_portfolio table
create table if not exists agents_portfolio (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  description text,
  timeline text,
  llms jsonb not null default '[]'::jsonb,
  services text[] not null default '{}'
);

-- Disable RLS for internal use
alter table agents_portfolio disable row level security;

-- Seed from existing static data
insert into agents_portfolio (name, description, llms, services) values
  ('Scrapey', 'Auto-enriches Real Estate and Mortgage professional details from Zillow, LinkedIn, and web sources, delivering to Sales on demo bookings',
    '[{"provider":"Perplexity","model":"sonar-reasoning-pro","owner":"Riyon"},{"provider":"Anthropic","model":"Sonnet 4","owner":"Riyon"},{"provider":"Anthropic","model":"Sonnet 4.5","owner":"Riyon"},{"provider":"Google","model":"Gemini 2.0-flash","owner":"Riyon"},{"provider":"OpenAI","model":"gpt-4o-mini","owner":"Innovations"}]',
    '{"ScraperAPI"}'),
  ('AI SDR', 'Identifies website visitors, researches their activity and company, sends personalized outreach emails',
    '[]', '{"Vector"}'),
  ('DB Health Report Quiz', 'Comprehensive agent database diagnostics through intelligent questioning',
    '[{"provider":"OpenAI","model":"gpt-4","owner":"Tom"}]', '{}'),
  ('Real Estate Team Analyser', 'Multi-agent system gathering team transactions, details, tech stack, social presence, reviews and ratings',
    '[]', '{"Oxylabs","Apify"}'),
  ('LLM SEO', 'Produces 25+ AI-optimized articles weekly on Fello and real estate for maximum LLM citations and reach',
    '[{"provider":"Anthropic","model":"TBD","owner":"TBD"}]', '{"Profound"}'),
  ('Churn Call Analysis', 'Comprehensive chronological report on churned client calls',
    '[{"provider":"Anthropic","model":"TBD","owner":"TBD"}]', '{}'),
  ('Reddit Mentions', 'Real-time monitoring of brand mentions and discussions on Reddit',
    '[]', '{"Mention"}'),
  ('AI Reviewer / QA', 'Independent validation layer with autonomous logic across all AI workflows',
    '[{"provider":"Anthropic","model":"TBD","owner":"TBD"}]', '{}'),
  ('Product Marketing AI Agent', 'Real-time competitive gap analysis identifying opportunities against competitor features',
    '[{"provider":"Anthropic","model":"TBD","owner":"TBD"}]', '{}'),
  ('AI Resume Analyser', 'Ranks top candidates from application pools based on requirements',
    '[{"provider":"OpenAI","model":"TBD","owner":"TBD"}]', '{}'),
  ('Mega Agent Directory', 'Enriching entire US Real Estate professionals and teams in proprietary infrastructure',
    '[{"provider":"Anthropic","model":"TBD","owner":"TBD"}]', '{"Oxylabs","Apify"}'),
  ('Testimonial Agent', 'Converts customer call recordings into testimonial blogs',
    '[{"provider":"Anthropic","model":"TBD","owner":"TBD"}]', '{}'),
  ('Data Enrichment Pipeline', 'Comprehensive data operations supporting Sales, Marketing, and RevOps teams',
    '[]', '{"Apollo","Oxylabs"}'),
  ('CRM Agent', 'Enriching CRM for MAD',
    '[{"provider":"xAI","model":"Grok","owner":"TBD"}]', '{}'),
  ('Social Media Agent', 'Enriching Social Media for MAD',
    '[{"provider":"Google","model":"Gemini","owner":"TBD"}]', '{}'),
  ('Octo (MCP)', 'MCP-based orchestration agent',
    '[]', '{"ngrok"}'),
  ('HubSpot Enrichment', 'Enriches HubSpot contact lists for Sales, CS, and event attendees',
    '[{"provider":"Anthropic","model":"TBD","owner":"TBD"}]', '{"Apollo","ScraperAPI"}');
