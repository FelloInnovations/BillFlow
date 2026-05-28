import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("project_guardrails")
    .select("*")
    .order("project_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { project_name, monthly_budget_usd, warning_threshold_pct } = body;

  if (!project_name) {
    return NextResponse.json({ error: "project_name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("project_guardrails")
    .upsert(
      {
        project_name,
        monthly_budget_usd: monthly_budget_usd ?? null,
        warning_threshold_pct: warning_threshold_pct ?? 80,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_name" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const project_name = searchParams.get("project_name");
  if (!project_name) return NextResponse.json({ error: "project_name required" }, { status: 400 });

  const { error } = await supabase
    .from("project_guardrails")
    .delete()
    .eq("project_name", project_name);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
