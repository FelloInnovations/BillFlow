-- app_settings: key/value store for runtime flags (e.g. backfill lock)
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;

-- Seed backfill lock in unlocked state
INSERT INTO app_settings (key, value)
VALUES ('enrichment_backfill_lock', 'unlocked')
ON CONFLICT (key) DO NOTHING;

-- Team-level outcome metric configs for the enrichment project
INSERT INTO project_outcome_config (project_id, metric_key, label, target_value, is_active, sort_order)
VALUES
  ('enrichment', 'teams_enriched_total',      'Teams Enriched (All Time)', NULL, true, 20),
  ('enrichment', 'teams_enriched_period',      'Teams Enriched (Period)',   NULL, true, 21),
  ('enrichment', 'teams_pushed_hubspot_total', 'Teams Pushed (All Time)',   NULL, true, 22),
  ('enrichment', 'teams_pushed_hubspot',       'Teams Pushed to HubSpot',  NULL, true, 23),
  ('enrichment', 'team_demos_booked_mtd',      'Team Demos Booked',        NULL, true, 24),
  ('enrichment', 'team_demos_held_mtd',        'Team Demos Held',          NULL, true, 25),
  ('enrichment', 'team_closed_won_mtd',        'Team Deals Won',           NULL, true, 26),
  ('enrichment', 'team_arr_closed_mtd',        'Team ARR Closed',          NULL, true, 27)
ON CONFLICT (project_id, metric_key) DO NOTHING;
