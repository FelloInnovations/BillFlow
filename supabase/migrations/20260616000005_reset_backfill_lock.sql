-- Reset the enrichment backfill lock.
-- Run this after deploy if a previous backfill run crashed and left the lock set.
DELETE FROM project_outcome_metrics
WHERE project_id = 'enrichment'
  AND metric_key = 'backfill_lock';
