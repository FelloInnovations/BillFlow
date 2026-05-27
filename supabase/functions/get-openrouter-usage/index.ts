// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const keyName = url.searchParams.get('key_name');

    const headers = {
      'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
    };

    // Per-named-key path: fetch credits for a specific API key
    if (keyName) {
      const creditsRes = await fetch(
        `https://openrouter.ai/api/v1/credits?key_name=${encodeURIComponent(keyName)}`,
        { headers }
      );

      if (!creditsRes.ok) {
        const err = await creditsRes.text();
        return new Response(
          JSON.stringify({ success: false, error: `credits: ${err}` }),
          { status: creditsRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const creditsData = await creditsRes.json();
      const usage_total = creditsData.data?.total_usage ?? 0;

      return new Response(
        JSON.stringify({ success: true, key_name: keyName, usage_total, monthly: {} }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Master-key fallback: fetch aggregate usage with the env-var key
    const [creditsRes, activityRes] = await Promise.all([
      fetch('https://openrouter.ai/api/v1/credits', { headers }),
      fetch('https://openrouter.ai/api/v1/activity', { headers }),
    ]);

    if (!creditsRes.ok) {
      const err = await creditsRes.text();
      return new Response(
        JSON.stringify({ success: false, error: `credits: ${err}` }),
        { status: creditsRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const creditsData = await creditsRes.json();
    const usage_total = creditsData.data.total_usage;

    // Activity is best-effort — chart degrades gracefully if it fails
    let monthly = {};
    if (activityRes.ok) {
      const activityData = await activityRes.json();
      const daily = activityData.data || [];

      console.log('[OpenRouter activity] first 3 raw entries:', JSON.stringify(daily.slice(0, 3)));

      for (const entry of daily) {
        const month = entry.date?.substring(0, 7); // 'YYYY-MM'
        if (!month) continue;
        const cost = parseFloat(entry.usage ?? 0);
        if (!monthly[month]) monthly[month] = 0;
        monthly[month] += cost;
      }

      for (const m in monthly) {
        monthly[m] = Math.round(monthly[m] * 100) / 100;
      }
    }

    return new Response(
      JSON.stringify({ success: true, usage_total, monthly }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
