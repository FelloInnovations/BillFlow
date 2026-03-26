// @ts-nocheck
// Deploy: supabase functions deploy create-account
// Secrets: SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API → service_role)
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
    const { email, password } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // Check vault_members first
    const { data: member, error: memberError } = await supabase
      .from('vault_members')
      .select('email, role, is_active')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    if (memberError || !member) {
      return new Response(
        JSON.stringify({ success: false, error: 'You are not authorised to access BillFlow Vault.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create user with email already confirmed — no confirmation email sent
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (createError) {
      return new Response(
        JSON.stringify({ success: false, error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, userId: userData.user.id, role: member.role }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
