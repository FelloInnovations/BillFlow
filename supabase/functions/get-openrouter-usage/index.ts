// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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
    const url = new URL(req.url);
    const keyName = url.searchParams.get('key_name');
    const provKey = Deno.env.get('OPENROUTER_PROVISIONING_KEY');
    const apiKey  = Deno.env.get('OPENROUTER_API_KEY');

    // ── Per-named-key path (requires management/provisioning key) ────────────
    if (keyName) {
      if (!provKey) {
        return jsonResponse({ success: false, reason: 'OPENROUTER_PROVISIONING_KEY not configured' });
      }

      // 1. Resolve key name → hash via provisioning API
      const keysRes = await fetch('https://openrouter.ai/api/v1/auth/keys', {
        headers: { Authorization: `Bearer ${provKey}` },
      });
      if (!keysRes.ok) {
        return jsonResponse({ success: false, reason: `keys API ${keysRes.status}: ${await keysRes.text()}` });
      }

      const keysData = await keysRes.json();
      const keys: Array<{ name?: string; label?: string; hash?: string }> = keysData.data ?? [];
      const match = keys.find(
        (k) =>
          k.name?.toLowerCase() === keyName.toLowerCase() ||
          k.label?.toLowerCase() === keyName.toLowerCase()
      );

      if (!match?.hash) {
        return jsonResponse({ success: false, reason: `key '${keyName}' not found in OpenRouter account` });
      }

      // 2. Fetch full activity for this key hash
      const activityRes = await fetch(
        `https://openrouter.ai/api/v1/activity?key_hash=${encodeURIComponent(match.hash)}`,
        { headers: { Authorization: `Bearer ${provKey}` } }
      );
      if (!activityRes.ok) {
        return jsonResponse({ success: false, reason: `activity API ${activityRes.status}: ${await activityRes.text()}` });
      }

      const activityData = await activityRes.json();
      const monthly = groupByMonth(activityData.data ?? []);
      const usage_total = Object.values(monthly).reduce((s, v) => s + v, 0);

      return jsonResponse({ success: true, key_name: keyName, key_hash: match.hash, usage_total, monthly });
    }

    // ── Account-level fallback (no key_name) ─────────────────────────────────
    const masterKey = provKey ?? apiKey;
    if (!masterKey) {
      return jsonResponse({ success: false, reason: 'no OpenRouter API key configured' });
    }

    const [creditsRes, activityRes] = await Promise.all([
      fetch('https://openrouter.ai/api/v1/credits',  { headers: { Authorization: `Bearer ${masterKey}` } }),
      fetch('https://openrouter.ai/api/v1/activity', { headers: { Authorization: `Bearer ${masterKey}` } }),
    ]);

    if (!creditsRes.ok) {
      return jsonResponse({ success: false, reason: `credits API ${creditsRes.status}: ${await creditsRes.text()}` });
    }

    const usage_total = (await creditsRes.json()).data?.total_usage ?? 0;
    const monthly = activityRes.ok
      ? groupByMonth((await activityRes.json()).data ?? [])
      : {};

    return jsonResponse({ success: true, key_name: null, key_hash: null, usage_total, monthly });

  } catch (err: any) {
    return jsonResponse({ success: false, reason: err.message }, 500);
  }
});
