-- Add project_name_aliases column to agents_portfolio.
-- Aliases are alternative project_name strings stored in api_invocation_logs
-- that should resolve to this portfolio project for spend allocation.
-- E.g. Octo's aliases: ['octo-tool', 'OCTO_PROD']
ALTER TABLE agents_portfolio
  ADD COLUMN IF NOT EXISTS project_name_aliases text[] DEFAULT '{}';
