import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  const { data } = await supabase
    .from("openrouter_usage_snapshots")
    .select("snapshot_at")
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .single();
  return NextResponse.json({ last_synced_at: data?.snapshot_at ?? null });
}
