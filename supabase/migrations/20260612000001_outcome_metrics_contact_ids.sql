-- Add contact_ids column for cross-project deduplication
ALTER TABLE project_outcome_metrics
  ADD COLUMN IF NOT EXISTS contact_ids jsonb NULL DEFAULT NULL;

COMMENT ON COLUMN project_outcome_metrics.contact_ids IS
  'HubSpot contact IDs contributing to this metric row.
   NULL for Supabase-only metrics (agents_enriched_total, agents_enriched_period).
   Count metrics: string[]  e.g. ["12345","67890"]
   ARR metric:    Record<contactId, amount>  e.g. {"12345": 1200, "67890": 840}
   Used for cross-project deduplication on the Outcomes index page.';

-- Enrichment project configuration
INSERT INTO project_outcome_config (project_id, metric_key, label, sort_order, is_active)
VALUES
  ('enrichment', 'agents_enriched_total',  'Agents Enriched (All Time)', 1, true),
  ('enrichment', 'agents_enriched_period', 'Agents Enriched (Period)',   2, true),
  ('enrichment', 'agents_pushed_hubspot',  'Pushed to HubSpot',          3, true),
  ('enrichment', 'demos_booked_mtd',       'Demos Booked',               4, true),
  ('enrichment', 'demos_held_mtd',         'Demos Held',                 5, true),
  ('enrichment', 'closed_won_mtd',         'Closed Won',                 6, true),
  ('enrichment', 'arr_closed_mtd',         'ARR Closed',                 7, true)
ON CONFLICT DO NOTHING;
