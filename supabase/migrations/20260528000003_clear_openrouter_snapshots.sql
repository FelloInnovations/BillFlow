-- Clear all openrouter_usage_snapshots rows that were stored with account-level
-- totals instead of per-key totals. The snapshot-openrouter-usage function
-- now uses key.usage from the keys list (correct per-key data). A fresh
-- snapshot run will repopulate this table with accurate per-key amounts.
DELETE FROM openrouter_usage_snapshots;
