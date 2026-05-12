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
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch OpenRouter usage' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const data = await response.json();
    return new Response(
      JSON.stringify({ success: true, usage_monthly: data.data.usage_monthly }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
