// @ts-nocheck
// Deploy: supabase functions deploy send-otp
// Secrets: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
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
    const { email } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // Verify email is in vault_members
    const { data: member, error: memberError } = await supabase
      .from('vault_members')
      .select('email, is_active')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    if (memberError || !member) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email not authorised.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate cryptographically random 6-digit OTP
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const otpCode = String(100000 + (arr[0] % 900000));

    // Hash OTP with SHA-256
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(otpCode));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const otpHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Set expiry 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Store hashed OTP in vault_members
    const { error: updateError } = await supabase
      .from('vault_members')
      .update({
        otp_hash: otpHash,
        otp_expires_at: expiresAt,
        otp_used: false
      })
      .eq('email', email);

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to store OTP.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: email,
        subject: 'BillFlow Vault — your sign-in code',
        html: `
          <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:32px;background:#080b10;color:#dce4f0;border-radius:12px;">
            <h2 style="color:#00d4ff;margin:0 0 4px;">BillFlow Vault</h2>
            <p style="color:#8a9ab5;margin:0 0 32px;font-size:13px;">END-TO-END ENCRYPTED</p>
            <p style="color:#8a9ab5;margin:0 0 16px;font-size:14px;">Your one-time sign-in code:</p>
            <div style="font-size:42px;font-weight:700;letter-spacing:14px;color:#ffffff;text-align:center;padding:24px;background:#0e1219;border-radius:10px;margin-bottom:24px;border:1px solid rgba(255,255,255,0.07);">
              ${otpCode}
            </div>
            <p style="color:#8a9ab5;font-size:13px;">This code expires in <strong style="color:#dce4f0;">10 minutes</strong>.</p>
            <p style="color:#8a9ab5;font-size:13px;">Do not share this code with anyone.</p>
            <p style="color:#5c6b84;font-size:11px;margin-top:32px;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">If you did not request this code, ignore this email. Your vault remains secure.</p>
          </div>
        `
      })
    });

    if (!resendRes.ok) {
      const resendError = await resendRes.json();
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send email.', detail: resendError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
