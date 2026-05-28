-- Clear all test guardrail rows (only development/test data exists as of 2026-05-28;
-- no production budgets have been set yet via the Activity UI).
truncate project_guardrails restart identity;
