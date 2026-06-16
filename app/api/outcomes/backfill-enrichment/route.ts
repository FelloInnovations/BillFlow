export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
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

async function acquireBackfillLock(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "enrichment_backfill_lock")
    .maybeSingle();

  if (data?.value === "locked") return false;

  await supabase
    .from("app_settings")
    .upsert(
      { key: "enrichment_backfill_lock", value: "locked", updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  return true;
}

async function releaseBackfillLock(supabase: SupabaseClient): Promise<void> {
  await supabase
    .from("app_settings")
    .upsert(
      { key: "enrichment_backfill_lock", value: "unlocked", updated_at: new Date().toISOString() },
      { onConflict: "key" },
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
  const { from, to, force } = body as { from?: string; to?: string; force?: boolean };

  const supabase = serviceClient();

  // Force-release the lock (for crash recovery)
  if (force) {
    await releaseBackfillLock(supabase);
    console.error("[backfill-enrichment] lock force-released");
    return NextResponse.json({ status: "lock_released" });
  }

  if (!from || !to || from > to) {
    return NextResponse.json({ error: "provide valid from and to (YYYY-MM-DD)" }, { status: 400 });
  }

  const acquired = await acquireBackfillLock(supabase);
  if (!acquired) {
    return NextResponse.json(
      { error: "Backfill already running. Wait for it to complete or use force=true to release the lock." },
      { status: 409 },
    );
  }

  // Auto-release safety net: if the backfill somehow runs >30 minutes, unlock regardless
  const autoRelease = setTimeout(async () => {
    try {
      await releaseBackfillLock(supabase);
      console.error("[backfill-enrichment] lock auto-released after 30m timeout");
    } catch { /* best-effort */ }
  }, 30 * 60 * 1000);

  // Fire and forget — return immediately while backfill runs in background
  runBackfill(supabase, from, to)
    .catch((err) => {
      console.error("[backfill-enrichment] run failed:", err?.message ?? err);
    })
    .finally(async () => {
      clearTimeout(autoRelease);
      try {
        await releaseBackfillLock(supabase);
        console.error("[backfill-enrichment] lock released");
      } catch (e) {
        console.error("[backfill-enrichment] failed to release lock:", e);
      }
    });

  return NextResponse.json({
    status:  "started",
    message: `Backfill started for ${from} to ${to}. Running in background — check Railway logs for progress.`,
    from,
    to,
  }, { status: 202 });
}

async function runBackfill(supabase: SupabaseClient, from: string, to: string) {
  console.error(`[backfill-enrichment] started from=${from} to=${to}`);

  let snap: Awaited<ReturnType<typeof getAllEnrichedData>>;
  let closedWonIds: string[];
  let allTimeCount: number;
  let allTimePushed: { count: number; contactIds: string[] };

  try {
    [snap, closedWonIds, { count: allTimeCount }, allTimePushed] = await Promise.all([
      getAllEnrichedData(),
      getClosedWonStageIds(),
      getAgentsEnrichedTotal(),
      getAgentsPushedToHubspot(null, null),
    ]);
    console.error(`[backfill-enrichment] bulk fetch done — contacts=${snap.contactIds.length} closedWonStages=${closedWonIds.length} allTimeCount=${allTimeCount} allTimePushed=${allTimePushed.count}`);
  } catch (err) {
    logErr("bulk fetch", err);
    throw err;
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

    console.error(`[backfill-enrichment] processing month ${endDate.substring(0, 7)}`);

    rows.push({
      project_id: "enrichment",
      metric_key:  "agents_enriched_total",
      value:       allTimeCount,
      date:        endDate,
      source:      "backfill",
      contact_ids: null,
    });

    rows.push({
      project_id: "enrichment",
      metric_key:  "agents_pushed_hubspot_total",
      value:       allTimePushed.count,
      date:        endDate,
      source:      "backfill",
      contact_ids: allTimePushed.contactIds,
    });

    try {
      const { count } = await getAgentsEnrichedPeriod(monthStartDate, endDate);
      rows.push({ project_id: "enrichment", metric_key: "agents_enriched_period", value: count, date: endDate, source: "backfill", contact_ids: null });
    } catch (err) {
      logErr(`getAgentsEnrichedPeriod month=${endDate}`, err);
      monthErrors.push(`agents_enriched_period@${endDate}: ${String(err)}`);
      rows.push({ project_id: "enrichment", metric_key: "agents_enriched_period", value: 0, date: endDate, source: "backfill", contact_ids: null });
    }

    try {
      const { count, contactIds } = await getAgentsPushedToHubspot(monthStartDate, endDate);
      rows.push({ project_id: "enrichment", metric_key: "agents_pushed_hubspot", value: count, date: endDate, source: "backfill", contact_ids: contactIds });
    } catch (err) {
      logErr(`getAgentsPushedToHubspot month=${endDate}`, err);
      monthErrors.push(`agents_pushed_hubspot@${endDate}: ${String(err)}`);
      rows.push({ project_id: "enrichment", metric_key: "agents_pushed_hubspot", value: 0, date: endDate, source: "backfill" });
    }

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
  console.error(`[backfill-enrichment] complete — rows_attempted=${rows.length} upserted=${upserted} errors=${allErrors.length}`);
}
