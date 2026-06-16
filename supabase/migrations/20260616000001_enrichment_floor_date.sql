-- Remove enrichment metrics before April 2025 (pilot did not start until then)
DELETE FROM project_outcome_metrics
WHERE project_id = 'enrichment'
  AND date < '2025-04-01';

-- NOTE: null MAD ID contacts (no DB change needed)
-- HubSpot's HAS_PROPERTY count includes contacts where mad_id field exists but is null,
-- inflating agents_pushed_hubspot_total from ~48,404 to 50,197.
-- The fix is in getAgentsPushedToHubspot (lib/hubspot-enrichment-outcomes.ts):
-- the all-time path now uses the cache (which already excludes null mad_ids via
-- the `if (!madId) continue` guard in getAllHubspotEnrichedContacts) instead of
-- the HubSpot HAS_PROPERTY total endpoint.
-- Run backfill after deploying to update the stored agents_pushed_hubspot_total value.
