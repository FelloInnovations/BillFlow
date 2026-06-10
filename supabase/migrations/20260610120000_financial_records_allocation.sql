ALTER TABLE financial_records
  ADD COLUMN IF NOT EXISTS project_id text NULL,
  ADD COLUMN IF NOT EXISTS cost_type text NULL,
  ADD COLUMN IF NOT EXISTS allocated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS allocated_by text NULL;

ALTER TABLE financial_records
  DROP CONSTRAINT IF EXISTS financial_records_cost_type_check;

ALTER TABLE financial_records
  ADD CONSTRAINT financial_records_cost_type_check
  CHECK (cost_type IN ('project_specific', 'shared_infrastructure', 'shared_tooling', 'unallocated'));

CREATE INDEX IF NOT EXISTS idx_financial_records_project ON financial_records(project_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_cost_type ON financial_records(cost_type);
