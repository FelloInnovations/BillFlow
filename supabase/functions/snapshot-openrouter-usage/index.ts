// @ts-nocheck
// Scheduled edge function — runs monthly to snapshot per-key OpenRouter usage.
// Uses key.usage from the provisioning keys list (NOT the activity endpoint,
// which ignores key_hash and returns account-level data for every key).
// Each snapshot row stores the CUMULATIVE all-time usage for that key at that
// point in time. Monthly spending is derived as deltas between consecutive rows.
// Also syncs account-level activity records to api_invocation_logs.
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

    // ── 1. Snapshot per-key cumulative usage ─────────────────────────────────
    const keysRes = await fetch('https://openrouter.ai/api/v1/keys', {
      headers: { Authorization: `Bearer ${provKey}` },
    });
    if (!keysRes.ok) throw new Error(`keys API ${keysRes.status}: ${await keysRes.text()}`);

    const keys: Array<{ name?: string; hash?: string; usage?: number }> = (await keysRes.json()).data ?? [];

    const currentMonth = new Date().toISOString().substring(0, 7);
    const snapshotRows = keys
      .filter((k) => k.name)
      .map((k) => ({
        key_name: k.name!,
        month: currentMonth,
        usage_total: k.usage ?? 0,
        snapshot_at: new Date().toISOString(),
      }));

    if (snapshotRows.length > 0) {
      const { error } = await db
        .from('openrouter_usage_snapshots')
        .upsert(snapshotRows, { onConflict: 'key_name,month' });
      if (error) throw new Error(error.message);
    }

    // ── 2. Sync account-level activity to api_invocation_logs ────────────────
    // Note: OR's key_hash filter on /activity is ignored; this is account-level.
    let activitySynced = 0;
    try {
      const activityRes = await fetch('https://openrouter.ai/api/v1/activity', {
        headers: { Authorization: `Bearer ${provKey}` },
      });
      if (activityRes.ok) {
        const activityJson = await activityRes.json();
        const records: Array<{
          id?: string;
          date?: string;
          model?: string;
          usage?: number;
          requests?: number;
          prompt_tokens?: number;
          completion_tokens?: number;
          endpoint_id?: string;
        }> = activityJson.data ?? [];

        const withId    = records.filter(r => r.id || r.endpoint_id).map(r => ({
          key_name:          '_account_',
          project_name:      null,
          model:             r.model ?? null,
          prompt_tokens:     r.prompt_tokens ?? null,
          completion_tokens: r.completion_tokens ?? null,
          total_tokens:      r.prompt_tokens && r.completion_tokens
            ? r.prompt_tokens + r.completion_tokens : null,
          cost_usd:          r.usage ?? null,
          invoked_at:        r.date ?? new Date().toISOString(),
          provider_name:     null,
          endpoint_id:       r.id ?? r.endpoint_id ?? null,
          source:            'openrouter_activity_sync',
        }));

        const withoutId = records.filter(r => !r.id && !r.endpoint_id).map(r => ({
          key_name:          '_account_',
          project_name:      null,
          model:             r.model ?? null,
          prompt_tokens:     r.prompt_tokens ?? null,
          completion_tokens: r.completion_tokens ?? null,
          total_tokens:      r.prompt_tokens && r.completion_tokens
            ? r.prompt_tokens + r.completion_tokens : null,
          cost_usd:          r.usage ?? null,
          invoked_at:        r.date ?? new Date().toISOString(),
          provider_name:     null,
          endpoint_id:       null,
          source:            'openrouter_activity_sync',
        }));

        if (withId.length > 0) {
          await db.from('api_invocation_logs')
            .upsert(withId, { onConflict: 'key_name,endpoint_id', ignoreDuplicates: true });
        }
        if (withoutId.length > 0) {
          await db.from('api_invocation_logs').insert(withoutId);
        }

        activitySynced = records.length;
      }
    } catch {
      // Activity sync is best-effort; don't fail the whole snapshot
    }

    return new Response(
      JSON.stringify({
        success: true,
        current_month: currentMonth,
        keys_snapshotted: snapshotRows.length,
        activity_synced: activitySynced,
        results: keys.filter(k => k.name).map(k => ({ key: k.name!, usage_total: k.usage ?? 0 })),
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, reason: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
