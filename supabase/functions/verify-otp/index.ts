// @ts-nocheck
// Deploy: supabase functions deploy verify-otp
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ok  = (body: object) => new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (msg: string)  => new Response(JSON.stringify({ success: false, error: msg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email, otp } = await req.json();
    if (!email || !otp) return err('Missing email or otp.');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Hash the incoming OTP
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(String(otp)));
    const otpHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Fetch vault_members row
    const { data: member, error: fetchErr } = await supabase
      .from('vault_members')
      .select('otp_hash, otp_expires_at, otp_used')
      .eq('email', email)
      .single();

    if (fetchErr || !member) return err('Email not found.');
    if (member.otp_used)    return err('This code has already been used. Request a new one.');
    if (!member.otp_expires_at || new Date(member.otp_expires_at) < new Date()) return err('Code has expired. Request a new one.');
    if (member.otp_hash !== otpHash) return err('Invalid code. Try again.');

    // Mark OTP as used
    await supabase.from('vault_members').update({ otp_used: true }).eq('email', email);

    // Generate a magic-link token so the frontend can get a real session
    // without needing to know the user's password
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { shouldCreateUser: true },
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      return err(`Failed to create session token: ${linkErr?.message ?? 'unknown'}`);
    }

    return ok({ success: true, token_hash: linkData.properties.hashed_token });

  } catch (e) {
    return err(e.message ?? 'Internal error.');
  }
});
