import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getLlmTrafficCount,
  getBlogTrafficCount,
  getDemosBookedMtd,
  getDemosHeldMtd,
  getClosedWonMtd,
  getArrClosedMtd,
} from "@/lib/hubspot-outcomes";
import { OutcomeSyncResult } from "@/types";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const secret = process.env.OUTCOMES_SYNC_SECRET;
  const provided =
    req.headers.get("x-sync-secret") ?? req.nextUrl.searchParams.get("secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // yesterday in UTC
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = yesterday.toISOString().substring(0, 10);

  const METRICS: {
    key: string;
    fn: (d: Date) => Promise<number>;
  }[] = [
    { key: "llm_traffic_daily",  fn: getLlmTrafficCount },
    { key: "blog_traffic_daily", fn: getBlogTrafficCount },
    { key: "demos_booked_mtd",   fn: getDemosBookedMtd },
    { key: "demos_held_mtd",     fn: getDemosHeldMtd },
    { key: "closed_won_mtd",     fn: getClosedWonMtd },
    { key: "arr_closed_mtd",     fn: getArrClosedMtd },
  ];

  const supabase = serviceClient();
  const result: OutcomeSyncResult = { date: dateStr, upserted: [], errors: [] };

  for (const { key, fn } of METRICS) {
    try {
      const value = await fn(yesterday);
      const { error } = await supabase.from("project_outcome_metrics").upsert(
        {
          project_id: "arthur",
          metric_key: key,
          value,
          date: dateStr,
          source: "hubspot",
        },
        { onConflict: "project_id,metric_key,date" },
      );
      if (error) throw new Error(error.message);
      result.upserted.push({ metric_key: key, value });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[outcomes/sync] ${key}:`, msg);
      result.errors.push({ metric_key: key, error: msg });
    }
  }

  return NextResponse.json(result);
}
