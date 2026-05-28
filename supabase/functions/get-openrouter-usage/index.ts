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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url = new URL(req.url);
    const keyName = url.searchParams.get('key_name');
    const provKey = Deno.env.get('OPENROUTER_PROVISIONING_KEY');
    const apiKey  = Deno.env.get('OPENROUTER_API_KEY');

    // ── Per-named-key path ───────────────────────────────────────────────────
    // Use key.usage from the provisioning keys list — this is the only reliable
    // per-key spend figure. The activity endpoint's key_hash filter is ignored
    // by OpenRouter and always returns account-level data.
    if (keyName) {
      if (!provKey) {
        return jsonResponse({ success: false, reason: 'OPENROUTER_PROVISIONING_KEY not configured' });
      }

      const keysRes = await fetch('https://openrouter.ai/api/v1/keys', {
        headers: { Authorization: `Bearer ${provKey}` },
      });
      if (!keysRes.ok) {
        return jsonResponse({ success: false, reason: `keys API ${keysRes.status}: ${await keysRes.text()}` });
      }

      const keysData = await keysRes.json();
      const keys: Array<{ name?: string; label?: string; hash?: string; usage?: number }> = keysData.data ?? [];
      const match = keys.find(
        (k) =>
          k.name?.toLowerCase() === keyName.toLowerCase() ||
          k.label?.toLowerCase() === keyName.toLowerCase()
      );

      if (!match) {
        return jsonResponse({ success: false, reason: `key '${keyName}' not found in OpenRouter account` });
      }

      const usage_total: number = match.usage ?? 0;

      return jsonResponse({
        success: true,
        key_name: keyName,
        key_hash: match.hash ?? null,
        usage_total,
        // No monthly breakdown available from the keys API — caller should
        // derive monthly deltas from successive snapshots in the DB.
        monthly: {},
      });
    }

    // ── Account-level fallback (no key_name) ─────────────────────────────────
    const masterKey = provKey ?? apiKey;
    if (!masterKey) {
      return jsonResponse({ success: false, reason: 'no OpenRouter API key configured' });
    }

    const creditsRes = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${masterKey}` },
    });
    if (!creditsRes.ok) {
      return jsonResponse({ success: false, reason: `credits API ${creditsRes.status}: ${await creditsRes.text()}` });
    }

    const usage_total = (await creditsRes.json()).data?.total_usage ?? 0;

    return jsonResponse({ success: true, key_name: null, key_hash: null, usage_total, monthly: {} });

  } catch (err: any) {
    return jsonResponse({ success: false, reason: err.message }, 500);
  }
});
