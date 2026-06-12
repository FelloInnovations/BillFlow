import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAgentsEnrichedTotal,
  getAgentsEnrichedPeriod,
  getAgentsPushedToHubspot,
  getAllEnrichedData,
  computeDemosBooked,
  computeDemosHeld,
  computeClosedWon,
  computeArrClosed,
} from "@/lib/hubspot-enrichment-outcomes";
import { getClosedWonStageIds } from "@/lib/hubspot-outcomes";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Returns the last day of each calendar month in [from, to], capped to `to`
function monthEndDates(from: string, to: string): string[] {
  const ends: string[] = [];
  let [y, mo] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && mo <= tm)) {
    const last = new Date(Date.UTC(y, mo, 0)).toISOString().substring(0, 10);
    ends.push(last <= to ? last : to);
    mo++;
    if (mo > 12) { mo = 1; y++; }
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

  // Single bulk HubSpot fetch + current all-time Supabase count
  const [snap, closedWonIds, { count: allTimeCount }] = await Promise.all([
    getAllEnrichedData(),
    getClosedWonStageIds(),
    getAgentsEnrichedTotal(),
  ]);

  type Row = {
    project_id: string;
    metric_key: string;
    value: number;
    date: string;
    source: string;
    contact_ids?: unknown;
  };
  const rows: Row[] = [];

  for (const endDate of monthEndDates(from, to)) {
    const [ey, em] = endDate.split("-").map(Number);
    const monthStartDate = `${String(ey).padStart(4, "0")}-${String(em).padStart(2, "0")}-01`;

    // agents_enriched_total: current all-time count (best available for historical months)
    rows.push({
      project_id: "enrichment",
      metric_key:  "agents_enriched_total",
      value:       allTimeCount,
      date:        endDate,
      source:      "backfill",
      contact_ids: null,
    });

    // agents_enriched_period: Supabase count for this month
    try {
      const { count } = await getAgentsEnrichedPeriod(monthStartDate, endDate);
      rows.push({
        project_id: "enrichment",
        metric_key:  "agents_enriched_period",
        value:       count,
        date:        endDate,
        source:      "backfill",
        contact_ids: null,
      });
    } catch {
      rows.push({ project_id: "enrichment", metric_key: "agents_enriched_period", value: 0, date: endDate, source: "backfill", contact_ids: null });
    }

    // agents_pushed_hubspot: HubSpot contacts with mad_id created in this month
    try {
      const { count, contactIds } = await getAgentsPushedToHubspot(endDate);
      rows.push({
        project_id:  "enrichment",
        metric_key:  "agents_pushed_hubspot",
        value:       count,
        date:        endDate,
        source:      "backfill",
        contact_ids: contactIds,
      });
    } catch {
      rows.push({ project_id: "enrichment", metric_key: "agents_pushed_hubspot", value: 0, date: endDate, source: "backfill" });
    }

    // HubSpot-based metrics from snapshot
    const booked = computeDemosBooked(snap, endDate);
    const held   = computeDemosHeld(snap, endDate);
    const won    = computeClosedWon(snap, endDate, closedWonIds);
    const arr    = computeArrClosed(snap, endDate, closedWonIds);

    rows.push(
      { project_id: "enrichment", metric_key: "demos_booked_mtd", value: booked.count, date: endDate, source: "backfill", contact_ids: booked.contactIds },
      { project_id: "enrichment", metric_key: "demos_held_mtd",   value: held.count,   date: endDate, source: "backfill", contact_ids: held.contactIds   },
      { project_id: "enrichment", metric_key: "closed_won_mtd",   value: won.count,    date: endDate, source: "backfill", contact_ids: won.contactIds    },
      { project_id: "enrichment", metric_key: "arr_closed_mtd",   value: arr.total,    date: endDate, source: "backfill", contact_ids: arr.arrPerContact  },
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
    months_processed:  monthEndDates(from, to).length,
    rows_attempted:    rows.length,
    rows_upserted:     upserted,
    errors,
  });
}
