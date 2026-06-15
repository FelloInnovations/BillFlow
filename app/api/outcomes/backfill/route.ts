import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAllAiReferralData, getClosedWonStageIds } from "@/lib/hubspot-outcomes";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Returns the last day of each calendar month covered by [from, to],
// capped to `to` for the final (possibly partial) month.
function monthEndDates(from: string, to: string): string[] {
  const ends: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    // day 0 of month m+1 == last day of month m
    const last = new Date(Date.UTC(y, m, 0)).toISOString().substring(0, 10);
    ends.push(last <= to ? last : to);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return ends;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-sync-secret");
  if (secret !== process.env.OUTCOMES_SYNC_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { from, to } = body as { from?: string; to?: string };

  if (!from || !to || from > to) {
    return NextResponse.json({ error: "provide valid from and to (YYYY-MM-DD)" }, { status: 400 });
  }

  // Fire and forget — return immediately while backfill runs in background
  runBackfill(from, to).catch((err) => {
    console.error("[backfill] background error:", err?.message ?? err);
  });

  return NextResponse.json({
    status:  "started",
    message: `Backfill started for ${from} to ${to}. Running in background — check Railway logs for progress.`,
    from,
    to,
  }, { status: 202 });
}

async function runBackfill(from: string, to: string) {
  console.error(`[backfill] started from=${from} to=${to}`);

  // Single bulk fetch from HubSpot — no per-date calls
  const [snap, closedWonIds] = await Promise.all([
    getAllAiReferralData(),
    getClosedWonStageIds(),
  ]);

  // Tally daily contact arrivals per date
  const dailyMap = new Map<string, { chatgpt: number; perplexity: number; claude: number; other: number }>();
  for (const c of snap.contacts) {
    const date = c.createdate.substring(0, 10);
    if (!date || date < from || date > to) continue;
    const prev = dailyMap.get(date) ?? { chatgpt: 0, perplexity: 0, claude: 0, other: 0 };
    prev[c.platform]++;
    dailyMap.set(date, prev);
  }

  type Row = { project_id: string; metric_key: string; value: number; date: string; source: string; contact_ids?: unknown };
  const rows: Row[] = [];

  // Daily traffic rows (only dates with actual traffic)
  for (const [date, d] of dailyMap) {
    const total = d.chatgpt + d.perplexity + d.claude + d.other;
    rows.push(
      { project_id: "arthur", metric_key: "llm_traffic_daily",    value: total,        date, source: "backfill" },
      { project_id: "arthur", metric_key: "llm_chatgpt_daily",    value: d.chatgpt,    date, source: "backfill" },
      { project_id: "arthur", metric_key: "llm_perplexity_daily", value: d.perplexity, date, source: "backfill" },
      { project_id: "arthur", metric_key: "llm_claude_daily",     value: d.claude,     date, source: "backfill" },
      { project_id: "arthur", metric_key: "llm_other_daily",      value: d.other,      date, source: "backfill" },
    );
  }

  // MTD snapshot rows — one per month-end in range, computed in memory
  for (const endDate of monthEndDates(from, to)) {
    const [ey, em, ed] = endDate.split("-").map(Number);
    const mStart = Date.UTC(ey, em - 1, 1, 0, 0, 0, 0);
    const mEnd   = Date.UTC(ey, em - 1, ed, 23, 59, 59, 999);

    console.error(`[backfill] processing month ${endDate.substring(0, 7)}`);

    // Use hs_timestamp (actual meeting time) not createdate (record creation time)
    const bookedMeetingIds = new Set(
      snap.meetings
        .filter((m) => m.outcome === "SCHEDULED" && m.timestamp >= mStart && m.timestamp <= mEnd)
        .map((m) => m.id),
    );
    const demosBooked = bookedMeetingIds.size;
    const bookedContactIds = [...snap.contactMeetingMap.entries()]
      .filter(([, mids]) => mids.some((mid) => bookedMeetingIds.has(mid)))
      .map(([cid]) => cid);

    const heldMeetingIds = new Set(
      snap.meetings
        .filter((m) => m.outcome === "COMPLETED" && m.timestamp >= mStart && m.timestamp <= mEnd)
        .map((m) => m.id),
    );
    const demosHeld = heldMeetingIds.size;
    const heldContactIds = [...snap.contactMeetingMap.entries()]
      .filter(([, mids]) => mids.some((mid) => heldMeetingIds.has(mid)))
      .map(([cid]) => cid);

    // This portal uses numeric stage IDs; closedWonIds resolved from /crm/v3/pipelines/deals
    const wonDeals = snap.deals.filter(
      (d) => closedWonIds.includes(d.stage) && d.closedate != null && d.closedate >= mStart && d.closedate <= mEnd,
    );

    const closedWonContactIds = [...new Set(wonDeals.flatMap((d) => d.contactIds))];

    // Sum deal amount directly — AI-referral contacts typically lack current_arr__sync_
    const arrClosed = wonDeals.reduce((sum, d) => sum + d.amount, 0);
    const arrPerContact: Record<string, number> = {};
    for (const d of wonDeals) {
      const share = d.contactIds.length > 0 ? d.amount / d.contactIds.length : 0;
      for (const cid of d.contactIds) {
        arrPerContact[cid] = (arrPerContact[cid] ?? 0) + share;
      }
    }

    rows.push(
      { project_id: "arthur", metric_key: "demos_booked_mtd", value: demosBooked,      date: endDate, source: "backfill", contact_ids: bookedContactIds },
      { project_id: "arthur", metric_key: "demos_held_mtd",   value: demosHeld,        date: endDate, source: "backfill", contact_ids: heldContactIds   },
      { project_id: "arthur", metric_key: "closed_won_mtd",   value: wonDeals.length,  date: endDate, source: "backfill", contact_ids: closedWonContactIds },
      { project_id: "arthur", metric_key: "arr_closed_mtd",   value: arrClosed,        date: endDate, source: "backfill", contact_ids: Object.keys(arrPerContact).length > 0 ? arrPerContact : null },
    );
  }

  // Batch upsert
  const supabase = serviceClient();
  const BATCH = 100;
  let upserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from("project_outcome_metrics")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "project_id,metric_key,date" });
    if (error) errors.push(error.message);
    else upserted += Math.min(BATCH, rows.length - i);
  }

  console.error(`[backfill] complete — contacts=${snap.contacts.length} dates_with_traffic=${dailyMap.size} months=${monthEndDates(from, to).length} rows_upserted=${upserted} errors=${errors.length}`);
}
