-- Remove the pg_cron job that triggered the now-deleted guardrail-check edge function.
-- n8n is the sole guardrail check runner going forward.
select cron.unschedule('guardrail-check-daily')
where exists (
  select 1 from cron.job where jobname = 'guardrail-check-daily'
);
