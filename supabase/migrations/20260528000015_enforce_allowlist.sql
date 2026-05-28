-- Migration 15: Enforce authorized key allowlist
-- Removes unauthorized projects, nulls unauthorized keys, purges unauthorized log/snapshot rows.

-- ── 1. Remove unauthorized projects inserted in migration 14 ────────────────
delete from agents_portfolio
  where agents_projects in (
    'PatchPilot',
    'n8n Automation',
    'LLM Layer for AI Blog',
    'Stephen Octo',
    'AI Strategist (Arpan)'
  );

-- ── 2. Null out Reddit Mentions key (project stays, key is unauthorized) ────
update agents_portfolio
  set openrouter_api_key = null
  where agents_projects = 'Reddit Mentions';

-- ── 3. Null out any remaining unauthorized keys (defense in depth) ───────────
-- Fello Academy is stored as a single comma-separated string — keep it exactly.
update agents_portfolio
  set openrouter_api_key = null
  where openrouter_api_key is not null
    and openrouter_api_key not in (
      'octo', 'billflow', 'coworking', 'mad (adarsh)', 'GTM-Digital-Office',
      'fello-designer-portal', 'blog-writter-code', 'aurthur_audit',
      'Felix Sells', 'felix-launch-command-center',
      'ATRIUM - Agnetic real estate - Hemanth', 'Marketing Labs - Hemanth',
      'Fello_Academy_Main, Fello_Academy_Backup',
      'openclaw (nikhil)', 'openclaw(riyon)', 'spiderclaw',
      'signalcards(boduu)', 'mirofish', 'scrrpy(code version)'
    );

-- ── 4. Purge unauthorized rows from api_invocation_logs ─────────────────────
delete from api_invocation_logs
  where key_name not in (
    'octo', 'billflow', 'coworking', 'mad (adarsh)', 'GTM-Digital-Office',
    'fello-designer-portal', 'blog-writter-code', 'aurthur_audit',
    'Felix Sells', 'felix-launch-command-center',
    'ATRIUM - Agnetic real estate - Hemanth', 'Marketing Labs - Hemanth',
    'Fello_Academy_Main', 'Fello_Academy_Backup',
    'openclaw (nikhil)', 'openclaw(riyon)', 'spiderclaw',
    'signalcards(boduu)', 'mirofish', 'scrrpy(code version)'
  );

-- ── 5. Purge unauthorized rows from openrouter_usage_snapshots ──────────────
delete from openrouter_usage_snapshots
  where key_name not in (
    'octo', 'billflow', 'coworking', 'mad (adarsh)', 'GTM-Digital-Office',
    'fello-designer-portal', 'blog-writter-code', 'aurthur_audit',
    'Felix Sells', 'felix-launch-command-center',
    'ATRIUM - Agnetic real estate - Hemanth', 'Marketing Labs - Hemanth',
    'Fello_Academy_Main', 'Fello_Academy_Backup',
    'openclaw (nikhil)', 'openclaw(riyon)', 'spiderclaw',
    'signalcards(boduu)', 'mirofish', 'scrrpy(code version)'
  );

-- ── 6. Remove guardrails for projects no longer in portfolio ─────────────────
delete from project_guardrails
  where project_name not in (
    select agents_projects from agents_portfolio
  );
