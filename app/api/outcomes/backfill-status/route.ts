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
  try {
    const supabase = serviceClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "enrichment_backfill_lock")
      .maybeSingle();
    if (error) return NextResponse.json({ running: false });
    return NextResponse.json({ running: data?.value === "locked" });
  } catch {
    return NextResponse.json({ running: false });
  }
}
