// @ts-nocheck
// Scheduled edge function — syncs per-key activity from OpenRouter to Supabase.
// Uses provisioning key to list all keys, then fetches activity per key_hash.
// Writes attributed rows to api_invocation_logs and monthly sums to openrouter_usage_snapshots.
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

    // Optional body: { key_names: string[] } to sync only specific keys
    let filterKeyNames: string[] | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.key_names) && body.key_names.length > 0) {
        filterKeyNames = body.key_names;
      }
    } catch {
      // No body or not JSON — sync all keys
    }

    // ── 1. Fetch all keys from OpenRouter ────────────────────────────────────
    const keysRes = await fetch('https://openrouter.ai/api/v1/keys', {
      headers: { Authorization: `Bearer ${provKey}` },
    });
    if (!keysRes.ok) throw new Error(`keys API ${keysRes.status}: ${await keysRes.text()}`);

    const allKeys: Array<{ name?: string; hash?: string; usage?: number }> = (await keysRes.json()).data ?? [];
    const keys = allKeys.filter(k => k.name && k.hash && (
      filterKeyNames === null || filterKeyNames.includes(k.name)
    ));

    // ── 2. Fetch project_name mapping from agents_portfolio ──────────────────
    const { data: portfolioRows } = await db
      .from('agents_portfolio')
      .select('project_name, openrouter_key_name');
    const keyToProject = new Map<string, string>();
    for (const row of (portfolioRows ?? [])) {
      if (row.openrouter_key_name && row.project_name) {
        keyToProject.set(row.openrouter_key_name, row.project_name);
      }
    }

    // ── 3. Per-key activity sync ─────────────────────────────────────────────
    let totalLogRowsWritten = 0;
    const errors: string[] = [];
    const syncedKeys: string[] = [];

    for (const key of keys) {
      try {
        const actRes = await fetch(
          `https://openrouter.ai/api/v1/activity?api_key_hash=${encodeURIComponent(key.hash!)}`,
          { headers: { Authorization: `Bearer ${provKey}` } }
        );
        if (!actRes.ok) {
          errors.push(`${key.name}: activity API ${actRes.status}`);
          continue;
        }

        const actJson = await actRes.json();
        const records: Array<{
          date?: string;
          model?: string;
          endpoint_id?: string;
          usage?: number;
          requests?: number;
          prompt_tokens?: number;
          completion_tokens?: number;
          provider_name?: string;
        }> = actJson.data ?? [];

        if (records.length === 0) {
          syncedKeys.push(key.name!);
          continue;
        }

        const projectName = keyToProject.get(key.name!) ?? null;

        // Build log rows — one per activity record
        const logRows = records.map(r => ({
          key_name:          key.name!,
          project_name:      projectName,
          model:             r.model ?? null,
          prompt_tokens:     r.prompt_tokens ?? null,
          completion_tokens: r.completion_tokens ?? null,
          total_tokens:      (r.prompt_tokens != null && r.completion_tokens != null)
            ? r.prompt_tokens + r.completion_tokens
            : null,
          cost_usd:          r.usage ?? null,
          invoked_at:        r.date ? `${r.date.substring(0, 10)}T00:00:00Z` : new Date().toISOString(),
          provider_name:     r.provider_name ?? null,
          endpoint_id:       r.endpoint_id ?? null,
          source:            'openrouter_activity_sync',
        }));

        const { error: upsertErr, count } = await db
          .from('api_invocation_logs')
          .upsert(logRows, {
            onConflict: 'key_name,endpoint_id,invoked_at',
            ignoreDuplicates: false,
          })
          .select('id');

        if (upsertErr) {
          errors.push(`${key.name}: upsert error — ${upsertErr.message}`);
          continue;
        }

        // Build monthly sums from activity data for openrouter_usage_snapshots
        const monthMap = new Map<string, number>();
        for (const r of records) {
          if (!r.date) continue;
          const month = r.date.substring(0, 7); // 'YYYY-MM' (works for both "2026-05-27" and "2026-05-27 00:00:00")
          monthMap.set(month, (monthMap.get(month) ?? 0) + (r.usage ?? 0));
        }

        const snapshotRows = [...monthMap.entries()].map(([month, usage_total]) => ({
          key_name:    key.name!,
          month,
          usage_total,
          snapshot_at: new Date().toISOString(),
        }));

        if (snapshotRows.length > 0) {
          const { error: snapErr } = await db
            .from('openrouter_usage_snapshots')
            .upsert(snapshotRows, { onConflict: 'key_name,month' });
          if (snapErr) {
            errors.push(`${key.name}: snapshot upsert — ${snapErr.message}`);
          }
        }

        totalLogRowsWritten += logRows.length;
        syncedKeys.push(key.name!);
      } catch (e: any) {
        errors.push(`${key.name}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced_keys: syncedKeys.length,
        key_names: syncedKeys,
        total_log_rows_written: totalLogRowsWritten,
        errors,
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
