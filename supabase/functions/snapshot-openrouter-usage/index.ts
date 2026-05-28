// @ts-nocheck
// Scheduled edge function — runs monthly to snapshot per-key OpenRouter usage.
// Uses key.usage from the provisioning keys list (NOT the activity endpoint,
// which ignores key_hash and returns account-level data for every key).
// Each snapshot row stores the CUMULATIVE all-time usage for that key at that
// point in time. Monthly spending is derived as deltas between consecutive rows.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const provKey = Deno.env.get('OPENROUTER_PROVISIONING_KEY');
    if (!provKey) {
      return new Response(
        JSON.stringify({ success: false, reason: 'OPENROUTER_PROVISIONING_KEY not set' }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // List all named keys — each object includes key.usage (cumulative per-key spend)
    const keysRes = await fetch('https://openrouter.ai/api/v1/keys', {
      headers: { Authorization: `Bearer ${provKey}` },
    });
    if (!keysRes.ok) throw new Error(`keys API ${keysRes.status}: ${await keysRes.text()}`);

    const keys: Array<{ name?: string; hash?: string; usage?: number }> = (await keysRes.json()).data ?? [];

    const currentMonth = new Date().toISOString().substring(0, 7); // 'YYYY-MM'
    const results: Array<{ key: string; usage_total: number; error?: string }> = [];

    const rows = keys
      .filter((k) => k.name)
      .map((k) => ({
        key_name: k.name!,
        month: currentMonth,
        usage_total: k.usage ?? 0,
        snapshot_at: new Date().toISOString(),
      }));

    if (rows.length > 0) {
      const { error } = await db
        .from('openrouter_usage_snapshots')
        .upsert(rows, { onConflict: 'key_name,month' });
      if (error) throw new Error(error.message);
    }

    for (const k of keys.filter((k) => k.name)) {
      results.push({ key: k.name!, usage_total: k.usage ?? 0 });
    }

    return new Response(
      JSON.stringify({ success: true, current_month: currentMonth, keys_snapshotted: rows.length, results }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, reason: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
