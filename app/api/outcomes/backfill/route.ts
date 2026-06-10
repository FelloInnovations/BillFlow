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

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + "T00:00:00Z");
  const end = new Date(to   + "T00:00:00Z");
  while (cur <= end) {
    dates.push(cur.toISOString().substring(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
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

  type Row = { project_id: string; metric_key: string; value: number; date: string; source: string };
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

    // Use hs_timestamp (actual meeting time) not createdate (record creation time)
    const demosBooked = snap.meetings.filter(
      (m) => m.outcome === "SCHEDULED" && m.timestamp >= mStart && m.timestamp <= mEnd,
    ).length;

    const demosHeld = snap.meetings.filter(
      (m) => m.outcome === "COMPLETED" && m.timestamp >= mStart && m.timestamp <= mEnd,
    ).length;

    // This portal uses numeric stage IDs; closedWonIds resolved from /crm/v3/pipelines/deals
    const wonDeals = snap.deals.filter(
      (d) => closedWonIds.includes(d.stage) && d.closedate != null && d.closedate >= mStart && d.closedate <= mEnd,
    );

    const wonContactIds = new Set(wonDeals.flatMap((d) => d.contactIds));
    const arrClosed = snap.contacts
      .filter((c) => wonContactIds.has(c.id))
      .reduce((sum, c) => sum + c.arr, 0);

    rows.push(
      { project_id: "arthur", metric_key: "demos_booked_mtd", value: demosBooked, date: endDate, source: "backfill" },
      { project_id: "arthur", metric_key: "demos_held_mtd",   value: demosHeld,   date: endDate, source: "backfill" },
      { project_id: "arthur", metric_key: "closed_won_mtd",   value: wonDeals.length, date: endDate, source: "backfill" },
      { project_id: "arthur", metric_key: "arr_closed_mtd",   value: arrClosed,   date: endDate, source: "backfill" },
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

  return NextResponse.json({
    contacts_found:    snap.contacts.length,
    dates_with_traffic: dailyMap.size,
    months_processed:  monthEndDates(from, to).length,
    rows_upserted:     upserted,
    errors,
  });
}
