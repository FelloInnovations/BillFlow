// @ts-nocheck
// Deploy: supabase functions deploy notify-admin
// Set secret: supabase secrets set RESEND_API_KEY=your_key_here

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const { newUserEmail, role, createdAt } = await req.json();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'BillFlow <onboarding@resend.dev>',
      to: 'shailja.dwivedi@fello.ai',
      subject: `[BillFlow] New account created — ${newUserEmail}`,
      html: `
        <h2>New BillFlow Account</h2>
        <p><strong>Email:</strong> ${newUserEmail}</p>
        <p><strong>Role:</strong> ${role}</p>
        <p><strong>Created at:</strong> ${createdAt}</p>
        <p>To revoke access at any time, set <code>is_active = false</code> in the <code>vault_members</code> table in Supabase.</p>
        <p><a href="https://spendsync-production.up.railway.app/">Open BillFlow</a></p>
      `
    })
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
});
