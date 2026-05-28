-- Clear services_used for R&D projects so they never appear in any vendor→project map.
-- R&D projects (OpenClaw variants and others) are experimental and must not
-- attribute shared infrastructure costs to themselves.
UPDATE agents_portfolio
SET services_used = ''
WHERE lower(status) = 'r&d';
