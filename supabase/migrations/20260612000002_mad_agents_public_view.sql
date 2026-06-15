-- Expose mad.agents through the public schema so the PostgREST API can reach it
-- without relying on the "mad" schema being listed in db_extra_search_path.
-- The Supabase service-role key has SELECT on all schemas; this view is just a
-- compatibility shim so supabase-js doesn't need .schema("mad").
CREATE OR REPLACE VIEW public.mad_agents AS
  SELECT * FROM mad.agents;

-- Grant the service role and anon role read access (mirrors the pattern used
-- for other public tables; RLS on the underlying mad.agents is not bypassed).
GRANT SELECT ON public.mad_agents TO service_role, anon, authenticated;
