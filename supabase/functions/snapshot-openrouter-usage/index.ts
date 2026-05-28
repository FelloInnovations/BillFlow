// @ts-nocheck
// Scheduled edge function — runs monthly to snapshot per-key OpenRouter usage.
// On first invocation it backfills all available history; subsequent runs update
// the previous calendar month (finalized data) and the current live month.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function groupByMonth(daily: Array<{ date?: string; usage?: string }>): Record<string, number> {
  const monthly: Record<string, number> = {};
  for (const entry of daily) {
    const month = entry.date?.substring(0, 7);
    if (!month) continue;
    const cost = parseFloat(entry.usage ?? '0');
    monthly[month] = Math.round(((monthly[month] ?? 0) + cost) * 1000) / 1000;
  }
  return monthly;
}

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

    // 1. List all named keys
    const keysRes = await fetch('https://openrouter.ai/api/v1/keys', {
      headers: { Authorization: `Bearer ${provKey}` },
    });
    if (!keysRes.ok) throw new Error(`keys API ${keysRes.status}: ${await keysRes.text()}`);

    const keys: Array<{ name?: string; hash?: string }> = (await keysRes.json()).data ?? [];

    const currentMonth = new Date().toISOString().substring(0, 7); // 'YYYY-MM'
    const results: Array<{ key: string; months_upserted: number; error?: string }> = [];

    for (const key of keys) {
      if (!key.hash || !key.name) continue;

      try {
        const activityRes = await fetch(
          `https://openrouter.ai/api/v1/activity?key_hash=${encodeURIComponent(key.hash)}`,
          { headers: { Authorization: `Bearer ${provKey}` } }
        );
        if (!activityRes.ok) {
          results.push({ key: key.name, months_upserted: 0, error: `activity ${activityRes.status}` });
          continue;
        }

        const monthly = groupByMonth((await activityRes.json()).data ?? []);

        // Upsert all months — including current (live, may be updated next run)
        const rows = Object.entries(monthly).map(([month, usage_total]) => ({
          key_name: key.name,
          month,
          usage_total,
          snapshot_at: new Date().toISOString(),
        }));

        if (rows.length > 0) {
          const { error } = await db
            .from('openrouter_usage_snapshots')
            .upsert(rows, { onConflict: 'key_name,month' });
          if (error) throw new Error(error.message);
        }

        results.push({ key: key.name, months_upserted: rows.length });
      } catch (keyErr: any) {
        results.push({ key: key.name, months_upserted: 0, error: keyErr.message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, current_month: currentMonth, results }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, reason: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
