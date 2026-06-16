-- Clear all enrichment outcome metrics so a fresh backfill from 2025-04-01 can run.
-- The contact pool is now restricted to createdate >= 2025-04-01 (attribution filter).
DELETE FROM project_outcome_metrics
WHERE project_id = 'enrichment';
