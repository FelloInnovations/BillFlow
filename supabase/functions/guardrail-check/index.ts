// @ts-nocheck
// Deploy: supabase functions deploy guardrail-check
// Invoke: POST /functions/v1/guardrail-check (or schedule via pg_cron)
// Required secrets: OPENROUTER_PROVISIONING_KEY, RESEND_API_KEY, GUARDRAIL_ALERT_EMAIL

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const provKey = Deno.env.get('OPENROUTER_PROVISIONING_KEY');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const alertEmail = Deno.env.get('GUARDRAIL_ALERT_EMAIL') ?? 'shailja.dwivedi@fello.ai';

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Get all active guardrails
    const { data: guardrails, error: gErr } = await db
      .from('project_guardrails')
      .select('*')
      .not('monthly_budget_usd', 'is', null);
    if (gErr) throw new Error(gErr.message);
    if (!guardrails?.length) return jsonResponse({ success: true, checked: 0 });

    // 2. Project → key mapping
    const { data: projects } = await db
      .from('agents_portfolio')
      .select('agents_projects, openrouter_api_key')
      .not('openrouter_api_key', 'is', null)
      .neq('openrouter_api_key', '');

    const projectToKey: Record<string, string> = {};
    for (const p of projects ?? []) {
      projectToKey[p.agents_projects] = p.openrouter_api_key;
    }

    // 3. Live cumulative usage per key
    let liveKeys: Array<{ name?: string; usage?: number }> = [];
    if (provKey) {
      const r = await fetch('https://openrouter.ai/api/v1/keys', {
        headers: { Authorization: `Bearer ${provKey}` },
      });
      if (r.ok) liveKeys = (await r.json()).data ?? [];
    }

    // 4. Last snapshot before current month per key (for period-start baseline)
    const currentMonth = new Date().toISOString().substring(0, 7);
    const { data: snapshots } = await db
      .from('openrouter_usage_snapshots')
      .select('key_name, month, usage_total')
      .lt('month', currentMonth)
      .order('month', { ascending: false });

    const prevSnapByKey: Record<string, number> = {};
    for (const s of snapshots ?? []) {
      const k = s.key_name.toLowerCase();
      if (prevSnapByKey[k] === undefined) {
        prevSnapByKey[k] = Number(s.usage_total);
      }
    }

    const results = [];

    for (const g of guardrails) {
      const keyName = projectToKey[g.project_name];
      if (!keyName) continue;

      const keyLower = keyName.toLowerCase();
      const liveEntry = liveKeys.find(k => k.name?.toLowerCase() === keyLower);
      const liveTotal = liveEntry?.usage ?? 0;
      const periodStart = prevSnapByKey[keyLower] ?? 0;
      const currentSpend = Math.max(0, liveTotal - periodStart);
      const budget = Number(g.monthly_budget_usd);
      const pct = (currentSpend / budget) * 100;

      const alreadyWarnedThisPeriod =
        g.last_warned_at ? g.last_warned_at.substring(0, 7) === currentMonth : false;

      const shouldAlert = (pct >= g.warning_threshold_pct || pct >= 100) && !alreadyWarnedThisPeriod;

      if (shouldAlert && resendKey) {
        const isOver = pct >= 100;
        const subject = isOver
          ? `[BillFlow] Budget limit reached — ${g.project_name}`
          : `[BillFlow] Budget warning — ${g.project_name} at ${pct.toFixed(0)}%`;

        const html = `
          <h2 style="color:${isOver ? '#e11d48' : '#d97706'}">${isOver ? '🚨 Budget Limit Reached' : '⚠️ Budget Warning'}</h2>
          <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Project</td><td><strong>${g.project_name}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Spent</td><td><strong>$${currentSpend.toFixed(2)}</strong> of $${budget.toFixed(2)} budget</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Usage</td><td><strong>${pct.toFixed(1)}%</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Period</td><td>${currentMonth}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Threshold</td><td>${g.warning_threshold_pct}%</td></tr>
          </table>
          <p style="margin-top:16px"><a href="https://spendsync-production.up.railway.app/activity" style="color:#6366f1">View Activity Dashboard →</a></p>
        `;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'BillFlow Vault <onboarding@resend.dev>',
            to: alertEmail,
            subject,
            html,
          }),
        });

        await db
          .from('project_guardrails')
          .update({ last_warned_at: new Date().toISOString() })
          .eq('id', g.id);
      }

      results.push({
        project: g.project_name,
        current_spend: currentSpend,
        budget,
        pct_used: pct,
        alerted: shouldAlert,
      });
    }

    return jsonResponse({ success: true, checked: results.length, results });
  } catch (err: any) {
    return jsonResponse({ success: false, reason: err.message }, 500);
  }
});
