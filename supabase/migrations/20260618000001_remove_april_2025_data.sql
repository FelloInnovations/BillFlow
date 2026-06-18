-- Remove April 2025 data from all enrichment metrics
DELETE FROM project_outcome_metrics
WHERE project_id = 'enrichment'
  AND date >= '2025-04-01'
  AND date < '2025-05-01';

-- Remove April 2025 data from Arthur
DELETE FROM project_outcome_metrics
WHERE project_id = 'arthur'
  AND date >= '2025-04-01'
  AND date < '2025-05-01';
