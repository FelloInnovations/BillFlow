-- Remove enrichment metrics before April 2025 (pilot did not start until then)
DELETE FROM project_outcome_metrics
WHERE project_id = 'enrichment'
  AND date < '2025-04-01';
