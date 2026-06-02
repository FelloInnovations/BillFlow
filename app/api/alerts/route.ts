// GET  /api/alerts
// Returns all active alerts with their current status from spend_alerts table.
// n8n writes current_spend, current_pct, status, last_checked_at —
// this route just reads and returns them.

// POST /api/alerts
// Body: { project_name, openrouter_key_name, limit_usd, warning_pct? }
// Upserts on project_name. Sets status = 'ok', current_spend = 0 on create.
// limit_period is always 'monthly' — not user-configurable.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("spend_alerts")
    .select("*")
    .eq("is_active", true)
    .order("project_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { project_name, openrouter_key_name, limit_usd, warning_pct = 80 } = body;
  // Always monthly — period is not user-configurable
  const limit_period = 'monthly';

  if (!project_name || !openrouter_key_name || !limit_usd) {
    return NextResponse.json(
      { error: "project_name, openrouter_key_name, limit_usd are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("spend_alerts")
    .upsert(
      {
        project_name,
        openrouter_key_name,
        limit_usd: Number(limit_usd),
        limit_period,
        warning_pct: Number(warning_pct),
        status: "ok",
        current_spend: 0,
        current_pct: 0,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_name" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
