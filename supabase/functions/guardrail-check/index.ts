// @ts-nocheck
// Deploy: supabase functions deploy guardrail-check
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, GUARDRAIL_ALERT_EMAIL
//
// TODO — Resend domain verification required before sending to @fello.ai addresses.
// Steps:
//   1. Go to https://resend.com/domains → Add Domain → enter "fello.ai"
//   2. Resend will provide a CNAME record (e.g. "send._domainkey.fello.ai → ...resend.dev")
//      and a TXT record for SPF/DMARC. Add both to your fello.ai DNS.
//   3. Once Resend shows "Verified", change the `from` field below to "BillFlow <alerts@fello.ai>"
// Until then, Resend sandbox mode only delivers to addresses verified in your Resend account.

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

// ── Team email list ──────────────────────────────────────────────────────────
const envEmails = Deno.env.get('GUARDRAIL_ALERT_EMAIL') ?? '';
const DEFAULT_TEAM_EMAILS: string[] = envEmails
  ? envEmails.split(',').map((e: string) => e.trim()).filter(Boolean)
  : [
      'shailja.dwivedi@fello.ai',
      'nikhil@fello.ai',
      'riyon@fello.ai',
      'aryan.pasreja@fello.ai',
      'rashi@fello.ai',
      'hemanth@fello.ai',
      'adarsh.badjate@fello.ai',
      'madangopal.boddu@fello.ai',
      'arpan@fello.ai',
      'amit@fello.ai',
      'innovations@fello.ai',
    ];

function resolveRecipients(notifyEmail: string): string[] {
  if (!notifyEmail || notifyEmail === 'team') return DEFAULT_TEAM_EMAILS;
  return notifyEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
}

