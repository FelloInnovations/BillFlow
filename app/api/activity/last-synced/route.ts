import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  const { data: snapData } = await supabase
    .from("openrouter_usage_snapshots")
    .select("snapshot_at")
    .not("snapshot_at", "is", null)
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .single();

  if (snapData?.snapshot_at) {
    return NextResponse.json({ last_synced_at: snapData.snapshot_at });
  }

  const { data: logData } = await supabase
    .from("api_invocation_logs")
    .select("invoked_at")
    .order("invoked_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ last_synced_at: logData?.invoked_at ?? null });
}
