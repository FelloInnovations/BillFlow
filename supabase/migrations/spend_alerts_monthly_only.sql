-- Ensure limit_period is always monthly for all existing and new rows
alter table spend_alerts
  alter column limit_period set default 'monthly';

update spend_alerts set limit_period = 'monthly'
  where limit_period != 'monthly';

-- Tighten the check constraint to monthly only
alter table spend_alerts
  drop constraint if exists spend_alerts_limit_period_check;

alter table spend_alerts
  add constraint spend_alerts_limit_period_check
  check (limit_period = 'monthly');

-- notify_email column does not exist in the v2 schema (dropped in spend_alerts_v2.sql)