// ── Period helpers ────────────────────────────────────────────────────────────
function computePeriodKey(periodType: string): string {
  const now = new Date();
  if (periodType === 'daily')   return now.toISOString().substring(0, 10);
  if (periodType === 'monthly') return now.toISOString().substring(0, 7);
  // ISO week: YYYY-Www
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function periodDisplayName(p: string): string {
  return p === 'daily' ? 'Today' : p === 'weekly' ? 'This Week' : 'This Month';
}

function usd(n: number): string { return `$${n.toFixed(2)}`; }

// ── Email templates ───────────────────────────────────────────────────────────
function buildImmediateHtml(
  project: string, key: string, period: string,
  threshold: number, actual: number, detectedAt: string,
): string {
  const pctStr = threshold > 0 ? `${((actual / threshold) * 100).toFixed(0)}% of threshold` : '';
  return `
<h2 style="color:#1E1B4B;font-family:sans-serif">Spend Alert — ${project}</h2>
<table style="border-collapse:collapse;width:100%;max-width:480px;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:6px 0;color:#6B7280">Period</td>
      <td style="padding:6px 0;font-weight:600">${periodDisplayName(period)}</td></tr>
  <tr><td style="padding:6px 0;color:#6B7280">Threshold</td>
      <td style="padding:6px 0;font-weight:600">${usd(threshold)}</td></tr>
  <tr><td style="padding:6px 0;color:#6B7280">Actual spend</td>
      <td style="padding:6px 0;font-weight:600;color:#DC2626">${usd(actual)} (${pctStr} over threshold)</td></tr>
  <tr><td style="padding:6px 0;color:#6B7280">OpenRouter key</td>
      <td style="padding:6px 0">${key}</td></tr>
  <tr><td style="padding:6px 0;color:#6B7280">Detected at</td>
      <td style="padding:6px 0">${detectedAt} UTC</td></tr>
</table>
<p style="color:#6B7280;font-size:13px;margin-top:16px;font-family:sans-serif">
  This is an informational alert only — no action has been taken on your OpenRouter key.
</p>
<a href="https://spendsync-production.up.railway.app/activity"
   style="display:inline-block;margin-top:12px;padding:10px 20px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-family:sans-serif">
  View Activity in BillFlow →
</a>`;
}

function buildDigestHtml(
  rows: Array<{ project_name: string; period_type: string; threshold_usd: number; actual_spend: number }>,
  digestType: string,
): { subject: string; html: string } {
  const n     = rows.length;
  const title = digestType === 'daily_digest' ? 'Daily Spend Digest' : 'Weekly Spend Digest';
  const subject = digestType === 'daily_digest'
    ? `[BillFlow] Daily spend digest — ${n} threshold${n !== 1 ? 's' : ''} crossed`
    : `[BillFlow] Weekly spend digest — ${n} threshold${n !== 1 ? 's' : ''} crossed`;

  const rowsHtml = rows.map(r => {
    const overBy = r.threshold_usd > 0
      ? `${((r.actual_spend / r.threshold_usd - 1) * 100).toFixed(0)}%`
      : '—';
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB">${r.project_name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB">${periodDisplayName(r.period_type)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;text-align:right">${usd(r.threshold_usd)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;text-align:right;color:#DC2626;font-weight:600">${usd(r.actual_spend)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;text-align:right">${overBy} over</td>
    </tr>`;
  }).join('');

  const html = `
<h2 style="color:#1E1B4B;font-family:sans-serif">${title}</h2>
<p style="color:#6B7280;font-family:sans-serif">${n} project${n !== 1 ? 's' : ''} crossed their spend thresholds.</p>
<table style="border-collapse:collapse;width:100%;max-width:600px;font-size:13px;font-family:sans-serif">
  <thead>
    <tr style="background:#1E1B4B;color:#fff">
      <th style="padding:8px 12px;text-align:left">Project</th>
      <th style="padding:8px 12px;text-align:left">Period</th>
      <th style="padding:8px 12px;text-align:right">Threshold</th>
      <th style="padding:8px 12px;text-align:right">Actual</th>
      <th style="padding:8px 12px;text-align:right">Over by</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>
<a href="https://spendsync-production.up.railway.app/activity"
   style="display:inline-block;margin-top:16px;padding:10px 20px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-family:sans-serif">
  View Activity in BillFlow →
</a>`;

  return { subject, html };
}

async function sendEmail(resendKey: string, to: string[], subject: string, html: string) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // TODO: change to "BillFlow <alerts@fello.ai>" after verifying fello.ai domain in Resend
      from: 'BillFlow <onboarding@resend.dev>',
      to,
      subject,
      html,
    }),
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Fetch all active alerts
    const { data: alerts, error: aErr } = await db
      .from('spend_alerts').select('*').eq('is_active', true);
    if (aErr) throw new Error(aErr.message);
    if (!alerts?.length) {
      return jsonResponse({ alerts_checked: 0, thresholds_crossed: 0, immediate_sent: 0, digest_queued: 0, digest_sent: 0 });
    }

    const now          = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    const todayStart   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
    const dow    = now.getUTCDay();
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - ((dow + 6) % 7));
    monday.setUTCHours(0, 0, 0, 0);

    const keyNames   = [...new Set(alerts.map(a => a.openrouter_key_name as string))];
    const periods    = [...new Set(alerts.map(a => a.period_type as string))];

    // 2. Batch spend queries
    const [dailyRes, weeklyRes, snapRes, liveRes] = await Promise.all([
      periods.includes('daily')
        ? db.from('api_invocation_logs').select('key_name, cost_usd')
            .in('key_name', keyNames).gte('invoked_at', todayStart.toISOString()).lt('invoked_at', tomorrowStart.toISOString())
        : Promise.resolve({ data: [] }),
      periods.includes('weekly')
        ? db.from('api_invocation_logs').select('key_name, cost_usd')
            .in('key_name', keyNames).gte('invoked_at', monday.toISOString())
        : Promise.resolve({ data: [] }),
      periods.includes('monthly')
        ? db.from('openrouter_usage_snapshots').select('key_name, usage_total')
            .in('key_name', keyNames).eq('month', currentMonth)
        : Promise.resolve({ data: [] }),
      periods.includes('monthly')
        ? db.from('api_invocation_logs').select('key_name, cost_usd')
            .in('key_name', keyNames).eq('source', 'live_today')
        : Promise.resolve({ data: [] }),
    ]);

    const toMap = (rows: any[], valField: string) => {
      const m: Record<string, number> = {};
      for (const r of rows ?? []) {
        const k = r.key_name as string;
        m[k] = (m[k] ?? 0) + Number(r[valField] ?? 0);
      }
      return m;
    };
    const dailyByKey   = toMap(dailyRes.data,   'cost_usd');
    const weeklyByKey  = toMap(weeklyRes.data,  'cost_usd');
    const monthlyByKey = toMap(snapRes.data,    'usage_total');
    for (const r of liveRes.data ?? []) {
      const k = r.key_name as string;
      monthlyByKey[k] = (monthlyByKey[k] ?? 0) + Number(r.cost_usd ?? 0);
    }

    let thresholds_crossed = 0, immediate_sent = 0, digest_queued = 0;

    // 3. Check each alert
    for (const alert of alerts) {
      const key       = alert.openrouter_key_name as string;
      const period    = alert.period_type as string;
      const threshold = Number(alert.threshold_usd);

      let actual = 0;
      if (period === 'daily')   actual = dailyByKey[key]   ?? 0;
      if (period === 'weekly')  actual = weeklyByKey[key]  ?? 0;
      if (period === 'monthly') actual = monthlyByKey[key] ?? 0;

      // Debug log — visible in supabase functions logs
      console.log(`[check] ${alert.project_name} | ${period} | key=${key} | actual=${actual.toFixed(4)} | threshold=${threshold}`);

      if (actual < threshold) continue;
      thresholds_crossed++;

      const currentPeriodKey = computePeriodKey(period);
      if (alert.last_period_start === currentPeriodKey) continue; // already notified this period

      if (alert.notify_frequency === 'immediate') {
        if (resendKey) {
          const subject = `[BillFlow Alert] ${alert.project_name} exceeded ${period} spend threshold`;
          const html    = buildImmediateHtml(alert.project_name as string, key, period, threshold, actual, new Date().toUTCString());
          await sendEmail(resendKey, resolveRecipients(alert.notify_email as string), subject, html);
          immediate_sent++;
        }
        await db.from('spend_alerts').update({
          last_notified_at:  new Date().toISOString(),
          last_period_start: currentPeriodKey,
          updated_at:        new Date().toISOString(),
        }).eq('id', alert.id);
      } else {
        await db.from('alert_digest_queue').insert({
          alert_id: alert.id, project_name: alert.project_name,
          period_type: period, threshold_usd: threshold,
          actual_spend: actual, digest_type: alert.notify_frequency,
        });
        await db.from('spend_alerts').update({
          last_period_start: currentPeriodKey,
          updated_at: new Date().toISOString(),
        }).eq('id', alert.id);
        digest_queued++;
      }
    }

    // 4. Process digest queues
    let digest_sent = 0;

    const { data: dailyQ } = await db
      .from('alert_digest_queue').select('*').eq('sent', false).eq('digest_type', 'daily_digest');
    if (dailyQ?.length && resendKey) {
      const { subject, html } = buildDigestHtml(dailyQ, 'daily_digest');
      await sendEmail(resendKey, DEFAULT_TEAM_EMAILS, subject, html);
      await db.from('alert_digest_queue').update({ sent: true }).eq('digest_type', 'daily_digest').eq('sent', false);
      digest_sent++;
    }

    if (now.getUTCDay() === 1) { // Monday
      const { data: weeklyQ } = await db
        .from('alert_digest_queue').select('*').eq('sent', false).eq('digest_type', 'weekly_digest');
      if (weeklyQ?.length && resendKey) {
        const { subject, html } = buildDigestHtml(weeklyQ, 'weekly_digest');
        await sendEmail(resendKey, DEFAULT_TEAM_EMAILS, subject, html);
        await db.from('alert_digest_queue').update({ sent: true }).eq('digest_type', 'weekly_digest').eq('sent', false);
        digest_sent++;
      }
    }

    return jsonResponse({ alerts_checked: alerts.length, thresholds_crossed, immediate_sent, digest_queued, digest_sent });

  } catch (err: any) {
    return jsonResponse({ success: false, reason: err.message }, 500);
  }
});
