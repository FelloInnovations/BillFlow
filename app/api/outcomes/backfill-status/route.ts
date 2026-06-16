export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET() {
  const supabase = serviceClient();
  const { data } = await supabase
    .from("project_outcome_metrics")
    .select("value")
    .eq("project_id", "enrichment")
    .eq("metric_key", "backfill_lock")
    .maybeSingle();

  return NextResponse.json({ running: data?.value === 1 });
}
