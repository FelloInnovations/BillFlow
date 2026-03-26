// @ts-nocheck
// Deploy: supabase functions deploy verify-otp
// Secrets: SUPABASE_SERVICE_ROLE_KEY
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, otp } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // Hash the incoming OTP
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(otp));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const otpHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Fetch vault_members row
    const { data: member, error } = await supabase
      .from('vault_members')
      .select('otp_hash, otp_expires_at, otp_used')
      .eq('email', email)
      .single();

    if (error || !member) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email not found.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate OTP
    if (member.otp_used) {
      return new Response(
        JSON.stringify({ success: false, error: 'This code has already been used.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!member.otp_expires_at || new Date(member.otp_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Code has expired. Please request a new one.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (member.otp_hash !== otpHash) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid code. Try again.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark OTP as used
    await supabase
      .from('vault_members')
      .update({ otp_used: true })
      .eq('email', email);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
