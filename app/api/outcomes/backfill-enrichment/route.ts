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

function logErr(label: string, err: unknown) {
  console.error(
    `ENRICHMENT ERROR [${label}]:`,
    JSON.stringify(err, Object.getOwnPropertyNames(err instanceof Error ? err : new Error(String(err)))),
  );
}

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

  console.error(`ENRICHMENT INFO: backfill started from=${from} to=${to}`);

  // Single bulk HubSpot fetch + current all-time Supabase count
  let snap: Awaited<ReturnType<typeof getAllEnrichedData>>;
  let closedWonIds: string[];
  let allTimeCount: number;

  try {
    [snap, closedWonIds, { count: allTimeCount }] = await Promise.all([
      getAllEnrichedData(),
      getClosedWonStageIds(),
      getAgentsEnrichedTotal(),
    ]);
    console.error(`ENRICHMENT INFO: bulk fetch done — contacts=${snap.contactIds.length} closedWonStages=${closedWonIds.length} allTimeCount=${allTimeCount}`);
  } catch (err) {
    logErr("bulk fetch (getAllEnrichedData / getClosedWonStageIds / getAgentsEnrichedTotal)", err);
    return NextResponse.json(
      { error: "bulk fetch failed", detail: String(err) },
      { status: 500 },
    );
  }

  type Row = {
    project_id: string;
    metric_key: string;
    value: number;
    date: string;
    source: string;
    contact_ids?: unknown;
  };
  const rows: Row[] = [];
  const monthErrors: string[] = [];

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
      rows.push({ project_id: "enrichment", metric_key: "agents_enriched_period", value: count, date: endDate, source: "backfill", contact_ids: null });
    } catch (err) {
      logErr(`getAgentsEnrichedPeriod month=${endDate}`, err);
      monthErrors.push(`agents_enriched_period@${endDate}: ${String(err)}`);
      rows.push({ project_id: "enrichment", metric_key: "agents_enriched_period", value: 0, date: endDate, source: "backfill", contact_ids: null });
    }

    // agents_pushed_hubspot: HubSpot contacts with mad_id created in this month
    try {
      const { count, contactIds } = await getAgentsPushedToHubspot(endDate);
      rows.push({ project_id: "enrichment", metric_key: "agents_pushed_hubspot", value: count, date: endDate, source: "backfill", contact_ids: contactIds });
    } catch (err) {
      logErr(`getAgentsPushedToHubspot month=${endDate}`, err);
      monthErrors.push(`agents_pushed_hubspot@${endDate}: ${String(err)}`);
      rows.push({ project_id: "enrichment", metric_key: "agents_pushed_hubspot", value: 0, date: endDate, source: "backfill" });
    }

    // HubSpot-based metrics from snapshot
    try {
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
    } catch (err) {
      logErr(`compute metrics month=${endDate}`, err);
      monthErrors.push(`compute@${endDate}: ${String(err)}`);
    }
  }

  // Batch upsert
  const supabase = serviceClient();
  const BATCH = 100;
  let upserted = 0;
  const upsertErrors: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH) {
    try {
      const { error } = await supabase
        .from("project_outcome_metrics")
        .upsert(rows.slice(i, i + BATCH), { onConflict: "project_id,metric_key,date" });
      if (error) {
        logErr(`upsert batch i=${i}`, error);
        upsertErrors.push(error.message);
      } else {
        upserted += Math.min(BATCH, rows.length - i);
      }
    } catch (err) {
      logErr(`upsert batch i=${i}`, err);
      upsertErrors.push(String(err));
    }
  }

  const allErrors = [...monthErrors, ...upsertErrors];
  console.error(`ENRICHMENT INFO: backfill done — rows_attempted=${rows.length} upserted=${upserted} errors=${allErrors.length}`);

  return NextResponse.json({
    months_processed:  monthEndDates(from, to).length,
    rows_attempted:    rows.length,
    rows_upserted:     upserted,
    errors:            allErrors,
  });
}
