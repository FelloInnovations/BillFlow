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
    const response = await fetch('https://openrouter.ai/api/v1/activity', {
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(
        JSON.stringify({ success: false, error: err }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const daily = data.data || [];

    // Group daily entries by month and sum cost
    const monthly = {};
    let total30d = 0;

    for (const entry of daily) {
      const month = entry.date?.substring(0, 7); // 'YYYY-MM'
      if (!month) continue;
      // Try different possible cost field names
      const cost = parseFloat(entry.cost ?? entry.total_cost ?? entry.spend ?? 0);
      if (!monthly[month]) monthly[month] = 0;
      monthly[month] += cost;
      total30d += cost;
    }

    // Round all monthly values
    for (const m in monthly) {
      monthly[m] = Math.round(monthly[m] * 100) / 100;
    }

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return new Response(
      JSON.stringify({
        success: true,
        monthly,
        current_month: currentMonth,
        usage_this_month: monthly[currentMonth] || 0,
        usage_total_30d: Math.round(total30d * 100) / 100
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
