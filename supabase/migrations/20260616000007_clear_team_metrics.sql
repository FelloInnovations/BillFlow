-- Clear team metric rows written by the previous (incorrect) backfill that used
-- the contacts API instead of the companies API. Re-run the team backfill after deploy.
DELETE FROM project_outcome_metrics
WHERE project_id = 'enrichment'
  AND metric_key IN (
    'teams_enriched_total',
    'teams_enriched_period',
    'teams_pushed_hubspot',
    'teams_pushed_hubspot_total',
    'team_demos_booked_mtd',
    'team_demos_held_mtd',
    'team_closed_won_mtd',
    'team_arr_closed_mtd'
  );
