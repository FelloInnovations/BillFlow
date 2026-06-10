import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canonicalVendor } from "@/lib/utils";
import { SHARED_INFRA_CANONICAL, SHARED_TOOLING_CANONICAL } from "@/lib/project-expense";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  const secret = process.env.OUTCOMES_SYNC_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = serviceClient();

  const { data: rows, error } = await supabase
    .from("financial_records")
    .select("id, vendor_name")
    .is("cost_type", null)
    .not("vendor_name", "is", null)
    .not("vendor_name", "ilike", "%makemytrip%");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updates: { id: string; cost_type: string }[] = [];

  for (const row of rows ?? []) {
    const canonical = canonicalVendor(row.vendor_name as string);
    if (canonical === "OpenRouter") continue; // tracked via OR snapshots
    let cost_type: string;
    if (SHARED_INFRA_CANONICAL.has(canonical)) {
      cost_type = "shared_infrastructure";
    } else if (SHARED_TOOLING_CANONICAL.has(canonical)) {
      cost_type = "shared_tooling";
    } else {
      cost_type = "unallocated";
    }
    updates.push({ id: row.id as string, cost_type });
  }

  if (updates.length === 0) {
    return NextResponse.json({ categorized: 0 });
  }

  // Batch by cost_type to minimize round-trips
  const byType = new Map<string, string[]>();
  for (const u of updates) {
    const arr = byType.get(u.cost_type) ?? [];
    arr.push(u.id);
    byType.set(u.cost_type, arr);
  }

  const now = new Date().toISOString();
  let categorized = 0;
  for (const [cost_type, ids] of byType) {
    const { error: updateErr } = await supabase
      .from("financial_records")
      .update({ cost_type, allocated_at: now, allocated_by: "auto" })
      .in("id", ids);
    if (updateErr) console.error("[auto-categorize]", cost_type, updateErr.message);
    else categorized += ids.length;
  }

  return NextResponse.json({ categorized });
}
