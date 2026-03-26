// @ts-nocheck
// Deploy: supabase functions deploy create-account
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
    const { email, password } = await req.json();
    if (!email || !password) return err('Missing email or password.');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check vault_members
    const { data: member, error: memberError } = await supabase
      .from('vault_members')
      .select('email, role, is_active')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    if (memberError || !member) return err('You are not authorised to access BillFlow Vault.');

    // Try to create; if user exists, update password
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      if (createError.message?.toLowerCase().includes('already') ||
          createError.message?.toLowerCase().includes('exist')) {
        // User exists — update their password and return their ID
        const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        if (listErr) return err(listErr.message);
        const existing = users.find((u: any) => u.email === email);
        if (!existing) return err('User not found.');
        await supabase.auth.admin.updateUserById(existing.id, { password });
        return ok({ success: true, userId: existing.id, role: member.role });
      }
      return err(createError.message);
    }

    return ok({ success: true, userId: userData.user.id, role: member.role });

  } catch (e) {
    return err(e.message ?? 'Internal error.');
  }
});
