// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url = new URL(req.url);
    const keyName = url.searchParams.get('key_name');

    // ── Per-named-key path — read monthly snapshots from DB ─────────────────
    // Snapshots are written by snapshot-openrouter-usage; no live OR call needed.
    if (keyName) {
      const db = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const { data: snapshots, error } = await db
        .from('openrouter_usage_snapshots')
        .select('month, usage_total')
        .eq('key_name', keyName)
        .order('month', { ascending: true });

      if (error) {
        return jsonResponse({ success: false, reason: error.message });
      }

      const rows = snapshots ?? [];
      const usage_total = rows.reduce((s, r) => s + (r.usage_total ?? 0), 0);
      const monthly: Record<string, number> = {};
      for (const r of rows) monthly[r.month] = r.usage_total ?? 0;

      return jsonResponse({ success: true, key_name: keyName, usage_total, monthly });
    }

    // ── Account-level path — use completion key for /api/v1/credits ─────────
    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) {
      return jsonResponse({ success: false, reason: 'OPENROUTER_API_KEY not configured' });
    }

    const creditsRes = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!creditsRes.ok) {
      return jsonResponse({ success: false, reason: `credits API ${creditsRes.status}: ${await creditsRes.text()}` });
    }

    const usage_total = (await creditsRes.json()).data?.total_usage ?? 0;

    return jsonResponse({ success: true, key_name: null, usage_total, monthly: {} });

  } catch (err: any) {
    return jsonResponse({ success: false, reason: err.message }, 500);
  }
});
