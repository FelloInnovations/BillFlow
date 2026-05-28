-- Enable pg_cron and pg_net if not already active
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Remove any existing job with this name before (re)creating
select cron.unschedule('guardrail-check-daily')
where exists (select 1 from cron.job where jobname = 'guardrail-check-daily');

-- Run guardrail-check every day at 09:00 UTC (14:30 IST)
select cron.schedule(
  'guardrail-check-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url     := 'https://cqrfboirwwnlmpzfdbyl.supabase.co/functions/v1/guardrail-check',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxcmZib2lyd3dubG1wemZkYnlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxNTAwNTEsImV4cCI6MjA2NTcyNjA1MX0.BHTnxhXvGBlvsrxKmon7fqnUqISEXa43EjVJIk0pFIA'
    ),
    body    := '{}'::jsonb
  ) as request_id;
  $$
);
