// PATCH /api/alerts/:id
// Body: { limit_usd?, warning_pct?, is_active? }
// limit_period is immutable — ignored if sent. When limit_usd changes: resets
// status = 'ok' and clears notification timestamps so n8n fires fresh.

// DELETE /api/alerts/:id
// Sets is_active = false (soft delete).

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { limit_usd, warning_pct, is_active } = body;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (limit_usd !== undefined) {
    updates.limit_usd = Number(limit_usd);
    // Reset notification state so n8n re-fires against the new limit
    updates.status = "ok";
    updates.warning_notified_at = null;
    updates.breach_notified_at = null;
  }
  if (warning_pct !== undefined) updates.warning_pct = Number(warning_pct);
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from("spend_alerts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabase
    .from("spend_alerts")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
