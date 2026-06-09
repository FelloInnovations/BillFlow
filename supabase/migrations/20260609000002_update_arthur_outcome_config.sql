-- Replace Arthur's outcome metric config with updated 9-metric set
-- (blog_traffic_daily removed; LLM breakdown by platform added)
delete from project_outcome_config where project_id = 'arthur';

insert into project_outcome_config (project_id, metric_key, label, sort_order) values
  ('arthur', 'llm_traffic_daily',    'LLM Traffic',  1),
  ('arthur', 'llm_chatgpt_daily',    'ChatGPT',      2),
  ('arthur', 'llm_perplexity_daily', 'Perplexity',   3),
  ('arthur', 'llm_claude_daily',     'Claude',       4),
  ('arthur', 'llm_other_daily',      'Other AI',     5),
  ('arthur', 'demos_booked_mtd',     'Demos Booked', 6),
  ('arthur', 'demos_held_mtd',       'Demos Held',   7),
  ('arthur', 'closed_won_mtd',       'Closed Won',   8),
  ('arthur', 'arr_closed_mtd',       'ARR Closed',   9);

-- Remove stale blog_traffic_daily rows — metric no longer exists
delete from project_outcome_metrics
  where project_id = 'arthur' and metric_key = 'blog_traffic_daily';
